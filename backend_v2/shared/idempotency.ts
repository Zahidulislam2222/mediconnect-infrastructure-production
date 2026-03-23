/**
 * Idempotency Key Middleware — SOC 2 PI1 (Processing Integrity)
 * Prevents duplicate processing of write operations.
 * Clients send an Idempotency-Key header; the server caches the response
 * and returns the cached result on retry instead of re-executing.
 *
 * Uses in-memory cache with TTL. In production, Redis-backed via getRedisClient().
 */

import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from './redis';
import { safeLog } from './logger';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

// In-memory fallback cache
const memoryCache = new Map<string, { statusCode: number; body: any; expiresAt: number }>();

/**
 * Express middleware that enforces idempotency on write operations.
 * If Idempotency-Key header is present, caches the response and returns
 * the cached result on subsequent requests with the same key.
 *
 * Usage: app.post('/endpoint', idempotencyGuard(), handler);
 */
export function idempotencyGuard() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const idempotencyKey = req.headers['idempotency-key'] as string;

        // No key = no idempotency enforcement (backward compatible)
        if (!idempotencyKey) return next();

        const cacheKey = `idem:${req.method}:${req.path}:${idempotencyKey}`;

        try {
            // Check Redis first, then in-memory fallback
            const redis = getRedisClient();
            if (redis) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    const { statusCode, body } = JSON.parse(cached);
                    safeLog(`[IDEMPOTENCY] Cache hit for key: ${idempotencyKey.substring(0, 8)}...`);
                    return res.status(statusCode).json(body);
                }
            } else {
                // In-memory fallback
                const cached = memoryCache.get(cacheKey);
                if (cached && cached.expiresAt > Date.now()) {
                    safeLog(`[IDEMPOTENCY] Memory cache hit for key: ${idempotencyKey.substring(0, 8)}...`);
                    return res.status(cached.statusCode).json(cached.body);
                }
                if (cached) memoryCache.delete(cacheKey); // expired
            }
        } catch {
            // Cache check failed — proceed without idempotency (graceful degradation)
        }

        // Intercept res.json to capture the response for caching
        const originalJson = res.json.bind(res);
        res.json = function(body: any) {
            // Cache the response asynchronously (fire-and-forget)
            const statusCode = res.statusCode;
            (async () => {
                try {
                    const redis = getRedisClient();
                    if (redis) {
                        await redis.setex(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify({ statusCode, body }));
                    } else {
                        memoryCache.set(cacheKey, {
                            statusCode,
                            body,
                            expiresAt: Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000
                        });
                        // Prevent unbounded memory growth
                        if (memoryCache.size > 10000) {
                            const oldest = memoryCache.keys().next().value;
                            if (oldest) memoryCache.delete(oldest);
                        }
                    }
                } catch { /* caching failure is non-fatal */ }
            })();
            return originalJson(body);
        } as any;

        next();
    };
}
