// 性能监控工具 - 用于分析组件性能和优化建议
import { APP_CONSTANTS } from '@/constants';
import { DevTools } from '@/utils/devTools';

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      renderTime: 16, // 60fps = 16ms per frame
      memoryUsage: 50 * 1024 * 1024, // 50MB
      domNodes: 5000,
      rerenderCount: 10
    };
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  // 开始性能测量
  startMeasure(name) {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      startTime: performance.now(),
      startMemory: this.getCurrentMemoryUsage(),
      rerenderCount: (this.metrics.get(name)?.rerenderCount || 0) + 1
    });
  }

  // 结束性能测量
  endMeasure(name) {
    if (!this.isEnabled) return;
    
    const metric = this.metrics.get(name);
    if (!metric) return;

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    const endMemory = this.getCurrentMemoryUsage();
    const memoryDiff = endMemory - metric.startMemory;

    const result = {
      name,
      duration,
      memoryDiff,
      rerenderCount: metric.rerenderCount,
      timestamp: new Date().toISOString()
    };

    // 检查是否超过阈值
    this.checkThresholds(result);

    // 更新指标
    this.metrics.set(name, {
      ...metric,
      ...result
    });

    return result;
  }

  // 获取当前内存使用情况
  getCurrentMemoryUsage() {
    if (window.performance && window.performance.memory) {
      return window.performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  // 检查性能阈值
  checkThresholds(result) {
    const warnings = [];

    if (result.duration > this.thresholds.renderTime) {
      warnings.push(`渲染时间超过阈值: ${result.duration.toFixed(2)}ms > ${this.thresholds.renderTime}ms`);
    }

    if (result.memoryDiff > this.thresholds.memoryUsage) {
      warnings.push(`内存增长超过阈值: ${(result.memoryDiff / 1024 / 1024).toFixed(2)}MB > ${this.thresholds.memoryUsage / 1024 / 1024}MB`);
    }

    if (result.rerenderCount > this.thresholds.rerenderCount) {
      warnings.push(`重渲染次数过多: ${result.rerenderCount} > ${this.thresholds.rerenderCount}`);
    }

    if (warnings.length > 0) {
      DevTools.warn(`性能警告 [${result.name}]:`, warnings);
      this.suggestOptimizations(result, warnings);
    }
  }

  // 提供优化建议
  suggestOptimizations(result, warnings) {
    const suggestions = [];

    if (result.duration > this.thresholds.renderTime) {
      suggestions.push('考虑使用虚拟滚动或分页减少渲染节点数量');
      suggestions.push('检查是否有不必要的computed属性计算');
      suggestions.push('使用v-memo缓存重复渲染的内容');
    }

    if (result.memoryDiff > this.thresholds.memoryUsage) {
      suggestions.push('检查是否有内存泄漏，特别是事件监听器');
      suggestions.push('清理不必要的对象引用');
      suggestions.push('使用Object.freeze冻结不变的数据');
    }

    if (result.rerenderCount > this.thresholds.rerenderCount) {
      suggestions.push('使用shouldComponentUpdate或PureComponent');
      suggestions.push('检查props是否变化过于频繁');
      suggestions.push('考虑使用防抖或节流');
    }

    DevTools.info(`优化建议 [${result.name}]:`, suggestions);
  }

  // 获取性能报告
  getReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: {},
      summary: {
        totalComponents: this.metrics.size,
        averageRenderTime: 0,
        totalMemoryUsage: 0,
        performanceIssues: 0
      }
    };

    let totalDuration = 0;
    let totalMemory = 0;
    let issueCount = 0;

    this.metrics.forEach((metric, name) => {
      if (metric.duration !== undefined) {
        totalDuration += metric.duration;
        totalMemory += metric.memoryDiff || 0;

        if (metric.duration > this.thresholds.renderTime ||
            (metric.memoryDiff || 0) > this.thresholds.memoryUsage ||
            metric.rerenderCount > this.thresholds.rerenderCount) {
          issueCount++;
        }

        report.metrics[name] = {
          duration: metric.duration,
          memoryDiff: metric.memoryDiff,
          rerenderCount: metric.rerenderCount
        };
      }
    });

    report.summary.averageRenderTime = totalDuration / this.metrics.size;
    report.summary.totalMemoryUsage = totalMemory;
    report.summary.performanceIssues = issueCount;

    return report;
  }

  // 清理监控数据
  clear() {
    this.metrics.clear();
  }

  // 开启/关闭监控
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

// Vue mixin for easy integration
export const PerformanceMonitorMixin = {
  beforeCreate() {
    if (this.$options.name) {
      this.$performanceMonitor = new PerformanceMonitor();
      this.$performanceMonitor.startMeasure(this.$options.name + '.create');
    }
  },
  
  created() {
    if (this.$performanceMonitor && this.$options.name) {
      this.$performanceMonitor.endMeasure(this.$options.name + '.create');
    }
  },
  
  beforeMount() {
    if (this.$performanceMonitor && this.$options.name) {
      this.$performanceMonitor.startMeasure(this.$options.name + '.mount');
    }
  },
  
  mounted() {
    if (this.$performanceMonitor && this.$options.name) {
      this.$performanceMonitor.endMeasure(this.$options.name + '.mount');
    }
  },
  
  beforeUpdate() {
    if (this.$performanceMonitor && this.$options.name) {
      this.$performanceMonitor.startMeasure(this.$options.name + '.update');
    }
  },
  
  updated() {
    if (this.$performanceMonitor && this.$options.name) {
      this.$performanceMonitor.endMeasure(this.$options.name + '.update');
    }
  },
  
  beforeDestroy() {
    if (this.$performanceMonitor) {
      // 输出最终性能报告
      const report = this.$performanceMonitor.getReport();
      if (report.summary.performanceIssues > 0) {
        DevTools.warn(`组件 ${this.$options.name} 性能报告:`, report);
      }
      this.$performanceMonitor.clear();
    }
  }
};

// 创建全局性能监控实例
const globalPerformanceMonitor = new PerformanceMonitor();

export default globalPerformanceMonitor;
