// 缓存管理服务 - 统一管理应用中的各种缓存
import { APP_CONSTANTS } from '@/constants';

class CacheManager {
  constructor() {
    this.caches = new Map();
    this.cacheSizes = new Map();
    this.cacheTimestamps = new Map();
  }

  // 创建缓存实例
  createCache(name, maxSize = 100, ttl = 0) {
    if (this.caches.has(name)) {
      console.warn(`缓存 ${name} 已存在`);
      return this.caches.get(name);
    }

    const cache = new Map();
    this.caches.set(name, cache);
    this.cacheSizes.set(name, maxSize);
    
    if (ttl > 0) {
      this.cacheTimestamps.set(name, new Map());
    }

    return cache;
  }

  // 获取缓存
  get(cacheName, key) {
    const cache = this.caches.get(cacheName);
    if (!cache) return null;

    // 检查TTL
    const timestamps = this.cacheTimestamps.get(cacheName);
    if (timestamps && timestamps.has(key)) {
      const timestamp = timestamps.get(key);
      const ttl = this.getTTL(cacheName);
      if (ttl > 0 && Date.now() - timestamp > ttl) {
        cache.delete(key);
        timestamps.delete(key);
        return null;
      }
    }

    return cache.get(key);
  }

  // 设置缓存
  set(cacheName, key, value) {
    const cache = this.caches.get(cacheName);
    if (!cache) return false;

    const maxSize = this.cacheSizes.get(cacheName) || 100;
    
    // 如果缓存已满，删除最旧的条目
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
      
      const timestamps = this.cacheTimestamps.get(cacheName);
      if (timestamps) {
        timestamps.delete(firstKey);
      }
    }

    cache.set(key, value);

    // 设置时间戳
    const timestamps = this.cacheTimestamps.get(cacheName);
    if (timestamps) {
      timestamps.set(key, Date.now());
    }

    return true;
  }

  // 删除缓存条目
  delete(cacheName, key) {
    const cache = this.caches.get(cacheName);
    if (!cache) return false;

    const result = cache.delete(key);
    
    const timestamps = this.cacheTimestamps.get(cacheName);
    if (timestamps) {
      timestamps.delete(key);
    }

    return result;
  }

  // 清空特定缓存
  clear(cacheName) {
    const cache = this.caches.get(cacheName);
    if (!cache) return false;

    cache.clear();
    
    const timestamps = this.cacheTimestamps.get(cacheName);
    if (timestamps) {
      timestamps.clear();
    }

    return true;
  }

  // 清空所有缓存
  clearAll() {
    this.caches.forEach(cache => cache.clear());
    this.cacheTimestamps.forEach(timestamps => timestamps.clear());
  }

  // 获取缓存大小
  size(cacheName) {
    const cache = this.caches.get(cacheName);
    return cache ? cache.size : 0;
  }

  // 获取缓存统计信息
  getStats(cacheName) {
    const cache = this.caches.get(cacheName);
    if (!cache) return null;

    return {
      name: cacheName,
      size: cache.size,
      maxSize: this.cacheSizes.get(cacheName),
      keys: Array.from(cache.keys())
    };
  }

  // 获取所有缓存统计信息
  getAllStats() {
    const stats = {};
    this.caches.forEach((cache, name) => {
      stats[name] = this.getStats(name);
    });
    return stats;
  }

  // 设置TTL
  setTTL(cacheName, ttl) {
    if (ttl > 0 && !this.cacheTimestamps.has(cacheName)) {
      this.cacheTimestamps.set(cacheName, new Map());
    }
  }

  // 获取TTL
  getTTL(cacheName) {
    // 可以从配置中读取，这里简单返回默认值
    return 0; // 0表示不过期
  }

  // 清理过期缓存
  cleanup() {
    this.cacheTimestamps.forEach((timestamps, cacheName) => {
      const cache = this.caches.get(cacheName);
      const ttl = this.getTTL(cacheName);
      
      if (ttl > 0) {
        const now = Date.now();
        const keysToDelete = [];
        
        timestamps.forEach((timestamp, key) => {
          if (now - timestamp > ttl) {
            keysToDelete.push(key);
          }
        });
        
        keysToDelete.forEach(key => {
          cache.delete(key);
          timestamps.delete(key);
        });
      }
    });
  }

  // 销毁缓存管理器
  destroy() {
    this.clearAll();
    this.caches.clear();
    this.cacheSizes.clear();
    this.cacheTimestamps.clear();
  }
}

// 创建全局缓存管理器实例
const cacheManager = new CacheManager();

// 初始化常用缓存
cacheManager.createCache('search', APP_CONSTANTS.CACHE_LIMITS.MAX_SEARCH_CACHE_SIZE);
cacheManager.createCache('folderPaths', APP_CONSTANTS.CACHE_LIMITS.MAX_PATH_CACHE_SIZE);
cacheManager.createCache('bookmarkValidation', 500);
cacheManager.createCache('urlCheck', 200);

export default cacheManager;
