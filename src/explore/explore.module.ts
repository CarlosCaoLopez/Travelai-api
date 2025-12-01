import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExploreController } from './explore.controller';
import { ExploreService } from './explore.service';
import { GooglePlacesService } from './services/google-places.service';
import { QwenService } from './services/qwen.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000, // 10 seconds
      maxRedirects: 5,
    }),
  ],
  controllers: [ExploreController],
  providers: [ExploreService, GooglePlacesService, QwenService],
})
export class ExploreModule {}
