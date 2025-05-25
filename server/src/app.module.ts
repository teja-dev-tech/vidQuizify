import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadsModule } from './modules/uploads/uploads.module';
import { TranscriptionModule } from './modules/transcription/transcription.module';
import { QuestionsModule } from './modules/questions/questions.module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HttpModule } from '@nestjs/axios';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), process.env.UPLOAD_PATH || 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

@Module({
  imports: [
    HttpModule.register({
      timeout: 3600000, // 1 hour
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/vidquizify'),
    forwardRef(() => UploadsModule),
    forwardRef(() => TranscriptionModule),
    QuestionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [AppService],
})
export class AppModule {}
