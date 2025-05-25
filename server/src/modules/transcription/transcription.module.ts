import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';
import { UploadsModule } from '../uploads/uploads.module';
import { Video, VideoSchema } from '../../schemas/video.schema';
import { TranscriptSegment, TranscriptSegmentSchema } from '../../schemas/transcript-segment.schema';
import { Question, QuestionSchema } from '../../schemas/question.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
      { name: TranscriptSegment.name, schema: TranscriptSegmentSchema },
      { name: Question.name, schema: QuestionSchema },
    ]),
    EventEmitterModule.forRoot(),
    ConfigModule,
    forwardRef(() => UploadsModule),
  ],
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
