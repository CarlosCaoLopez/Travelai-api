import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './supabase-jwt.strategy';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    console.log('[CurrentUser] Extracted user:', request.user);
    console.log('[CurrentUser] UserId:', request.user?.userId);
    return request.user;
  },
);
