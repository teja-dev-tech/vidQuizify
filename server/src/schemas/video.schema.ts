import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VideoDocument = Video & Document;

export enum VideoStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class Video {
  @Prop({ required: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  path: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({
    type: String,
    enum: Object.values(VideoStatus),
    default: VideoStatus.UPLOADED,
  })
  status: VideoStatus;

  @Prop()
  error?: string;

  @Prop({ type: Object })
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
    transcript?: string;
  };
}

export const VideoSchema = SchemaFactory.createForClass(Video);
