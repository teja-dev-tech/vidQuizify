import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuestionDocument = Question & Document;

@Schema({ timestamps: true })
export class Question {
  @Prop({ type: Types.ObjectId, ref: 'Video', required: true })
  videoId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TranscriptSegment', required: true })
  segmentId: Types.ObjectId;

  @Prop({ required: true })
  question: string;

  @Prop({ type: [String], required: true })
  options: string[];

  @Prop({ required: true })
  correctAnswer: number;

  @Prop()
  explanation?: string;

  @Prop({ default: 0 })
  order: number;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);