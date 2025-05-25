import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { IVideo, ITranscriptSegment, IQuestion } from '../uploads/types';

type ProcessingStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'TRANSCRIBING' | 'GENERATING_QUESTIONS' | 'COMPLETED' | 'FAILED';

const SEGMENT_DURATION = 5 * 60; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

@Injectable()
export class TranscriptionService implements OnModuleInit {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly transcriptionServiceUrl: string;

  constructor(
    @InjectModel('Video') private videoModel: Model<IVideo>,
    @InjectModel('TranscriptSegment') private segmentModel: Model<ITranscriptSegment>,
    @InjectModel('Question') private questionModel: Model<IQuestion>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    this.transcriptionServiceUrl = this.configService.get('TRANSCRIPTION_SERVICE_URL', 'http://localhost:8000');
  }

  onModuleInit() {
    this.eventEmitter.on('video.uploaded', (video: IVideo) => 
      this.processVideo(video).catch(error => 
        this.handleError(
          `Error processing video ${video._id}`, 
          error, 
          async () => {
            await this.updateVideoStatus(video._id, 'FAILED', error.message);
          }
        )
      )
    );
  }

  private async updateVideoStatus(videoId: Types.ObjectId | string, status: ProcessingStatus, error?: string) {
    const update: any = { status };
    if (error) update.error = error;
    return this.videoModel.findByIdAndUpdate(videoId, update);
  }

