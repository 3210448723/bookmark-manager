import Vue from 'vue'
import Vuex from 'vuex'
import createPersistedState from 'vuex-persistedstate'
import bookmarks from './modules/bookmarks'

Vue.use(Vuex)

export default new Vuex.Store({
  modules: {
    bookmarks
  },
  plugins: [
    createPersistedState({
      key: 'bookmark-manager',
      paths: ['bookmarks'],
      // 自定义还原器，确保 Set 对象正确初始化
      rehydrated(store) {
        // 确保 undoneOperationIds 是 Set 对象
        if (store.state.bookmarks.undoneOperationIds && !(store.state.bookmarks.undoneOperationIds instanceof Set)) {
          store.commit('bookmarks/INIT_UNDONE_OPERATION_IDS');
        }
      }
    })
  ]
}) 