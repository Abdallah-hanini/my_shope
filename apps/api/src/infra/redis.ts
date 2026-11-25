import Redis from 'ioredis';

export const CACHE_REDIS = Symbol('CACHE_REDIS');
export const QUEUE_REDIS = Symbol('QUEUE_REDIS');

/**
 * Redis clients fail fast instead of queueing commands while disconnected, so a dependency outage
 * shows up as a failed check rather than a hung request.
 */
export function createRedis(url: string, name: string): Redis {
  return new Redis(url, {
    connectionName: name,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
}
