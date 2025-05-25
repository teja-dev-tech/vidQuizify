import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Document } from 'mongoose';
import { IQuestion } from '../uploads/types';

interface QuestionDocument extends IQuestion, Document {
  _id: Types.ObjectId;
  order: number;
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @InjectModel('Question') private questionModel: Model<QuestionDocument>,
    @InjectModel('TranscriptSegment') private segmentModel: Model<any>,
  ) {}

  async getQuestionsByVideoAndSegment(
    videoId: Types.ObjectId,
    segmentIndex: number,
  ) {
    try {
      // Find the segment ID for the given video and segment index
      const segment = await this.segmentModel.findOne({
        videoId,
        index: segmentIndex,
      });

      if (!segment) {
        return [];
      }

      // Find all questions for this segment
      const questions = await this.questionModel
        .find({
          videoId,
          segmentId: segment._id,
        })
        .sort('order')
        .lean()
        .exec();

      return questions.map(q => ({
        id: q._id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        order: q.order,
      }));
    } catch (error) {
      this.logger.error('Error getting questions by segment:', error);
      throw error;
    }
  }

  async getAllQuestionsByVideo(videoId: Types.ObjectId) {
    try {
      // Get all segments for this video
      const segments = await this.segmentModel
        .find({ videoId })
        .sort('index')
        .lean();

      // Get all questions for this video, grouped by segment
      const questionsBySegment = await Promise.all(
        segments.map(async segment => {
          const questions = await this.questionModel
            .find({
              videoId,
              segmentId: segment._id,
            })
            .sort('order')
            .lean();

          return {
            segment: {
              id: segment._id,
              index: segment.index,
              startTime: segment.startTime,
              endTime: segment.endTime,
              text: segment.text,
            },
            questions: questions.map(q => ({
              id: q._id,
              question: q.question,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              order: q.order,
            })),
          };
        }),
      );

      return questionsBySegment;
    } catch (error) {
      this.logger.error('Error getting all questions by video:', error);
      throw error;
    }
  }
}
