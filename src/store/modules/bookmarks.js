/**
 * 书签核心状态模块。
 *
 * 设计约束：
 * 1. 所有写入 Vuex 的历史记录都必须是 JSON 可序列化数据，才能跨刷新保存；
 * 2. 书签展示顺序只由 `order` 字段决定，数组物理顺序不再承担业务语义；
 * 3. 导入数据必须经过统一的 ID 重映射，每次导入都拥有独立的根分组；
 * 4. 所有集合操作都先做边界检查，避免损坏本地持久化数据。
 */

import { Validator, SecurityUtils, BookmarkValidator } from '@/utils/validation';
import { DevTools } from '@/utils/devTools';

const { createSortComparator, normalizeSortFunction } = require('@/utils/sortFunction');
const { createImportBatch } = require('@/utils/importBatch');

/** @returns {string} 低碰撞概率的本地 ID */
const generateId = (prefix = 'item') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** 清除依赖书签路径和排序的派生缓存。 */
const clearCache = (state) => {
  state._cachedBookmarksWithPath = null;
  state._dataVersion += 1;
};

/**
 * 对新增/导入的书签做安全清理。新增数据允许没有 id，更新数据则要求保留原 id。
 * @param {Object} bookmark
 * @param {boolean} requireId
 * @returns {Object|null}
 */
const sanitizeBookmark = (bookmark, requireId = false) => {
  if (!bookmark || typeof bookmark !== 'object') return null;
  const candidate = {
    ...bookmark,
    id: bookmark.id || generateId('bookmark'),
    name: SecurityUtils.sanitizeInput(bookmark.name || ''),
    url: SecurityUtils.sanitizeUrl(bookmark.url || ''),
    description: SecurityUtils.sanitizeInput(bookmark.description || ''),
    folderId: Validator.isValidId(bookmark.folderId) ? bookmark.folderId : 'root'
  };

  if (requireId && !Validator.isValidId(candidate.id)) return null;
  const validation = BookmarkValidator.validateBookmark(candidate);
  return validation.isValid ? candidate : null;
};

/** 对新增/导入的文件夹做安全清理。 */
const sanitizeFolder = (folder, requireId = false) => {
  if (!folder || typeof folder !== 'object') return null;
  const candidate = {
    ...folder,
    id: folder.id || generateId('folder'),
    name: SecurityUtils.sanitizeInput(folder.name || '未命名文件夹'),
    parentId: folder.parentId === null
      ? null
      : (folder.parentId && Validator.isValidId(folder.parentId) ? folder.parentId : 'root')
  };

  if (requireId && !Validator.isValidId(candidate.id)) return null;
  const validation = BookmarkValidator.validateFolder(candidate);
  return validation.isValid ? candidate : null;
};

/** 按 order 稳定排序，兼容旧数据中没有 order 的书签。 */
const getOrderedBookmarks = (state, folderId) => state.bookmarks
  .filter(bookmark => bookmark.folderId === folderId)
  .map((bookmark, index) => ({ bookmark, index }))
  .sort((left, right) => {
    const orderDiff = (left.bookmark.order ?? left.index) - (right.bookmark.order ?? right.index);
    return orderDiff || left.index - right.index;
  })
  .map(item => item.bookmark);

const getOrderIds = (state, folderId) => getOrderedBookmarks(state, folderId).map(bookmark => bookmark.id);

/** 将一个顺序快照应用到指定文件夹。 */
const restoreOrder = (state, folderId, orderIds) => {
  const orderMap = new Map((orderIds || []).map((id, index) => [id, index]));
  const remaining = getOrderedBookmarks(state, folderId).filter(bookmark => !orderMap.has(bookmark.id));
  remaining.forEach((bookmark, index) => orderMap.set(bookmark.id, orderMap.size + index));

  state.bookmarks.forEach(bookmark => {
    if (bookmark.folderId === folderId && orderMap.has(bookmark.id)) bookmark.order = orderMap.get(bookmark.id);
  });
  clearCache(state);
};