  async processFileDirectly(file: Express.Multer.File): Promise<string> {
    try {
      // Save the file temporarily
      const tempPath = path.join(process.cwd(), 'temp', file.originalname);
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, file.buffer);
      
      // Call the transcription service
      const response = await axios.post(
        `${this.transcriptionServiceUrl}/transcribe`,
        { file_path: tempPath },
        { headers: { 'Content-Type': 'application/json' } }
      );

      // Clean up the temporary file
      await fs.unlink(tempPath).catch(error => 
        this.logger.warn(`Failed to delete temporary file: ${tempPath}`, error)
      );

      return response.data.transcription;
    } catch (error) {
      this.logger.error('Error processing file directly', error);
      throw new HttpException(
        'Failed to process file',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async processVideo(video: IVideo): Promise<void> {
    const videoId = video._id;
    await this.updateVideoStatus(videoId, 'PROCESSING');
    await this.transcribeVideo(video);
    await this.segmentTranscript(videoId);
    await this.generateQuestionsForVideo(videoId);
    await this.updateVideoStatus(videoId, 'COMPLETED');
    this.logger.log(`Successfully processed video ${videoId}`);
  }

  /**
   * Start transcription for a video by ID
   * @param videoId The ID of the video to transcribe
   * @returns The transcription result
   */
  async startTranscription(videoId: string): Promise<any> {
    const video = await this.videoModel.findById(videoId).exec();
    if (!video) {
      throw new Error(`Video with ID ${videoId} not found`);
    }
    
    await this.transcribeVideo(video);
    return { message: 'Transcription started successfully', videoId };
  }

  private async transcribeVideo(video: IVideo): Promise<void> {
    const videoId = video._id;
    try {
      this.logger.log(`Starting transcription for video ${videoId}`);
      await this.updateVideoStatus(videoId, 'TRANSCRIBING');

      if (!await this.fileExists(video.path)) {
        throw new Error(`Video file not found at path: ${video.path}`);
      }

      const transcript = await this.transcribeAudio(video.path);
      
      await this.videoModel.findByIdAndUpdate(videoId, {
        $set: { 'metadata.transcript': transcript },
        updatedAt: new Date(),
      });

      this.logger.log(`Completed transcription for video ${videoId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transcription';
      this.logger.error(`Transcription failed for video ${videoId}:`, errorMessage);
      throw new Error(`Transcription failed: ${errorMessage}`);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async transcribeAudio(filePath: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const file = await fs.readFile(filePath);
        const formData = new FormData();
        formData.append('file', new Blob([file]), path.basename(filePath));

        const { data } = await axios.post<{ text: string }>(
          `${this.transcriptionServiceUrl}/transcribe`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }
        );
        return data.text;
      } catch (error) {
        if (attempt === MAX_RETRIES) throw new Error(`Transcription failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
    throw new Error('Transcription failed after multiple attempts');
  }

  public async segmentTranscript(videoId: Types.ObjectId | string): Promise<void> {
    this.logger.log(`Segmenting transcript for video ${videoId}`);
    
    const video = await this.videoModel.findById(videoId).exec();
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const { metadata } = video;
    const transcript = metadata?.transcript;
    const duration = metadata?.duration || 0;
    
    if (!transcript) {
      throw new Error(`No transcript found for video ${videoId}`);
    }

    if (duration <= 0) {
      throw new Error(`Invalid video duration: ${duration}`);
    }

    try {
      const segmentCount = Math.ceil(duration / SEGMENT_DURATION);
      const words = transcript.split(/\s+/);
      const wordsPerSegment = Math.ceil(words.length / segmentCount);
      const segments: Omit<ITranscriptSegment, keyof Document>[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const startTime = i * SEGMENT_DURATION;
        const endTime = Math.min((i + 1) * SEGMENT_DURATION, duration);
        const startWord = i * wordsPerSegment;
        const endWord = Math.min((i + 1) * wordsPerSegment, words.length);
        const segmentText = words.slice(startWord, endWord).join(' ');

        
        const segment = new this.segmentModel({
          videoId: new Types.ObjectId(videoId),
          index: i,
          startTime,
          endTime,
          text: segmentText || `Segment ${i + 1} of ${segmentCount}`,
          status: 'PENDING' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        
        segments.push(segment);
      }

      if (segments.length > 0) {
        await this.segmentModel.insertMany(segments);
        this.logger.log(`Created ${segments.length} segments for video ${videoId}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error segmenting transcript for video ${videoId}:`, errorMessage);
      throw new Error(`Failed to segment transcript: ${errorMessage}`);
    }
  }

  /**
   * Generate questions for a video
   * @param videoId The ID of the video to generate questions for
   */
  /**
   * Get the transcript for a video
   * @param videoId The ID of the video to get the transcript for
   * @returns The transcript text
   */
  async getTranscript(videoId: string): Promise<string> {
    const video = await this.videoModel.findById(videoId).lean().exec();
    if (!video) throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
    return (video as IVideo).metadata?.transcript || '';
  }

  async getQuestions(videoId: string): Promise<any[]> {
    return this.questionModel.find({ videoId: new Types.ObjectId(videoId) }).exec();
  }

  public async generateQuestionsForVideo(videoId: Types.ObjectId | string): Promise<void> {
    const segments = await this.segmentModel.find({ videoId }).sort('index');
    if (!segments.length) return;

    for (const segment of segments) {
      try {
        await this.segmentModel.findByIdAndUpdate(segment._id, { status: 'PROCESSING' });
        const questions = await this.generateQuestions(segment.text);
        
        if (questions.length) {
          const questionDocs = questions.map((q, i) => ({
            videoId: segment.videoId,
            segmentId: segment._id,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            order: i,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
          
          await this.questionModel.insertMany(questionDocs);
        }
        
        await this.segmentModel.findByIdAndUpdate(segment._id, { status: 'COMPLETED' });
      } catch (error) {
        await this.handleError(`Error in segment ${segment._id}`, error, async () => {
          await this.segmentModel.findByIdAndUpdate(segment._id, {
            status: 'FAILED',
            error: error.message,
          }).exec();
        });
      }
    }
  }

  public async generateQuestions(text: string): Promise<IQuestion[]> {
    if (!text.trim()) return [];
    
    const response = await axios.post<{ questions: IQuestion[] }>(
      `${this.transcriptionServiceUrl}/generate-mcq`,
      { text },
      { 
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data.questions || [];
  }

  private async handleError(context: string, error: any, cleanup?: () => Promise<void>): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`${context}: ${message}`, error.stack);
    if (cleanup) await cleanup().catch(e => this.logger.error('Cleanup failed:', e));
    throw error;
  }

  /**
   * Get all transcript segments for a video
   * @param videoId The ID of the video to get segments for
   * @returns Array of transcript segments
   */
  async getSegments(videoId: string) {
    const segments = await this.segmentModel
      .find({ videoId: new Types.ObjectId(videoId) })
      .sort({ startTime: 1 })
      .exec();
    
    if (!segments.length) {
      throw new HttpException('No segments found for this video', HttpStatus.NOT_FOUND);
    }

    return segments;
  }

}
