<template>
  <div class="error-boundary">
    <!-- 正常渲染子组件 -->
    <slot v-if="!hasError"></slot>
    
    <!-- 错误状态显示 -->
    <div v-else class="error-fallback">
      <div class="error-icon">
        <i class="el-icon-warning-outline"></i>
      </div>
      <h3 class="error-title">{{ errorTitle }}</h3>
      <p class="error-message">{{ errorMessage }}</p>
      
      <!-- 错误详情（仅开发环境显示） -->
      <div v-if="isDevelopment && errorInfo" class="error-details">
        <el-collapse v-model="showDetails">
          <el-collapse-item title="错误详情" name="details">
            <pre class="error-stack">{{ errorInfo }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>
      
      <!-- 操作按钮 -->
      <div class="error-actions">
        <el-button @click="retry" type="primary">重试</el-button>
        <el-button @click="reportError" type="warning">报告问题</el-button>
        <el-button @click="reload" type="info">刷新页面</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { ErrorHandler } from '@/utils/validation';

export default {
  name: 'ErrorBoundary',
  props: {
    // 自定义错误标题
    errorTitle: {
      type: String,
      default: '出现了一个错误'
    },
    // 是否自动重试
    autoRetry: {
      type: Boolean,
      default: false
    },
    // 重试次数限制
    maxRetries: {
      type: Number,
      default: 3
    },
    // 降级组件
    fallbackComponent: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      hasError: false,
      errorMessage: '',
      errorInfo: '',
      retryCount: 0,
      showDetails: [],
      isDevelopment: process.env.NODE_ENV === 'development'
    };
  },
  errorCaptured(error, vm, info) {
    console.error('ErrorBoundary捕获到错误:', error, info);
    
    this.hasError = true;
    this.errorMessage = this.formatErrorMessage(error);
    this.errorInfo = this.formatErrorInfo(error, info);
    
    // 错误报告
    this.logError(error, vm, info);
    
    // 自动重试逻辑
    if (this.autoRetry && this.retryCount < this.maxRetries) {
      this.scheduleRetry();
    }
    
    // 阻止错误继续向上传播
    return false;
  },
  methods: {
    // 格式化错误消息
    formatErrorMessage(error) {
      if (error && error.message) {
        // 过滤敏感信息
        const safeMessage = error.message.replace(/file:\/\/\/.*?:/g, '文件:');
        return safeMessage;
      }
      return '发生了未知错误';
    },
    
    // 格式化错误信息
    formatErrorInfo(error, info) {
      if (!this.isDevelopment) {
        return null;
      }
      
      let errorInfo = `错误信息: ${error.message}\n`;
      errorInfo += `组件信息: ${info}\n`;
      
      if (error.stack) {
        errorInfo += `堆栈跟踪:\n${error.stack}`;
      }
      
      return errorInfo;
    },
    
    // 记录错误
    logError(error, vm, info) {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentInfo: info,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      // 发送错误报告到监控服务
      this.sendErrorReport(errorReport);
    },
    
    // 发送错误报告
    sendErrorReport(errorReport) {
      return ErrorHandler.safeExecute(() => {
        // 在生产环境中，这里应该发送到错误监控服务
        if (process.env.NODE_ENV === 'production') {
          // 例如：errorReportingService.send(errorReport)
          console.log('错误报告已记录:', errorReport);
        } else {
          console.error('开发环境错误报告:', errorReport);
        }
      }, '发送错误报告失败');
    },
    
    // 重试操作
    retry() {
      return ErrorHandler.safeExecute(() => {
        this.retryCount++;
        this.hasError = false;
        this.errorMessage = '';
        this.errorInfo = '';
        
        // 强制重新渲染
        this.$nextTick(() => {
          this.$forceUpdate();
        });
        
        this.$emit('retry', this.retryCount);
      }, '重试操作失败');
    },
    
    // 计划重试
    scheduleRetry() {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000); // 指数退避，最大10秒
      setTimeout(() => {
        this.retry();
      }, delay);
    },
    
    // 报告错误
    reportError() {
      return ErrorHandler.safeExecute(() => {
        const errorReport = {
          message: this.errorMessage,
          info: this.errorInfo,
          timestamp: new Date().toISOString()
        };
        
        // 复制错误信息到剪贴板
        if (navigator.clipboard) {
          navigator.clipboard.writeText(JSON.stringify(errorReport, null, 2))
            .then(() => {
              this.$message.success('错误信息已复制到剪贴板');
            })
            .catch(() => {
              this.$message.warning('复制失败，请手动复制错误信息');
            });
        }
        
        this.$emit('error-report', errorReport);
      }, '报告错误失败');
    },
    
    // 刷新页面
    reload() {
      window.location.reload();
    },
    
    // 重置错误状态
    reset() {
      this.hasError = false;
      this.errorMessage = '';
      this.errorInfo = '';
      this.retryCount = 0;
    }
  },
  
  // 监听props变化，自动重置错误状态
  watch: {
    '$route'() {
      this.reset();
    }
  }
};
</script>

<style scoped>
.error-boundary {
  width: 100%;
  height: 100%;
}

.error-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  min-height: 300px;
  text-align: center;
  background-color: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.error-icon {
  font-size: 64px;
  color: #f56c6c;
  margin-bottom: 20px;
}

.error-title {
  font-size: 20px;
  color: #303133;
  margin: 0 0 10px 0;
}

.error-message {
  font-size: 14px;
  color: #606266;
  margin: 0 0 20px 0;
  max-width: 600px;
  line-height: 1.5;
}

.error-details {
  width: 100%;
  max-width: 800px;
  margin: 20px 0;
}

.error-stack {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 15px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.error-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 768px) {
  .error-fallback {
    padding: 20px 10px;
    min-height: 200px;
  }
  
  .error-icon {
    font-size: 48px;
  }
  
  .error-title {
    font-size: 18px;
  }
  
  .error-actions {
    flex-direction: column;
    width: 100%;
    max-width: 200px;
  }
}
</style>
