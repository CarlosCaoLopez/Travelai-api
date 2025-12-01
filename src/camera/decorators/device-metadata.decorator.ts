import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeviceMetadataDto } from '../dto/device-metadata.dto';

/**
 * Custom decorator to parse and validate device_metadata from multipart/form-data
 *
 * Usage in controller:
 * @DeviceMetadata() deviceMetadata?: DeviceMetadataDto
 *
 * Frontend should send device_metadata as a JSON string:
 * formData.append('device_metadata', JSON.stringify({ platform: 'ios', app_version: '1.0.0' }))
 */
export const DeviceMetadata = createParamDecorator(
  async (
    data: unknown,
    ctx: ExecutionContext,
  ): Promise<DeviceMetadataDto | undefined> => {
    const request = ctx.switchToHttp().getRequest();
    const metadataString = request.body?.device_metadata;

    // If no metadata provided, return undefined (it's optional)
    if (!metadataString) {
      return undefined;
    }

    // Parse JSON string
    let parsedMetadata: unknown;
    try {
      parsedMetadata = JSON.parse(metadataString);
    } catch (error) {
      throw new BadRequestException(
        'Invalid device_metadata format: must be a valid JSON string',
      );
    }

    // Transform to DTO instance
    const dto = plainToInstance(DeviceMetadataDto, parsedMetadata);

    // Validate with class-validator
    const errors = await validate(dto);
    if (errors.length > 0) {
      const messages = errors
        .map((error) => Object.values(error.constraints || {}))
        .flat();
      throw new BadRequestException(
        `Invalid device_metadata: ${messages.join(', ')}`,
      );
    }

    return dto;
  },
);