const rootFolder = () => ({
  id: 'root',
  name: '收藏夹根目录',
  parentId: null,
  isExpanded: true,
  order: 0
});

const state = {
  bookmarks: [],
  folders: [rootFolder()],
  selectedItems: [],
  invalidBookmarks: [],
  duplicateBookmarks: [],
  // 操作历史只保存数据快照，不保存函数引用，确保 vuex-persistedstate 可以正确序列化。
  history: [],
  currentHistoryIndex: -1,
  lastOperation: null,
  // 自定义排序函数历史，供排序对话框复用。
  sortHistory: [],
  _cachedBookmarksWithPath: null,
  _dataVersion: 0
};

const getters = {
  getFoldersByParentId: (moduleState) => (parentId) => moduleState.folders
    .filter(folder => folder.parentId === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),

  getAllChildFolders: (moduleState) => (parentId) => {
    const result = [];
    const visited = new Set();
    const visit = (currentId) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);
      moduleState.folders.filter(folder => folder.parentId === currentId).forEach(folder => {
        result.push(folder);
        visit(folder.id);
      });
    };
    visit(parentId);
    return result;
  },

  getBookmarksByFolderId: (moduleState) => (folderId) => getOrderedBookmarks(moduleState, folderId),
  getAllBookmarks: (moduleState) => moduleState.bookmarks,

  /** 根目录展示全部书签时，一次计算路径并缓存，避免每次渲染 O(书签数×文件夹数)。 */
  getAllBookmarksWithPath: (moduleState, moduleGetters) => {
    if (!moduleState._cachedBookmarksWithPath) {
      moduleState._cachedBookmarksWithPath = moduleState.bookmarks.map(bookmark => {
        const folderPath = moduleGetters.getFolderPath(bookmark.folderId);
        return { ...bookmark, folderPath, pathString: folderPath.map(folder => folder.name).join(' / ') };
      });
    }
    return moduleState._cachedBookmarksWithPath;
  },

  getInvalidBookmarks: (moduleState) => moduleState.invalidBookmarks,
  getDuplicateBookmarks: (moduleState) => moduleState.duplicateBookmarks,
  getSelectedItems: (moduleState) => moduleState.selectedItems,
  getSortHistory: (moduleState) => moduleState.sortHistory,

  /** 计算路径时限制深度并检测环，防止损坏数据造成死循环。 */
  getFolderPath: (moduleState) => (folderId) => {
    const path = [];
    const visited = new Set();
    let current = moduleState.folders.find(folder => folder.id === folderId);
    while (current && !visited.has(current.id) && path.length <= 50) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId === null ? null : moduleState.folders.find(folder => folder.id === current.parentId);
    }
    return path;
  }
};

