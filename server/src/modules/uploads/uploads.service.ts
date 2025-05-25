import { 
  Injectable, 
  Logger, 
  BadRequestException, 
  NotFoundException, 
  Inject, 
  forwardRef 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Video, VideoDocument, VideoStatus } from '../../schemas/video.schema';
import { promisify } from 'util';
import { createReadStream, unlink, existsSync } from 'fs';
import { TranscriptionService } from '../transcription/transcription.service';

type CreateVideoDto = {
  title: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
};

type VideoStream = {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  size: number;
};

const unlinkAsync = promisify(unlink);

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly MAX_FILE_SIZE: number;
  private readonly UPLOAD_PATH: string;

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    @Inject(forwardRef(() => TranscriptionService))
    private transcriptionService: TranscriptionService,
  ) {
    this.MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10); // 1GB default
    this.UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';
  }

  async createVideo(createVideoDto: CreateVideoDto): Promise<VideoDocument> {
    try {
      // Validate file exists
      if (!existsSync(createVideoDto.path)) {
        throw new BadRequestException('Video file not found');
      }

      if (createVideoDto.size > this.MAX_FILE_SIZE) {
        throw new BadRequestException(`File size exceeds the maximum allowed size of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      const video = new this.videoModel({
        ...createVideoDto,
        status: VideoStatus.UPLOADED,
        metadata: {},
      });
      
      await video.save();
      
      // Start transcription process in the background
      this.startTranscriptionProcess(video);
      
      return video;
    } catch (error) {
      this.logger.error('Error creating video:', error);
      throw error;
    }
  }

  private async startTranscriptionProcess(video: VideoDocument): Promise<void> {
    try {
      // @ts-ignore - processVideo is private but we need to call it
      await this.transcriptionService['processVideo'](video);
      await this.updateVideoStatus(video._id.toString(), VideoStatus.PROCESSING);
    } catch (error) {
      const videoId = video._id?.toString?.() || 'unknown';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error starting transcription for video ${videoId}:`, error);
      await this.updateVideoStatus(
        videoId,
        VideoStatus.FAILED,
        errorMessage
      );
    }
  }

  async getVideo(id: string): Promise<VideoDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid video ID');
    }
    
    const video = await this.videoModel.findById(id).exec();
    if (!video) {
      throw new NotFoundException(`Video with ID ${id} not found`);
    }
    
    return video;
  }

  async getVideos(): Promise<VideoDocument[]> {
    return this.videoModel.find().sort({ createdAt: -1 }).exec();
  }

  async updateVideoStatus(
    id: string,
    status: VideoStatus,
    error?: string,
  ): Promise<VideoDocument> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid video ID');
      }

      const update: Partial<Video> = { 
        status,
        ...(error && { error })
      };

      const video = await this.videoModel.findByIdAndUpdate(id, update, { new: true }).exec();
      
      if (!video) {
        throw new NotFoundException(`Video with ID ${id} not found`);
      }
      
      return video;
    } catch (error) {
      this.logger.error(`Error updating video status for ID ${id}:`, error);
      throw error;
    }
  }

  async deleteVideo(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid video ID');
      }

      const video = await this.videoModel.findByIdAndDelete(id).exec();
      
      if (video?.path) {
        try {
          await unlinkAsync(video.path);
        } catch (err) {
          this.logger.error(`Failed to delete video file: ${video.path}`, err);
          // Don't fail the operation if file deletion fails
        }
      }
    } catch (error) {
      this.logger.error(`Error deleting video ${id}:`, error);
      throw error;
    }
  }

  async getVideoStream(id: string): Promise<VideoStream> {
    const video = await this.getVideo(id);
    
    if (!existsSync(video.path)) {
      throw new NotFoundException('Video file not found on disk');
    }
    
    return {
      stream: createReadStream(video.path),
      mimeType: video.mimeType,
      size: video.size,
    };
  }
}
