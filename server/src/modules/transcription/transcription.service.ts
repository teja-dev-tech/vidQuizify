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
    try {
      await this.updateVideoStatus(videoId, 'PROCESSING');
      await this.transcribeVideo(video);
      await this.segmentTranscript(videoId);
      await this.generateQuestionsForVideo(videoId);
      await this.updateVideoStatus(videoId, 'COMPLETED');
      this.logger.log(`Successfully processed video ${videoId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing video ${videoId}:`, errorMessage);
      await this.updateVideoStatus(videoId, 'FAILED', errorMessage);
      throw error;
    }
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

      const { text: transcript, duration } = await this.transcribeAudio(video.path);
      
      await this.videoModel.findByIdAndUpdate(videoId, {
        $set: { 
          'metadata.transcript': transcript,
          'metadata.duration': duration
        },
        updatedAt: new Date(),
      });

      this.logger.log(`Completed transcription for video ${videoId} with duration ${duration} seconds`);
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

  private async transcribeAudio(filePath: string): Promise<{ text: string; duration: number }> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const file = await fs.readFile(filePath);
        const formData = new FormData();
        formData.append('file', new Blob([file]), path.basename(filePath));

        const { data } = await axios.post<{ text: string; duration: number }>(
          `${this.transcriptionServiceUrl}/transcribe`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }
        );
        return { text: data.text, duration: data.duration };
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

    const transcript = video.metadata?.transcript;
    const duration = video.metadata?.duration || 0;
    
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

  private async generateQuestionsForVideo(videoId: Types.ObjectId | string): Promise<void> {
    const videoObjectId = typeof videoId === 'string' ? new Types.ObjectId(videoId) : videoId;

    // First, update any PENDING segments to COMPLETED
    await this.segmentModel.updateMany(
      { 
        videoId: videoObjectId,
        status: 'PENDING',
        text: { $exists: true, $ne: '' }
      },
      { $set: { status: 'COMPLETED', updatedAt: new Date() } }
    );

    const segments = await this.segmentModel
      .find({ 
        videoId: videoObjectId,
        status: { $in: ['COMPLETED', 'PENDING'] },
        text: { $exists: true, $ne: '' }
      })
      .sort('index')
      .lean<Array<ITranscriptSegment & { _id: Types.ObjectId }>>();

    if (!segments.length) {
      this.logger.warn(`No valid segments found for video ${videoObjectId}`);
      return;
    }

    this.logger.log(`Generating questions for ${segments.length} segments of video ${videoObjectId}`);

    for (const segment of segments) {
      try {
        await this.segmentModel.findByIdAndUpdate(segment._id, { 
          status: 'GENERATING_QUESTIONS',
          updatedAt: new Date() 
        });
        
        this.logger.log(`Generating questions for segment ${segment._id} of video ${videoObjectId}`);
        const questions = await this.generateQuestions(segment.text, videoObjectId, segment._id);
        
        if (questions && questions.length > 0) {
          const questionDocs = questions.map((q, i) => {
            const options = Array.isArray(q.options) 
              ? q.options.slice(0, 4).map(opt => String(opt || '').trim()).filter(Boolean)
              : [];
              
            // Ensure we have at least 2 options
            if (options.length < 2) {
              this.logger.warn(`Skipping question at index ${i}: not enough valid options`);
              return null;
            }
            
            // Ensure correctAnswer is within bounds
            const correctAnswer = Math.max(0, Math.min(
              typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
              options.length - 1
            ));
            
            const questionDoc = new this.questionModel({
              question: String(q.question || '').trim(),
              options: options,
              correctAnswer: correctAnswer,
              explanation: String(q.explanation || '').trim(),
              videoId: videoObjectId,
              segmentId: segment._id,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            return questionDoc;
          }).filter(Boolean);
          
          await this.questionModel.insertMany(questionDocs);
          this.logger.log(`Saved ${questionDocs.length} questions for segment ${segment._id}`);
        } else {
          this.logger.warn(`No questions generated for segment ${segment._id}`);
        }
        
        await this.segmentModel.findByIdAndUpdate(segment._id, { 
          status: 'COMPLETED',
          updatedAt: new Date()
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error processing segment ${segment._id}: ${errorMessage}`, error.stack);
        
        await this.segmentModel.findByIdAndUpdate(segment._id, {
          status: 'FAILED',
          error: errorMessage,
          updatedAt: new Date()
        });
      }
    }
    
    // Verify questions were saved
    const savedQuestions = await this.questionModel.countDocuments({ videoId: videoObjectId });
    this.logger.log(`Total questions saved for video ${videoObjectId}: ${savedQuestions}`);
  }

  private async generateQuestions(
    text: string,
    videoId: Types.ObjectId | string,
    segmentId: Types.ObjectId | string
  ): Promise<IQuestion[]> {
    if (!text.trim()) {
      this.logger.warn('Empty text provided for question generation');
      return [];
    }
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`Generating questions (attempt ${attempt}/${MAX_RETRIES})`);
        
        // Log the request payload
        const requestPayload = { 
          text: `${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
          num_questions: 3,
          video_id: videoId.toString()
        };
        this.logger.log(`Sending request to FastAPI: ${JSON.stringify(requestPayload)}`);
        
        // Make the request with a longer timeout and better error handling
        const response = await axios({
          method: 'post',
          url: `${this.transcriptionServiceUrl}/generate-mcq`,
          data: { 
            text, 
            num_questions: 3,
            video_id: videoId.toString()
          },
          timeout: 3600000, // 1 hour timeout
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          validateStatus: (status: number): boolean => status < 500
        });
        
        // Log the raw response status and data
        this.logger.log(`Response status: ${response.status}`);
        const responseData = response.data ? JSON.stringify(response.data).substring(0, 500) : 'No data';
        this.logger.log(`Raw response data: ${responseData}`);
        
        // Handle non-200 responses
        if (response.status !== 200) {
          throw new Error(`API returned status ${response.status}: ${response.statusText}`);
        }
        
        // Extract questions from the response
        const responseDataObj = response.data || {};
        let questions: any[] = [];
        
        // Log the raw response structure for debugging
        this.logger.debug(`Response data type: ${typeof responseDataObj}`);
        this.logger.debug(`Response data: ${JSON.stringify(responseDataObj, null, 2)}`);
        
        try {
          // Check if response has the expected format
          if (responseDataObj.questions && Array.isArray(responseDataObj.questions)) {
            questions = responseDataObj.questions;
            this.logger.debug(`Found ${questions.length} questions in response.questions`);
          } else if (responseDataObj.error) {
            // Handle error response
            throw new Error(`API Error: ${responseDataObj.error}`);
          } else {
            // Try to handle unexpected but valid formats
            const possibleQuestions = Array.isArray(responseDataObj) ? responseDataObj : [];
            if (possibleQuestions.length > 0 && 
                possibleQuestions.every(q => q.question && Array.isArray(q.options))) {
              questions = possibleQuestions;
              this.logger.debug(`Found ${questions.length} questions in root array`);
            } else {
              throw new Error('Unexpected response format from API');
            }
          }
        } catch (error) {
          this.logger.error('Error processing API response:', error);
          // Include more context in the error
          const errorContext = {
            error: error.message,
            responseData: responseDataObj ? JSON.stringify(responseDataObj).substring(0, 500) : 'No response data'
          };
          this.logger.error('Error context:', errorContext);
          throw new Error(`Failed to process API response: ${error.message}`);
        }
        
        this.logger.log(`Successfully generated ${questions.length} questions`);
        
        if (questions.length === 0) {
          this.logger.warn('No valid questions found in the response');
          return [];
        }
        
        // Validate and normalize questions
        const questionDocs: IQuestion[] = [];
        let validQuestionCount = 0;
        
        for (const [index, q] of questions.entries()) {
          try {
            // Validate question structure
            if (!q || typeof q !== 'object') {
              this.logger.warn(`Skipping invalid question at index ${index}: not an object`);
              continue;
            }
            
            // Ensure required fields exist
            if (!q.question || !Array.isArray(q.options) || q.correctAnswer === undefined) {
              this.logger.warn(`Skipping invalid question at index ${index}:`, {
                hasQuestion: !!q.question,
                hasOptions: Array.isArray(q.options),
                hasCorrectAnswer: q.correctAnswer !== undefined
              });
              continue;
            }
            
            // Ensure question text exists
            const questionText = (q.question || q.Question || '').toString().trim();
            if (!questionText) {
              this.logger.warn(`Skipping question with no text at index ${index}`);
              continue;
            }
            
            // Handle different option formats
            let options: string[] = [];
            if (Array.isArray(q.options)) {
              options = q.options.map((opt: unknown) => String(opt).trim()).filter(Boolean) as string[];
            } else if (Array.isArray(q.Options)) {
              options = q.Options.map((opt: unknown) => String(opt).trim()).filter(Boolean) as string[];
            } else if (q.options && typeof q.options === 'string') {
              try {
                const parsedOptions = JSON.parse(q.options);
                options = Array.isArray(parsedOptions) 
                  ? parsedOptions.map((opt: unknown) => String(opt).trim()).filter(Boolean) 
                  : [String(parsedOptions).trim()];
              } catch (e) {
                options = [String(q.options).trim()];
              }
            }
            
            // Ensure we have at least 2 options
            if (options.length < 2) {
              options = ['True', 'False'];
            }
            
            // Handle different correct answer formats
            let correctAnswer = 0;
            if (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < options.length) {
              correctAnswer = q.correctAnswer;
            } else if (typeof q.correctAnswer === 'string' && !isNaN(Number(q.correctAnswer))) {
              correctAnswer = parseInt(q.correctAnswer, 10);
            } else if (typeof (q as any).correct_answer === 'number') {
              correctAnswer = (q as any).correct_answer;
            } else if (typeof (q as any).CorrectAnswer === 'number') {
              correctAnswer = (q as any).CorrectAnswer;
            }
            
            // Ensure correctAnswer is within bounds
            correctAnswer = Math.max(0, Math.min(correctAnswer, options.length - 1));
            
            const explanation = ((q as any).explanation || (q as any).Explanation || '').toString().trim();
            
            const questionDoc = new this.questionModel({
              _id: new Types.ObjectId(),
              videoId: new Types.ObjectId(videoId),
              segmentId: new Types.ObjectId(segmentId),
              question: questionText,
              options: options,
              correctAnswer: correctAnswer,
              explanation: explanation,
              order: 0, // Make sure to include the required 'order' field
              createdAt: new Date(),
              updatedAt: new Date()
            });
            
            questionDocs.push(questionDoc);
            validQuestionCount++;
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error processing question at index ${index}: ${errorMessage}`);
          }
        }
        
        if (validQuestionCount === 0) {
          this.logger.warn('No valid questions could be processed');
          return [];
        }
        
        this.logger.log(`Successfully processed ${validQuestionCount} valid questions`);
        return questionDocs;
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorResponse = (error as any)?.response;
        
        this.logger.error(`Attempt ${attempt} failed: ${errorMessage}`);
        
        if (errorResponse?.data) {
          this.logger.error(`Response data: ${JSON.stringify(errorResponse.data)}`);
        }
        
        const errorConfig = (error as any)?.config;
        if (errorConfig) {
          this.logger.error(`Request config: ${JSON.stringify({
            url: errorConfig.url,
            method: errorConfig.method,
            headers: errorConfig.headers,
            data: errorConfig.data ? String(errorConfig.data).substring(0, 500) : 'No data'
          })}`);
        }
        
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * attempt;
          this.logger.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.logger.error('All attempts to generate questions failed');
          return [];
        }
      }
    }
    
    // This should never be reached due to the for loop structure
    return [];
    
    return []; // Fallback return
  }

  private async handleError(context: string, error: unknown, cleanup?: () => Promise<void>): Promise<never> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`${context}: ${message}`, stack);
    
    if (cleanup) {
      try {
        await cleanup();
      } catch (e) {
        this.logger.error('Cleanup failed:', e);
      }
    }
    
    throw error instanceof Error ? error : new Error(message);
    throw error;
  }

  /**
   * Get all transcript segments for a video
   * @param videoId The ID of the video to get segments for
   * @returns Array of transcript segments
   */
  async getSegments(videoId: string): Promise<ITranscriptSegment[]> {
    const segments = await this.segmentModel
      .find({ videoId: new Types.ObjectId(videoId) })
      .sort({ startTime: 1 })
      .exec();
    
    if (!segments.length) {
      this.logger.warn(`No segments found for video ${videoId}`);
      return [];
    }

    return segments;
  }

}
