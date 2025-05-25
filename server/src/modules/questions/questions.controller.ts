import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { Types } from 'mongoose';

@Controller('api/videos/:videoId/segments/:segmentIndex/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  async getQuestionsBySegment(
    @Param('videoId') videoId: string,
    @Param('segmentIndex') segmentIndex: number,
  ) {
    try {
      return await this.questionsService.getQuestionsByVideoAndSegment(
        new Types.ObjectId(videoId),
        segmentIndex,
      );
    } catch (error) {
      throw new NotFoundException('Questions not found');
    }
  }

  @Get('all')
  async getAllQuestionsByVideo(@Param('videoId') videoId: string) {
    try {
      return await this.questionsService.getAllQuestionsByVideo(
        new Types.ObjectId(videoId),
      );
    } catch (error) {
      throw new NotFoundException('Questions not found');
    }
  }
}
