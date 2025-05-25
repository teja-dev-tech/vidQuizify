import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TranscriptSegmentDocument = TranscriptSegment & Document;

export enum SegmentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class TranscriptSegment {
  @Prop({ type: Types.ObjectId, ref: 'Video', required: true })
  videoId: Types.ObjectId;

  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  startTime: number;

  @Prop({ required: true })
  endTime: number;

  @Prop({ required: true })
  text: string;

  @Prop({ 
    type: String, 
    enum: Object.values(SegmentStatus),
    default: SegmentStatus.PENDING 
  })
  status: SegmentStatus;

  @Prop()
  error?: string;
}

export const TranscriptSegmentSchema = SchemaFactory.createForClass(TranscriptSegment);