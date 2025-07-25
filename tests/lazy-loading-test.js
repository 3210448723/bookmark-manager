// 懒加载功能测试脚本
// 在浏览器控制台中运行此脚本来测试懒加载功能

console.log('开始测试书签图标懒加载功能...');

// 1. 检查 Intersection Observer 支持
console.log('1. 检查 Intersection Observer 支持:');
if ('IntersectionObserver' in window) {
  console.log('✓ 浏览器支持 Intersection Observer');
} else {
  console.log('⚠ 浏览器不支持 Intersection Observer，将使用降级模式');
}

// 2. 检查懒加载组件实例
console.log('\n2. 检查懒加载组件实例:');
const bookmarkListComponent = document.querySelector('.bookmark-list')?.__vue__;
if (bookmarkListComponent && bookmarkListComponent.lazyLoading) {
  console.log('✓ 找到 BookmarkList 组件实例');
  console.log('懒加载配置:', bookmarkListComponent.lazyLoading);
} else {
  console.log('⚠ 未找到 BookmarkList 组件实例或懒加载配置');
}

// 3. 检查 favicon 元素
console.log('\n3. 检查 favicon 元素:');
const faviconElements = document.querySelectorAll('.favicon[data-url]');
console.log(`找到 ${faviconElements.length} 个 favicon 元素`);

if (faviconElements.length > 0) {
  console.log('前5个 favicon 元素的状态:');
  Array.from(faviconElements).slice(0, 5).forEach((img, index) => {
    const url = img.dataset.url;
    const isDefault = img.src.includes('data:image/svg');
    const isVisible = img.offsetParent !== null;
    
    console.log(`  ${index + 1}. URL: ${url}`);
    console.log(`     是否为默认图标: ${isDefault ? '是' : '否'}`);
    console.log(`     是否在视口中: ${isVisible ? '是' : '否'}`);
    console.log(`     当前src: ${img.src.substring(0, 50)}...`);
  });
}

// 4. 监听懒加载事件
console.log('\n4. 设置懒加载监听器:');
let loadCount = 0;
let errorCount = 0;

// 监听所有favicon的加载事件
document.addEventListener('load', (e) => {
  if (e.target.classList.contains('favicon')) {
    loadCount++;
    console.log(`✓ 图标加载成功 (#${loadCount}):`, e.target.dataset.url);
  }
}, true);

// 监听所有favicon的错误事件
document.addEventListener('error', (e) => {
  if (e.target.classList.contains('favicon')) {
    errorCount++;
    console.log(`✗ 图标加载失败 (#${errorCount}):`, e.target.dataset.url);
  }
}, true);

// 5. 测试滚动加载
console.log('\n5. 开始滚动测试:');
let scrollTestInterval;
let currentScrollPosition = 0;

function testScrollLoading() {
  const container = document.querySelector('.bookmark-table-wrapper');
  if (!container) {
    console.log('⚠ 未找到滚动容器');
    return;
  }
  
  console.log('开始模拟滚动，观察懒加载行为...');
  console.log('提示: 你可以手动滚动页面来触发更多图标加载');
  
  // 记录初始状态
  const initialLoaded = document.querySelectorAll('.favicon:not([src*="data:image/svg"])').length;
  console.log(`初始已加载的真实图标数量: ${initialLoaded}`);
  
  // 每2秒检查一次加载状态
  scrollTestInterval = setInterval(() => {
    const currentLoaded = document.querySelectorAll('.favicon:not([src*="data:image/svg"])').length;
    const totalFavicons = document.querySelectorAll('.favicon[data-url]').length;
    
    console.log(`当前状态: ${currentLoaded}/${totalFavicons} 个图标已加载`);
    
    if (currentLoaded === totalFavicons) {
      console.log('✓ 所有可见图标已加载完成');
      clearInterval(scrollTestInterval);
    }
  }, 2000);
}

// 延迟开始滚动测试，给组件初始化时间
setTimeout(testScrollLoading, 1000);

// 6. 提供手动测试函数
console.log('\n6. 手动测试函数:');
window.testLazyLoading = {
  // 强制加载所有图标
  loadAll: function() {
    console.log('强制加载所有图标...');
    const faviconElements = document.querySelectorAll('.favicon[data-url]');
    faviconElements.forEach(img => {
      const url = img.dataset.url;
      if (url && bookmarkListComponent) {
        bookmarkListComponent.loadFaviconLazy(img, url);
      }
    });
  },
  
  // 查看加载统计
  getStats: function() {
    const total = document.querySelectorAll('.favicon[data-url]').length;
    const loaded = document.querySelectorAll('.favicon:not([src*="data:image/svg"])').length;
    const defaultIcons = document.querySelectorAll('.favicon[src*="data:image/svg"]').length;
    
    return {
      total,
      loaded,
      defaultIcons,
      loadSuccessRate: `${((loaded / total) * 100).toFixed(1)}%`
    };
  },
  
  // 清理测试
  cleanup: function() {
    if (scrollTestInterval) {
      clearInterval(scrollTestInterval);
    }
    console.log('测试清理完成');
  }
};

console.log('\n✓ 懒加载测试工具已准备就绪');
console.log('使用方法:');
console.log('  - testLazyLoading.loadAll() // 强制加载所有图标');
console.log('  - testLazyLoading.getStats() // 查看加载统计');
console.log('  - testLazyLoading.cleanup() // 清理测试');
console.log('\n手动滚动页面可以观察懒加载效果');
