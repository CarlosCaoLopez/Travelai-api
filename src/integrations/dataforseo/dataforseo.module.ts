import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DataForSEOConfigService } from './dataforseo-config.service';
import { GoogleLensService } from './google-lens.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [DataForSEOConfigService, GoogleLensService],
  exports: [GoogleLensService],
})
export class DataForSEOModule {}
