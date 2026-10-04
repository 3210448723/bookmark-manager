/* eslint-disable no-console */
// 开发工具集合
export const DevTools = {
  // 开发环境日志工具
  log: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    } else {
      // 生产环境只保留错误警告
      console.warn(...args);
    }
  },
  
  error: (...args) => {
    console.error(...args);
  },
  
  info: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.info(...args);
    }
  }
};

// 性能监控工具
export const PerformanceMonitor = {
  // 测量函数执行时间
  time: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(label);
    }
  },
  
  timeEnd: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(label);
    }
  },
  
  // 内存使用监控
  memory: () => {
    // `memory` 是 Chromium 的非标准扩展，不能直接假设所有浏览器类型都存在。
    const browserPerformance = /** @type {any} */ (typeof performance !== 'undefined' ? performance : null);
    if (process.env.NODE_ENV === 'development' && browserPerformance && browserPerformance.memory) {
      return {
        used: Math.round(browserPerformance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(browserPerformance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(browserPerformance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }
};
