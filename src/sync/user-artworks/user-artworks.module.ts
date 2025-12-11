import { Module } from '@nestjs/common';
import { UserArtworksService } from './user-artworks.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [UserArtworksService],
  exports: [UserArtworksService],
})
export class UserArtworksModule {}
