import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Query,
  Body,
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
import { RecognitionResponseDto } from './dto/recognition-response.dto';
import { ArtworkDetailsRequestDto } from './dto/artwork-details-request.dto';
import { ArtworkDetailsResponseDto } from './dto/artwork-details-response.dto';
import { ArtworkDetailsService } from './services/artwork-details.service';
import { imageFileFilter } from './utils/file-validation';
import { getMessage } from './constants/messages';
import { StrictThrottle } from '../common/decorators/throttle.decorator';

@Controller('api/camera')
@UseGuards(SupabaseAuthGuard)
export class CameraController {
  private readonly logger = new Logger(CameraController.name);

  constructor(
    private readonly cameraService: CameraService,
    private readonly artworkDetailsService: ArtworkDetailsService,
  ) {}

  @Post('recognize')
  @StrictThrottle()
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
    @Body('localUri') localUri: string,
    @Query() query: RecognitionQueryDto,
  ): Promise<RecognitionResponseDto> {
    const language = query.language || 'es';

    // Validate file exists
    if (!file) {
      throw new BadRequestException(getMessage(language, 'MISSING_IMAGE'));
    }

    // Validate localUri exists
    if (!localUri || localUri.trim() === '') {
      throw new BadRequestException(getMessage(language, 'MISSING_LOCAL_URI'));
    }

    this.logger.log(
      `Recognition request from user ${user.userId}, file: ${file.originalname}, language: ${language}, localUri: ${localUri}`,
    );

    try {
      // Call service with buffer (image in memory) and localUri
      const result = await this.cameraService.recognizeArtwork(
        file.buffer,
        file.originalname,
        file.mimetype,
        user.userId,
        localUri,
        language,
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

  @Post('artwork/details')
  @StrictThrottle()
  async getArtworkDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Body() request: ArtworkDetailsRequestDto,
    @Query() query: RecognitionQueryDto,
  ): Promise<ArtworkDetailsResponseDto> {
    const language = query.language || 'es';

    this.logger.log(
      `Getting artwork details for "${request.title}" (user: ${user.userId}, language: ${language})`,
    );

    try {
      const detailedInfo = await this.artworkDetailsService.getEnrichedDetails(
        request,
        language,
      );

      return {
        success: true,
        detailedInfo,
      };
    } catch (error) {
      this.logger.error('Error getting artwork details:', error);

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to generate artwork details',
      );
    }
  }
}
