import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { SyncModule } from '../sync/sync.module';
import { DataForSEOModule } from '../integrations/dataforseo/dataforseo.module';
import { QuotaModule } from '../quota/quota.module';
import { CameraController } from './camera.controller';
import { CameraService } from './camera.service';
import { QwenVisionService } from './services/qwen-vision.service';
import { GoogleVisionService } from './services/google-vision.service';
import { WebScraperService } from './services/web-scraper.service';
import { ArtworkMatchingService } from './services/artwork-matching.service';
import { ImageProcessingService } from './services/image-processing.service';
import { CategoryMappingService } from './services/category-mapping.service';
import { PlaywrightScraperService } from './services/playwright-scraper.service';
import { ArtworkDetailsService } from './services/artwork-details.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    DatabaseModule,
    AuthModule,
    StorageModule,
    SyncModule,
    DataForSEOModule,
    QuotaModule,
  ],
  controllers: [CameraController],
  providers: [
    CameraService,
    QwenVisionService,
    GoogleVisionService,
    WebScraperService,
    PlaywrightScraperService,
    ArtworkMatchingService,
    ImageProcessingService,
    CategoryMappingService,
    ArtworkDetailsService,
  ],
  exports: [CameraService],
})
export class CameraModule {}
