<template>
  <div 
    class="virtual-list" 
    :style="{ height: containerHeight + 'px' }"
    @scroll="handleScroll"
    ref="container"
  >
    <!-- 虚拟滚动容器 -->
    <div 
      class="virtual-list-phantom" 
      :style="{ height: totalHeight + 'px' }"
    ></div>
    
    <!-- 可视区域内容 -->
    <div 
      class="virtual-list-content" 
      :style="{ transform: `translateY(${offsetY}px)` }"
    >
      <div
        v-for="item in visibleItems"
        :key="getItemKey(item)"
        :style="{ height: itemHeight + 'px' }"
        class="virtual-list-item"
      >
        <slot :item="item" :index="item.index"></slot>
      </div>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="loading" class="virtual-list-loading">
      <i class="el-icon-loading"></i>
      <span>加载中...</span>
    </div>
    
    <!-- 空状态 -->
    <div v-if="!loading && items.length === 0" class="virtual-list-empty">
      <slot name="empty">
        <div class="empty-content">
          <i class="el-icon-box"></i>
          <p>暂无数据</p>
        </div>
      </slot>
    </div>
  </div>
</template>

<script>
import { PerformanceUtils } from '@/utils/validation';

export default {
  name: 'VirtualList',
  props: {
    // 数据源
    items: {
      type: Array,
      default: () => []
    },
    // 每项高度
    itemHeight: {
      type: Number,
      default: 50
    },
    // 容器高度
    containerHeight: {
      type: Number,
      default: 400
    },
    // 缓冲区项目数（上下额外渲染的项目数）
    bufferSize: {
      type: Number,
      default: 5
    },
    // 获取项目唯一键的函数
    keyField: {
      type: String,
      default: 'id'
    },
    // 自定义键获取函数
    getKey: {
      type: Function,
      default: null
    },
    // 加载状态
    loading: {
      type: Boolean,
      default: false
    },
    // 是否开启无限滚动
    infiniteScroll: {
      type: Boolean,
      default: false
    },
    // 触发加载更多的距离
    threshold: {
      type: Number,
      default: 100
    }
  },
  data() {
    return {
      scrollTop: 0,
      startIndex: 0,
      endIndex: 0,
      offsetY: 0,
      // 性能优化：防抖滚动处理
      handleScrollDebounced: null
    };
  },
  computed: {
    // 可视区域内可容纳的项目数
    visibleCount() {
      return Math.ceil(this.containerHeight / this.itemHeight);
    },
    
    // 总高度
    totalHeight() {
      return this.items.length * this.itemHeight;
    },
    
    // 可视区域内的项目
    visibleItems() {
      return this.items.slice(this.startIndex, this.endIndex + 1).map((item, index) => ({
        ...item,
        index: this.startIndex + index
      }));
    }
  },
  created() {
    // 创建防抖的滚动处理函数
    this.handleScrollDebounced = PerformanceUtils.debounce(
      this.updateVisibleRange, 
      16 // 约60fps的频率
    );
  },
  mounted() {
    this.updateVisibleRange();
    
    // 监听容器大小变化
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.$refs.container);
    }
  },
  beforeDestroy() {
    // 清理资源
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  },
  methods: {
    // 处理滚动事件
    handleScroll(event) {
      this.scrollTop = event.target.scrollTop;
      this.handleScrollDebounced();
      
      // 无限滚动检测
      if (this.infiniteScroll) {
        this.checkInfiniteScroll(event.target);
      }
    },
    
    // 更新可视范围
    updateVisibleRange() {
      const startIndex = Math.floor(this.scrollTop / this.itemHeight);
      const endIndex = Math.min(
        startIndex + this.visibleCount + this.bufferSize,
        this.items.length - 1
      );
      
      this.startIndex = Math.max(0, startIndex - this.bufferSize);
      this.endIndex = endIndex;
      this.offsetY = this.startIndex * this.itemHeight;
    },
    
    // 检查无限滚动
    checkInfiniteScroll(target) {
      const { scrollTop, scrollHeight, clientHeight } = target;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceToBottom < this.threshold && !this.loading) {
        this.$emit('load-more');
      }
    },
    
    // 处理容器大小变化
    handleResize() {
      this.$nextTick(() => {
        this.updateVisibleRange();
      });
    },
    
    // 获取项目键值
    getItemKey(item) {
      if (this.getKey && typeof this.getKey === 'function') {
        return this.getKey(item);
      }
      return item[this.keyField] || item.index;
    },
    
    // 滚动到指定项目
    scrollToItem(index) {
      if (index < 0 || index >= this.items.length) {
        console.warn('Virtual List: 无效的索引', index);
        return;
      }
      
      const scrollTop = index * this.itemHeight;
      this.$refs.container.scrollTop = scrollTop;
    },
    
    // 滚动到顶部
    scrollToTop() {
      this.$refs.container.scrollTop = 0;
    },
    
    // 滚动到底部
    scrollToBottom() {
      this.$refs.container.scrollTop = this.totalHeight;
    },
    
    // 获取当前可视区域信息
    getVisibleRange() {
      return {
        startIndex: this.startIndex,
        endIndex: this.endIndex,
        visibleCount: this.endIndex - this.startIndex + 1
      };
    },
    
    // 强制更新
    forceUpdate() {
      this.$nextTick(() => {
        this.updateVisibleRange();
        this.$forceUpdate();
      });
    }
  },
  watch: {
    items() {
      // 数据变化时更新可视范围
      this.$nextTick(() => {
        this.updateVisibleRange();
      });
    },
    
    itemHeight() {
      // 项目高度变化时更新
      this.$nextTick(() => {
        this.updateVisibleRange();
      });
    }
  }
};
</script>

<style scoped>
.virtual-list {
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

.virtual-list-phantom {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
}

.virtual-list-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.virtual-list-item {
  box-sizing: border-box;
}

.virtual-list-loading {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  color: #666;
}

.virtual-list-loading i {
  margin-right: 8px;
}

.virtual-list-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.empty-content {
  color: #909399;
}

.empty-content i {
  font-size: 48px;
  display: block;
  margin-bottom: 15px;
}

.empty-content p {
  margin: 0;
  font-size: 14px;
}

/* 滚动条样式优化 */
.virtual-list::-webkit-scrollbar {
  width: 8px;
}

.virtual-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.virtual-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.virtual-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
