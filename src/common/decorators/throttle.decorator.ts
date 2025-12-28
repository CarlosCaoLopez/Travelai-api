import { Throttle } from '@nestjs/throttler';

/**
 * Strict rate limiting decorator for resource-intensive or sensitive endpoints.
 * Limits: 10 requests per minute
 *
 * Use for:
 * - AI image recognition endpoints
 * - Payment creation/subscription endpoints
 * - Account deletion
 * - Other critical operations
 */
export const StrictThrottle = () => Throttle({ default: { ttl: 60000, limit: 10 } });

/**
 * Moderate rate limiting decorator for user data operations.
 * Limits: 30 requests per minute
 *
 * Use for:
 * - User collection operations
 * - User profile sync
 * - Push token management
 * - Search endpoints
 */
export const ModerateThrottle = () => Throttle({ default: { ttl: 60000, limit: 30 } });

/**
 * Relaxed rate limiting decorator for public catalog/browse endpoints.
 * Limits: 60 requests per minute
 *
 * Use for:
 * - Public catalog browsing
 * - Artwork details
 * - Quotes and recommendations
 * - Nearby locations
 */
export const RelaxedThrottle = () => Throttle({ default: { ttl: 60000, limit: 60 } });
