import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Schema, Document, Types } from 'mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { TranscriptionModule } from '../transcription/transcription.module';
import { IVideo, ITranscriptSegment, IQuestion } from './types';

// Transcript Segment Schema
const TranscriptSegmentSchema = new Schema<ITranscriptSegment & Document>({
  videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
  index: { type: Number, required: true },
  startTime: { type: Number, required: true }, // in seconds
  endTime: { type: Number, required: true },   // in seconds
  text: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  error: { type: String, default: '' },
}, { timestamps: true });

// Question Schema
const QuestionSchema = new Schema<IQuestion & Document>({
  videoId: { type: Schema.Types.ObjectId, ref: 'Video', required: true },
  segmentId: { type: Schema.Types.ObjectId, ref: 'TranscriptSegment', required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: Number, required: true }, // index of correct option
  explanation: { type: String, default: '' },
}, { timestamps: true });

// Video Schema
const VideoSchema = new Schema<IVideo & Document>(
  {
    title: { type: String, required: true },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      enum: ['UPLOADING', 'UPLOADED', 'PROCESSING', 'TRANSCRIBING', 'GENERATING_QUESTIONS', 'COMPLETED', 'FAILED'],
      default: 'UPLOADING',
    },
    metadata: {
      duration: { type: Number, default: 0 }, // in seconds
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      transcript: { type: String, default: '' },
    },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Video', schema: VideoSchema },
      { name: 'TranscriptSegment', schema: TranscriptSegmentSchema },
      { name: 'Question', schema: QuestionSchema },
    ]),
    forwardRef(() => TranscriptionModule),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        storage: diskStorage({
          destination: configService.get<string>('UPLOAD_PATH', './uploads'),
          filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const ext = extname(file.originalname);
            cb(null, `video-${uniqueSuffix}${ext}`);
          },
        }),
        limits: {
          fileSize: parseInt(process.env.MAX_FILE_SIZE || '1073741824'), // 1GB default
        },
        fileFilter: (req, file, cb) => {
          if (!file.originalname.toLowerCase().match(/\.(mp4|mov|avi|wmv|flv|mkv)$/)) {
            return cb(new Error('Only video files are allowed!'), false);
          }
          cb(null, true);
        },
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
  ],
  exports: [
    UploadsService,
    MongooseModule.forFeature([
      { name: 'Video', schema: VideoSchema },
      { name: 'TranscriptSegment', schema: TranscriptSegmentSchema },
      { name: 'Question', schema: QuestionSchema },
    ])
  ],
})
export class UploadsModule {}

export { UploadsService } from './uploads.service';
export type { IVideo as Video, ITranscriptSegment as TranscriptSegment, IQuestion as Question } from './types';
