import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
];

export const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        'Invalid file format. Only JPG, PNG, and HEIC images are allowed.',
      ),
      false,
    );
  }

  callback(null, true);
};
