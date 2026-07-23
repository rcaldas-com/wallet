import Redis from 'ioredis';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://redis');
  }
  return redis;
}

const redisProxy = new Proxy({} as Redis, {
  get(_target, prop) {
    const instance = getRedis();
    const value = Reflect.get(instance, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export default redisProxy;
