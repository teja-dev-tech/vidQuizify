import { Test, TestingModule } from '@nestjs/testing';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';

describe('TranscriptionController', () => {
  let controller: TranscriptionController;
  let service: TranscriptionService;

  // Mock service methods will be added here when needed
  const mockService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptionController],
      providers: [
        {
          provide: TranscriptionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TranscriptionController>(TranscriptionController);
    service = module.get<TranscriptionService>(TranscriptionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Test cases will be added here
});