const mutations = {
  CLEAR_CACHE(moduleState) { clearCache(moduleState); },

  ADD_BOOKMARK(moduleState, bookmark) {
    const cleanBookmark = sanitizeBookmark(bookmark);
    if (!cleanBookmark) throw new Error('无效的书签数据');
    moduleState.bookmarks.push({
      ...cleanBookmark,
      createdAt: cleanBookmark.createdAt || new Date().toISOString(),
      order: getOrderedBookmarks(moduleState, cleanBookmark.folderId).length
    });
    clearCache(moduleState);
  },

  UPDATE_BOOKMARK(moduleState, { id, updates }) {
    const index = moduleState.bookmarks.findIndex(bookmark => bookmark.id === id);
    if (index < 0) throw new Error('未找到指定书签');
    const cleanBookmark = sanitizeBookmark({ ...moduleState.bookmarks[index], ...updates }, true);
    if (!cleanBookmark) throw new Error('更新数据验证失败');
    moduleState.bookmarks.splice(index, 1, { ...moduleState.bookmarks[index], ...cleanBookmark });
    clearCache(moduleState);
  },

  DELETE_BOOKMARK(moduleState, id) {
    moduleState.bookmarks = moduleState.bookmarks.filter(bookmark => bookmark.id !== id);
    clearCache(moduleState);
  },

  DELETE_BOOKMARKS_BULK(moduleState, ids) {
    const idSet = new Set(ids || []);
    moduleState.bookmarks = moduleState.bookmarks.filter(bookmark => !idSet.has(bookmark.id));
    moduleState.selectedItems = [];
    clearCache(moduleState);
  },

  ADD_FOLDER(moduleState, folder) {
    const cleanFolder = sanitizeFolder(folder);
    if (!cleanFolder) throw new Error('无效的文件夹数据');
    moduleState.folders.push({
      ...cleanFolder,
      createdAt: cleanFolder.createdAt || new Date().toISOString(),
      order: moduleState.folders.filter(item => item.parentId === cleanFolder.parentId).length
    });
    clearCache(moduleState);
  },

  UPDATE_FOLDER(moduleState, { id, updates }) {
    const index = moduleState.folders.findIndex(folder => folder.id === id);
    if (index < 0) throw new Error('未找到指定文件夹');
    if (id === 'root' && updates.parentId !== undefined) throw new Error('根文件夹不能移动');
    const current = moduleState.folders[index];
    const cleanFolder = sanitizeFolder({ ...current, ...updates }, true);
    if (!cleanFolder) throw new Error('文件夹更新数据无效');
    moduleState.folders.splice(index, 1, { ...current, ...cleanFolder });
    clearCache(moduleState);
  },

  DELETE_FOLDER(moduleState, id) {
    if (id === 'root') throw new Error('不能删除根文件夹');
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      moduleState.folders.forEach(folder => {
        if (ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
      });
    }
    moduleState.folders = moduleState.folders.filter(folder => !ids.has(folder.id));
    moduleState.bookmarks = moduleState.bookmarks.filter(bookmark => !ids.has(bookmark.folderId));
    clearCache(moduleState);
  },

  MOVE_ITEMS(moduleState, { itemIds, targetFolderId, itemType }) {
    const ids = new Set(itemIds || []);
    if (!moduleState.folders.some(folder => folder.id === targetFolderId)) return;
    if (itemType === 'bookmark') {
      moduleState.bookmarks.forEach(bookmark => { if (ids.has(bookmark.id)) bookmark.folderId = targetFolderId; });
    } else if (itemType === 'folder') {
      moduleState.folders.forEach(folder => {
        if (!ids.has(folder.id) || folder.id === 'root') return;
        // 禁止移动到自己的后代节点，保证树结构无环。
        let parent = targetFolderId;
        while (parent) {
          if (parent === folder.id) return;
          const parentFolder = moduleState.folders.find(item => item.id === parent);
          parent = parentFolder ? parentFolder.parentId : null;
        }
        folder.parentId = targetFolderId;
      });
    }
    clearCache(moduleState);
  },

  /** 导入时始终创建唯一的根分组，并重映射全部外部 ID。 */
  IMPORT_BOOKMARKS(moduleState, { bookmarks = [], folders = [], importRootName }) {
    const validFolders = folders.filter(folder => folder && folder.id !== 'root')
      .map(folder => sanitizeFolder(folder, true)).filter(Boolean);
    const batch = createImportBatch({
      bookmarks,
      folders: validFolders,
      importRootName: SecurityUtils.sanitizeInput(importRootName || '导入书签'),
      rootFolderCount: moduleState.folders.filter(folder => folder.parentId === 'root').length,
      batchId: generateId('import')
    });
    const addedFolders = batch.folders;
    const addedBookmarks = batch.bookmarks.map(bookmark => sanitizeBookmark(bookmark, true)).filter(Boolean);

    moduleState.folders = moduleState.folders.concat(addedFolders);
    moduleState.bookmarks = moduleState.bookmarks.concat(addedBookmarks);
    clearCache(moduleState);
  },

  REMOVE_IMPORTED_CONTENT(moduleState, { folderIds, bookmarkIds }) {
    const folderIdSet = new Set(folderIds || []);
    const bookmarkIdSet = new Set(bookmarkIds || []);
    moduleState.folders = moduleState.folders.filter(folder => !folderIdSet.has(folder.id));
    moduleState.bookmarks = moduleState.bookmarks.filter(bookmark => !bookmarkIdSet.has(bookmark.id));
    clearCache(moduleState);
  },

  RESTORE_IMPORTED_CONTENT(moduleState, { folders, bookmarks }) {
    const existingFolderIds = new Set(moduleState.folders.map(folder => folder.id));
    const existingBookmarkIds = new Set(moduleState.bookmarks.map(bookmark => bookmark.id));
    moduleState.folders.push(...(folders || []).filter(folder => !existingFolderIds.has(folder.id)));
    moduleState.bookmarks.push(...(bookmarks || []).filter(bookmark => !existingBookmarkIds.has(bookmark.id)));
    clearCache(moduleState);
  },

  APPLY_BOOKMARK_ORDER(moduleState, { folderId, orderIds }) { restoreOrder(moduleState, folderId, orderIds); },

  REORDER_BOOKMARKS(moduleState, { folderId, bookmarkId, targetIndex }) {
    const ordered = getOrderedBookmarks(moduleState, folderId);
    const currentIndex = ordered.findIndex(bookmark => bookmark.id === bookmarkId);
    if (currentIndex < 0 || currentIndex === targetIndex) return;
    const [moved] = ordered.splice(currentIndex, 1);
    ordered.splice(Math.max(0, Math.min(Number(targetIndex) || 0, ordered.length)), 0, moved);
    restoreOrder(moduleState, folderId, ordered.map(bookmark => bookmark.id));
  },

  SET_SELECTED_ITEMS(moduleState, items) { moduleState.selectedItems = items || []; },
  CLEAR_SELECTED_ITEMS(moduleState) { moduleState.selectedItems = []; },
  SET_INVALID_BOOKMARKS(moduleState, bookmarks) { moduleState.invalidBookmarks = bookmarks || []; },
  SET_DUPLICATE_BOOKMARKS(moduleState, bookmarks) { moduleState.duplicateBookmarks = bookmarks || []; },

  TOGGLE_FOLDER_EXPANSION(moduleState, folderId) {
    const folder = moduleState.folders.find(item => item.id === folderId);
    if (folder) folder.isExpanded = !folder.isExpanded;
  },

  SORT_FOLDERS(moduleState, { parentId, orderIds }) {
    const orderMap = new Map((orderIds || []).map((id, index) => [id, index]));
    moduleState.folders.forEach(folder => {
      if (folder.parentId === parentId && orderMap.has(folder.id)) folder.order = orderMap.get(folder.id);
    });
  },

  ADD_OPERATION(moduleState, operation) {
    // 深拷贝会去掉旧版本残留的函数引用，保证持久化格式稳定。
    const serializable = JSON.parse(JSON.stringify({ ...operation, id: operation.id || generateId('operation'), timestamp: operation.timestamp || Date.now() }));
    if (moduleState.currentHistoryIndex < moduleState.history.length - 1) {
      moduleState.history = moduleState.history.slice(0, moduleState.currentHistoryIndex + 1);
    }
    moduleState.history.push(serializable);
    moduleState.currentHistoryIndex = moduleState.history.length - 1;
    moduleState.lastOperation = serializable;
  },

  UPDATE_HISTORY_INDEX(moduleState, index) {
    moduleState.currentHistoryIndex = Math.max(-1, Math.min(index, moduleState.history.length - 1));
    moduleState.lastOperation = null;
  },

  ADD_SORT_HISTORY(moduleState, { folderId, sortFunctionString }) {
    const normalized = normalizeSortFunction(sortFunctionString);
    const previous = moduleState.sortHistory.filter(item => item.sortFunctionString !== normalized);
    previous.unshift({ id: generateId('sort'), folderId, sortFunctionString: normalized, createdAt: new Date().toISOString() });
    moduleState.sortHistory = previous.slice(0, 30);
  },

  RESET_FOLDERS(moduleState) { moduleState.folders = [rootFolder()]; clearCache(moduleState); },
  RESET_BOOKMARKS(moduleState) {
    moduleState.bookmarks = [];
    moduleState.selectedItems = [];
    moduleState.invalidBookmarks = [];
    moduleState.duplicateBookmarks = [];
    clearCache(moduleState);
  },
  RESET_HISTORY(moduleState) { moduleState.history = []; moduleState.currentHistoryIndex = -1; moduleState.lastOperation = null; }
};

