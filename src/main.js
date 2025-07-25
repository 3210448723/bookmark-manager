import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import store from './store'
import VueDraggable from 'vuedraggable'

// 只在开发环境显示生产提示
Vue.config.productionTip = process.env.NODE_ENV === 'development'

// 开发环境配置
if (process.env.NODE_ENV === 'development') {
  Vue.config.devtools = true
  Vue.config.debug = true
} else {
  // 生产环境配置
  Vue.config.devtools = false
  Vue.config.debug = false
  Vue.config.silent = true
}

Vue.use(ElementUI)
Vue.component('vue-draggable', VueDraggable)

new Vue({
  store,
  render: h => h(App),
  async mounted() {
    // 确保在store完全挂载后再初始化书签顺序
    try {
      await this.$nextTick()
      await this.$store.dispatch('bookmarks/initializeBookmarkOrder')
    } catch (error) {
      console.error('初始化书签顺序失败:', error)
    }
  },
  errorCaptured(err, vm, info) {
    // 全局错误处理
    console.error('全局错误捕获:', err, info)
    
    // 在生产环境中，可以发送错误到监控服务
    if (process.env.NODE_ENV === 'production') {
      // 发送到错误监控服务
      // errorReportingService.report(err, info)
    }
    
    return false
  }
}).$mount('#app')
