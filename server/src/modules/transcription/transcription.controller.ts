import { Controller, Post, Get, Param, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TranscriptionService } from './transcription.service';

@ApiTags('transcription')
@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly service: TranscriptionService) {}

  @Post('transcribe/:videoId')
  @ApiOperation({ summary: 'Transcribe a video' })
  async transcribeVideo(@Param('videoId') videoId: string) {
    const result = await this.service.startTranscription(videoId);
    return { status: 'success', data: result };
  }

  @Get('transcript/:videoId')
  @ApiOperation({ summary: 'Get transcript for a video' })
  async getTranscript(@Param('videoId') videoId: string) {
    const transcript = await this.service.getTranscript(videoId);
    return { status: 'success', data: transcript };
  }

  @Post('segment/:videoId')
  @ApiOperation({ summary: 'Segment a video transcript' })
  async segmentTranscript(@Param('videoId') videoId: string) {
    const segments = await this.service.segmentTranscript(videoId);
    return { status: 'success', data: { segments } };
  }

  @Get('segments/:videoId')
  @ApiOperation({ summary: 'Get segments for a video' })
  async getSegments(@Param('videoId') videoId: string) {
    const segments = await this.service.getSegments(videoId);
    return { status: 'success', data: { segments } };
  }

  @Post('questions/:videoId')
  @ApiOperation({ summary: 'Generate questions for a video' })
  async generateQuestions(
    @Param('videoId') videoId: string,
  ) {
    await this.service.generateQuestionsForVideo(videoId);
    return { status: 'success', message: 'Question generation started' };
  }

  @Get('questions/:videoId')
  @ApiOperation({ summary: 'Get questions for a video' })
  async getQuestions(@Param('videoId') videoId: string) {
    const questions = await this.service.getQuestions(videoId);
    return { status: 'success', data: { questions } };
  }

  @Post('process-file')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Process a file directly' })
  async processFileDirectly(@UploadedFile() file: Express.Multer.File) {
    const transcription = await this.service.processFileDirectly(file);
    return {
      status: 'success',
      data: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        transcription,
      },
    };
  }
}
