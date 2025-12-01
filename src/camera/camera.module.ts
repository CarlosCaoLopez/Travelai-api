import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { CameraController } from './camera.controller';
import { CameraService } from './camera.service';
import { QwenVisionService } from './services/qwen-vision.service';
import { GoogleVisionService } from './services/google-vision.service';
import { WebScraperService } from './services/web-scraper.service';
import { SupabaseStorageService } from './services/supabase-storage.service';
import { ArtworkMatchingService } from './services/artwork-matching.service';
import { ImageProcessingService } from './services/image-processing.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [CameraController],
  providers: [
    CameraService,
    QwenVisionService,
    GoogleVisionService,
    WebScraperService,
    SupabaseStorageService,
    ArtworkMatchingService,
    ImageProcessingService,
  ],
  exports: [CameraService],
})
export class CameraModule {}
