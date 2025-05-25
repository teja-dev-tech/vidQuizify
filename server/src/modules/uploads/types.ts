import { Document, Types } from 'mongoose';

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  videoId: Types.ObjectId | string;
  segmentId: Types.ObjectId | string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITranscriptSegment extends Document {
  videoId: Types.ObjectId | string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error: string;
  questions: IQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideo extends Document {
  _id: Types.ObjectId | string;
  title: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error: string;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
    transcript?: string;
    [key: string]: any;
  };
}