/** 为排序操作生成统一的可撤销历史记录。 */
const runSort = ({ commit, state: moduleState }, folderId, comparator, description, sortFunctionString = '') => {
  const beforeOrder = getOrderIds(moduleState, folderId);
  const afterOrder = getOrderedBookmarks(moduleState, folderId).slice().sort(comparator).map(bookmark => bookmark.id);
  commit('APPLY_BOOKMARK_ORDER', { folderId, orderIds: afterOrder });
  if (sortFunctionString) commit('ADD_SORT_HISTORY', { folderId, sortFunctionString });
  if (beforeOrder.join('|') !== afterOrder.join('|')) {
    commit('ADD_OPERATION', { type: 'sort', description, data: { folderId, beforeOrder, afterOrder, sortFunctionString } });
  }
  return Promise.resolve();
};

const actions = {
  initializeBookmarkOrder({ dispatch, commit, state: moduleState }) {
    const grouped = new Map();
    moduleState.bookmarks.forEach(bookmark => {
      const list = grouped.get(bookmark.folderId) || [];
      list.push(bookmark);
      grouped.set(bookmark.folderId, list);
    });
    grouped.forEach(list => list.forEach((bookmark, index) => {
      if (bookmark.order === undefined) commit('UPDATE_BOOKMARK', { id: bookmark.id, updates: { order: index } });
    }));
    return dispatch('repairPersistedHistory');
  },

  repairPersistedHistory({ state: moduleState }) {
    moduleState.history = (moduleState.history || []).filter(operation => operation && operation.type && operation.data);
    moduleState.currentHistoryIndex = Math.min(moduleState.currentHistoryIndex, moduleState.history.length - 1);
    return Promise.resolve();
  },

  addBookmark({ commit }, bookmark) { commit('ADD_BOOKMARK', bookmark); return Promise.resolve(); },
  updateBookmark({ commit }, payload) { commit('UPDATE_BOOKMARK', payload); return Promise.resolve(); },
  deleteBookmark({ commit }, id) { commit('DELETE_BOOKMARK', id); return Promise.resolve(); },
  deleteBookmarksBulk({ commit }, ids) { commit('DELETE_BOOKMARKS_BULK', ids); return Promise.resolve(); },
  addFolder({ commit }, folder) { commit('ADD_FOLDER', folder); return Promise.resolve(); },
  updateFolder({ commit }, payload) { commit('UPDATE_FOLDER', payload); return Promise.resolve(); },
  deleteFolder({ commit }, id) { commit('DELETE_FOLDER', id); return Promise.resolve(); },

  moveItems({ commit, state: moduleState }, { itemIds, targetFolderId, itemType, skipHistory = false }) {
    const originalState = {};
    (itemIds || []).forEach(id => {
      const item = itemType === 'bookmark' ? moduleState.bookmarks.find(bookmark => bookmark.id === id) : moduleState.folders.find(folder => folder.id === id);
      if (item) originalState[id] = itemType === 'bookmark' ? { folderId: item.folderId } : { parentId: item.parentId };
    });
    commit('MOVE_ITEMS', { itemIds, targetFolderId, itemType });
    if (!skipHistory) commit('ADD_OPERATION', {
      type: 'moveItems',
      description: `移动${itemType === 'bookmark' ? '书签' : '文件夹'}`,
      data: { itemIds, targetFolderId, itemType, originalState }
    });
    return Promise.resolve();
  },

  importBookmarks({ commit, state: moduleState }, { bookmarks, folders, importRootName }) {
    const beforeFolderIds = new Set(moduleState.folders.map(folder => folder.id));
    const beforeBookmarkIds = new Set(moduleState.bookmarks.map(bookmark => bookmark.id));
    commit('IMPORT_BOOKMARKS', { bookmarks, folders, importRootName });
    const addedFolders = moduleState.folders.filter(folder => !beforeFolderIds.has(folder.id));
    const addedBookmarks = moduleState.bookmarks.filter(bookmark => !beforeBookmarkIds.has(bookmark.id));
    if (addedFolders.length > 0) commit('ADD_OPERATION', {
      type: 'import',
      description: `导入书签分组“${addedFolders[0].name}”`,
      data: {
        folders: addedFolders,
        bookmarks: addedBookmarks,
        folderIds: addedFolders.map(folder => folder.id),
        bookmarkIds: addedBookmarks.map(bookmark => bookmark.id)
      }
    });
    return Promise.resolve({ folders: addedFolders, bookmarks: addedBookmarks });
  },

  setSelectedItems({ commit }, items) { commit('SET_SELECTED_ITEMS', items); return Promise.resolve(); },
  clearSelectedItems({ commit }) { commit('CLEAR_SELECTED_ITEMS'); return Promise.resolve(); },
  toggleFolderExpansion({ commit }, folderId) { commit('TOGGLE_FOLDER_EXPANSION', folderId); return Promise.resolve(); },

  sortBookmarksByName(context, folderId) { return runSort(context, folderId, (a, b) => a.name.localeCompare(b.name), '按名称排序'); },
  sortBookmarksByUrl(context, folderId) { return runSort(context, folderId, (a, b) => a.url.localeCompare(b.url), '按 URL 排序'); },
  sortBookmarksByDate(context, folderId) { return runSort(context, folderId, (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(), '按添加日期排序'); },
  sortBookmarksCustom(context, { folderId, sortFunctionString }) {
    try {
      const comparator = createSortComparator(sortFunctionString);
      return runSort(context, folderId, comparator.compare, '自定义排序', comparator.source);
    } catch (error) {
      DevTools.error('自定义排序函数无效:', error);
      return Promise.reject(error);
    }
  },

  sortFoldersByName({ commit, state: moduleState }, parentId) {
    const orderIds = moduleState.folders.filter(folder => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name)).map(folder => folder.id);
    commit('SORT_FOLDERS', { parentId, orderIds });
    return Promise.resolve();
  },

  reorderBookmarks({ commit, state: moduleState }, { folderId, bookmarkId, targetIndex, operationType = 'reorder', skipHistory = false }) {
    const beforeOrder = getOrderIds(moduleState, folderId);
    commit('REORDER_BOOKMARKS', { folderId, bookmarkId, targetIndex });
    const afterOrder = getOrderIds(moduleState, folderId);
    if (!skipHistory && beforeOrder.join('|') !== afterOrder.join('|')) {
      const bookmark = moduleState.bookmarks.find(item => item.id === bookmarkId);
      const actionName = operationType === 'up' ? '上移' : operationType === 'down' ? '下移' : '调整位置';
      commit('ADD_OPERATION', { type: 'reorder', description: `${actionName}书签“${bookmark ? bookmark.name : ''}”`, data: { folderId, bookmarkId, beforeOrder, afterOrder } });
    }
    return Promise.resolve();
  },

  moveBookmarkUp({ state: moduleState, dispatch }, bookmarkId) {
    const bookmark = moduleState.bookmarks.find(item => item.id === bookmarkId);
    if (!bookmark) return Promise.resolve();
    const order = getOrderIds(moduleState, bookmark.folderId);
    const index = order.indexOf(bookmarkId);
    return index > 0 ? dispatch('reorderBookmarks', { folderId: bookmark.folderId, bookmarkId, targetIndex: index - 1, operationType: 'up' }) : Promise.resolve();
  },
  moveBookmarkDown({ state: moduleState, dispatch }, bookmarkId) {
    const bookmark = moduleState.bookmarks.find(item => item.id === bookmarkId);
    if (!bookmark) return Promise.resolve();
    const order = getOrderIds(moduleState, bookmark.folderId);
    const index = order.indexOf(bookmarkId);
    return index >= 0 && index < order.length - 1 ? dispatch('reorderBookmarks', { folderId: bookmark.folderId, bookmarkId, targetIndex: index + 1, operationType: 'down' }) : Promise.resolve();
  },

  addOperation({ commit }, operation) { commit('ADD_OPERATION', operation); return Promise.resolve(); },

  /** 撤销使用持久化快照，不依赖已经被 JSON 丢弃的闭包函数。 */
  undo({ commit, state: moduleState }) {
    const operation = moduleState.history[moduleState.currentHistoryIndex];
    if (!operation) return Promise.resolve(false);
    const data = operation.data || {};
    if (operation.type === 'sort' || operation.type === 'reorder') commit('APPLY_BOOKMARK_ORDER', { folderId: data.folderId, orderIds: data.beforeOrder });
    else if (operation.type === 'moveItems') Object.keys(data.originalState || {}).forEach(id => {
      const original = data.originalState[id];
      commit('MOVE_ITEMS', { itemIds: [id], targetFolderId: data.itemType === 'bookmark' ? original.folderId : original.parentId, itemType: data.itemType });
    });
    else if (operation.type === 'import') commit('REMOVE_IMPORTED_CONTENT', { folderIds: data.folderIds, bookmarkIds: data.bookmarkIds });
    commit('UPDATE_HISTORY_INDEX', moduleState.currentHistoryIndex - 1);
    return Promise.resolve(true);
  },

  redo({ commit, state: moduleState }) {
    const nextIndex = moduleState.currentHistoryIndex + 1;
    const operation = moduleState.history[nextIndex];
    if (!operation) return Promise.resolve(false);
    const data = operation.data || {};
    if (operation.type === 'sort' || operation.type === 'reorder') commit('APPLY_BOOKMARK_ORDER', { folderId: data.folderId, orderIds: data.afterOrder });
    else if (operation.type === 'moveItems') commit('MOVE_ITEMS', { itemIds: data.itemIds, targetFolderId: data.targetFolderId, itemType: data.itemType });
    else if (operation.type === 'import') commit('RESTORE_IMPORTED_CONTENT', { folders: data.folders, bookmarks: data.bookmarks });
    commit('UPDATE_HISTORY_INDEX', nextIndex);
    return Promise.resolve(true);
  },
  undoOperation({ dispatch }) { return dispatch('undo'); },
  redoOperation({ dispatch }) { return dispatch('redo'); },

  checkInvalidBookmarks({ commit, state: moduleState }) {
    const check = async () => {
      const invalid = [];
      for (let index = 0; index < moduleState.bookmarks.length; index += 10) {
        const batch = moduleState.bookmarks.slice(index, index + 10);
        const result = await Promise.all(batch.map(async bookmark => {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutId = setTimeout(() => controller && controller.abort(), 3000);
          try {
            const response = await fetch(bookmark.url, { method: 'HEAD', signal: controller ? controller.signal : undefined });
            return response.ok ? null : bookmark;
          } catch (error) {
            return bookmark;
          } finally {
            clearTimeout(timeoutId);
          }
        }));
        invalid.push(...result.filter(Boolean));
      }
      commit('SET_INVALID_BOOKMARKS', invalid);
      return invalid;
    };
    return check();
  },

  checkDuplicateBookmarks({ commit, state: moduleState }) {
    const seen = new Set();
    const duplicate = moduleState.bookmarks.filter(bookmark => {
      if (seen.has(bookmark.url)) return true;
      seen.add(bookmark.url);
      return false;
    });
    commit('SET_DUPLICATE_BOOKMARKS', duplicate);
    return Promise.resolve(duplicate);
  },

  resetAllFolders({ commit }) { commit('RESET_FOLDERS'); return Promise.resolve(); },
  resetAllBookmarks({ commit }) { commit('RESET_BOOKMARKS'); return Promise.resolve(); },
  resetHistory({ commit }) { commit('RESET_HISTORY'); return Promise.resolve(); },
  resetAll({ dispatch }) { return Promise.all([dispatch('resetAllBookmarks'), dispatch('resetAllFolders'), dispatch('resetHistory')]); }
};

export default { namespaced: true, state, getters, mutations, actions };
