// ─── FIX #9: REDIS DISTRIBUTED RATE LIMITING ─────────────────────────────
// PROBLEM: In-memory rate limit stores are per-process. When services scale
// horizontally (ECS tasks, K8s pods), each instance maintains its own counter.
// A user hitting 4 different instances gets 4x the intended limit.
//
// FIX: Centralized Redis store so all instances share the same counters.
// Includes graceful fallback to in-memory if Redis is unavailable.
// ──────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { safeLog, safeError } from './logger';

let redisClient: Redis | null = null;
let isRedisHealthy = false;

/**
 * Returns a shared Redis client singleton.
 * Connection is lazy — only created on first call.
 * Returns null if REDIS_URL is not configured.
 */
export function getRedisClient(): Redis | null {
    if (redisClient) return redisClient;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        safeLog('REDIS_URL not set — rate limiting will use in-memory store (not suitable for multi-instance deployments)');
        return null;
    }

    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // Required by rate-limit-redis
        enableReadyCheck: true,
        retryStrategy(times) {
            if (times > 10) {
                safeError('Redis: Max reconnection attempts reached. Falling back to in-memory.');
                return null; // Stop retrying
            }
            return Math.min(times * 200, 5000);
        },
        lazyConnect: false,
    });

    redisClient.on('connect', () => {
        isRedisHealthy = true;
        safeLog('Redis connected — distributed rate limiting active');
    });

    redisClient.on('error', (err) => {
        isRedisHealthy = false;
        safeError('Redis connection error:', err.message);
    });

    redisClient.on('close', () => {
        isRedisHealthy = false;
    });

    redisClient.on('reconnecting', () => {
        safeLog('Redis reconnecting...');
    });

    return redisClient;
}

/** Check if Redis is connected and healthy. Useful for health-check endpoints. */
export function isRedisConnected(): boolean {
    return isRedisHealthy && redisClient !== null && redisClient.status === 'ready';
}

/** Gracefully disconnect Redis. Call during process shutdown for clean teardown. */
export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isRedisHealthy = false;
    }
}
