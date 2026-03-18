// ─── FIX #9: REDIS RATE LIMIT STORE FACTORY ──────────────────────────────
// Creates a Redis-backed store for express-rate-limit when Redis is available.
// Falls back to the default in-memory store when Redis is not configured.
// ──────────────────────────────────────────────────────────────────────────

import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from './redis';

/**
 * Creates a rate limit store backed by Redis if available.
 * @param prefix - Key prefix to namespace this limiter in Redis (e.g., 'rl:global:booking')
 * @returns RedisStore instance or undefined (express-rate-limit uses MemoryStore when undefined)
 */
export function createRateLimitStore(prefix: string): RedisStore | undefined {
    const client = getRedisClient();
    if (!client) return undefined;

    return new RedisStore({
        // ioredis sendCommand adapter for rate-limit-redis
        sendCommand: (...args: string[]) => (client.call as any)(...args),
        prefix: `mediconnect:${prefix}:`,
    });
}
