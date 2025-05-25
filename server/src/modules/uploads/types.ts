import { Document, Types } from 'mongoose';

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  transcript?: string;
}

export interface IVideo extends Document {
  _id: Types.ObjectId;
  title: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'TRANSCRIBING' | 'GENERATING_QUESTIONS' | 'COMPLETED' | 'FAILED';
  metadata?: VideoMetadata;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITranscriptSegment extends Document {
  _id: Types.ObjectId;
  videoId: Types.ObjectId;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  videoId: Types.ObjectId;
  segmentId: Types.ObjectId;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  createdAt: Date;
  updatedAt: Date;
}
