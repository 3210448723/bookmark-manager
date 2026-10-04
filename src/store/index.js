import Vue from 'vue'
import Vuex from 'vuex'
import createPersistedState from 'vuex-persistedstate'
import bookmarks from './modules/bookmarks'
import preferences from './modules/preferences'

Vue.use(Vuex)

export default new Vuex.Store({
  modules: {
    bookmarks,
    preferences
  },
  plugins: [
    createPersistedState({
      key: 'bookmark-manager',
      // 只持久化用户数据和可撤销快照，排除路径缓存/选中状态，避免 localStorage
      // 随大书签列表成倍膨胀，也避免刷新后弹出一条过期的操作通知。
      reducer(state) {
        return {
          bookmarks: {
            bookmarks: state.bookmarks.bookmarks,
            folders: state.bookmarks.folders,
            history: state.bookmarks.history,
            currentHistoryIndex: state.bookmarks.currentHistoryIndex,
            sortHistory: state.bookmarks.sortHistory
          },
          preferences: {
            theme: state.preferences.theme
          }
        };
      },
      rehydrated(store) {
        // 清理旧版本可能留下的函数型历史记录，并恢复可用的索引范围。
        store.dispatch('bookmarks/repairPersistedHistory');
      }
    })
  ]
})
