import { Module } from '@nestjs/common';
import { ArtworksController } from './artworks.controller';
import { ArtworksService } from './artworks.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ArtworksController],
  providers: [ArtworksService],
})
export class ArtworksModule {}
