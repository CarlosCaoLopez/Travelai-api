import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Query,
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/supabase-jwt.strategy';
import { CameraService } from './camera.service';
import { RecognitionQueryDto } from './dto/recognition-query.dto';
import { DeviceMetadataDto } from './dto/device-metadata.dto';
import { RecognitionResponseDto } from './dto/recognition-response.dto';
import { imageFileFilter } from './utils/file-validation';
import { getMessage } from './constants/messages';
import { DeviceMetadata } from './decorators/device-metadata.decorator';

@Controller('api/camera')
@UseGuards(SupabaseAuthGuard)
export class CameraController {
  private readonly logger = new Logger(CameraController.name);

  constructor(private readonly cameraService: CameraService) {}

  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(), // Keep in memory, don't save to disk
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1,
      },
      fileFilter: imageFileFilter,
    }),
  )
  async recognizeArtwork(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Query() query: RecognitionQueryDto,
    @DeviceMetadata() deviceMetadata?: DeviceMetadataDto,
  ): Promise<RecognitionResponseDto> {
    const language = query.language || 'es';

    // Validate file exists
    if (!file) {
      throw new BadRequestException(getMessage(language, 'MISSING_IMAGE'));
    }

    this.logger.log(
      `Recognition request from user ${user.userId}, file: ${file.originalname}, language: ${language}`,
    );

    try {
      // Call service with buffer (image in memory)
      const result = await this.cameraService.recognizeArtwork(
        file.buffer,
        file.originalname,
        file.mimetype,
        user.userId,
        language,
        deviceMetadata,
      );

      return result;
    } catch (error) {
      this.logger.error(`Recognition failed: ${error.message}`, error.stack);

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      if (error.code === 'LIMIT_FILE_SIZE') {
        throw new PayloadTooLargeException(
          getMessage(language, 'FILE_TOO_LARGE'),
        );
      }

      throw new InternalServerErrorException(
        getMessage(language, 'PROCESSING_ERROR'),
      );
    }
  }
}
