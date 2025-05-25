import { 
  Controller, 
  Post, 
  UseInterceptors, 
  UploadedFile, 
  Get, 
  Param, 
  Res, 
  NotFoundException, 
  Delete,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadsService } from './uploads.service';
import { VideoDocument } from '../../schemas/video.schema';
import { VideoStatus } from '../../schemas/video.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/webm',
  'video/mpeg',
  'video/3gpp',
  'video/3gpp2'
];

@ApiTags('videos')
@Controller('api/videos')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);
  private readonly maxFileSize = MAX_FILE_SIZE;

  constructor(private readonly uploadsService: UploadsService) {}

  private validateFileType(file: Express.Multer.File): boolean {
    return ALLOWED_MIME_TYPES.includes(file.mimetype);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a video file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file format or size' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<VideoDocument> {
    try {
      this.logger.log(`Uploading file: ${file.originalname}`);
      
      // Validate file size
      if (file.size > this.maxFileSize) {
        throw new BadRequestException(`File is too large. Maximum size is ${this.maxFileSize} bytes.`);
      }

      // Validate file type
      if (!this.validateFileType(file)) {
        throw new BadRequestException(
          `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
        );
      }
      
      const video = await this.uploadsService.createVideo({
        title: file.originalname,
        filename: file.filename,
        path: file.path,
        mimeType: file.mimetype,
        size: file.size,
      });

      return video;
    } catch (error) {
      this.logger.error(`Error uploading file: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video metadata' })
  @ApiResponse({ status: 200, description: 'Video metadata retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async getVideo(@Param('id') id: string): Promise<VideoDocument> {
    try {
      const video = await this.uploadsService.getVideo(id);
      if (!video) {
        throw new NotFoundException('Video not found');
      }
      return video;
    } catch (error) {
      this.logger.error(`Error getting video ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id/stream')
  @ApiOperation({ summary: 'Stream video content' })
  @ApiResponse({ status: 200, description: 'Video stream started' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async streamVideo(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const video = await this.uploadsService.getVideo(id);
      if (!video) {
        throw new NotFoundException('Video not found');
      }

      const videoStream = await this.uploadsService.getVideoStream(id);
      
      res.set({
        'Content-Type': videoStream.mimeType,
        'Content-Length': videoStream.size,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${video.filename}"`,
      });
      
      videoStream.stream.pipe(res);
    } catch (error) {
      this.logger.error(`Error streaming video ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a video' })
  @ApiResponse({ status: 200, description: 'Video deleted successfully' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async deleteVideo(@Param('id') id: string): Promise<{ success: boolean }> {
    try {
      const video = await this.uploadsService.getVideo(id);
      if (!video) {
        throw new NotFoundException('Video not found');
      }
      await this.uploadsService.deleteVideo(id);
      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting video ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all videos' })
  @ApiResponse({ status: 200, description: 'List of videos retrieved successfully' })
  async listVideos(): Promise<VideoDocument[]> {
    try {
      return await this.uploadsService.getVideos();
    } catch (error) {
      this.logger.error('Error listing videos:', error);
      throw error;
    }
  }
}
