import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { 
  Question, 
  QuestionSchema, 
  TranscriptSegment, 
  TranscriptSegmentSchema, 
  Video, 
  VideoSchema 
} from '../../schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Question', schema: QuestionSchema },
      { name: 'TranscriptSegment', schema: TranscriptSegmentSchema },
      { name: 'Video', schema: VideoSchema },
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class QuestionsModule {}
