import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'User ID to confirm account deletion',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString({ message: 'Must provide a valid user ID' })
  @IsNotEmpty({ message: 'User ID cannot be empty' })
  confirmationUserId: string;
}
