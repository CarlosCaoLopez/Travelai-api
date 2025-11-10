import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // This is just for module initialization
      // The actual secret is validated by SupabaseJwtStrategy
      signOptions: { expiresIn: '60m' },
    }),
  ],
  providers: [SupabaseJwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
