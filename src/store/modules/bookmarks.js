// ID生成器
const generateId = () => Math.random().toString(36).substr(2, 9);

// 引入验证工具
import { Validator, SecurityUtils, ErrorHandler, BookmarkValidator } from '@/utils/validation';
import { APP_CONSTANTS } from '@/constants';

// 缓存清理辅助函数
const clearCache = (state) => {
  state._cachedBookmarksWithPath = null;
  state._lastBookmarkCount = 0;
};

// 安全验证函数
const validateBookmarkData = (bookmark) => {
  return ErrorHandler.safeExecute(() => {
    if (!bookmark || typeof bookmark !== 'object') {
      throw new Error('书签数据必须是对象');
    }
    
    // 使用 BookmarkValidator 进行验证
    const validation = BookmarkValidator.validateBookmark(bookmark);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    // 清理和安全化数据
    return {
      ...bookmark,
      name: SecurityUtils.sanitizeInput(bookmark.name || ''),
      url: bookmark.url ? SecurityUtils.sanitizeUrl(bookmark.url) : '',
      description: bookmark.description ? SecurityUtils.sanitizeInput(bookmark.description) : '',
      folderId: Validator.isValidId(bookmark.folderId) ? bookmark.folderId : 'root'
    };
  }, '书签数据验证失败', null);
};

const validateFolderData = (folder) => {
  return ErrorHandler.safeExecute(() => {
    if (!folder || typeof folder !== 'object') {
      throw new Error('文件夹数据必须是对象');
    }
    
    // 使用 BookmarkValidator 进行验证
    const validation = BookmarkValidator.validateFolder(folder);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    // 清理和安全化数据
    return {
      ...folder,
      name: SecurityUtils.sanitizeInput(folder.name || ''),
      parentId: Validator.isValidId(folder.parentId) ? folder.parentId : 'root'
    };
  }, '文件夹数据验证失败', null);
};

// 统一的操作记录系统
class OperationManager {
  constructor() {
    this.operations = new Map();
  }
  
  // 注册可撤销操作
  register(type, undoFn, redoFn) {
    this.operations.set(type, { undoFn, redoFn });
  }
  
  // 执行撤销
  undo(operation, dispatch) {
    const handler = this.operations.get(operation.type);
    if (handler && handler.undoFn) {
      return handler.undoFn(operation.data, dispatch);
    }
    // 支持旧格式的undo函数
    if (typeof operation.undo === 'function') {
      return operation.undo();
    }
    console.warn(`未找到操作类型 ${operation.type} 的撤销处理器`);
  }
  
  // 执行重做
  redo(operation, dispatch) {
    const handler = this.operations.get(operation.type);
    if (handler && handler.redoFn) {
      return handler.redoFn(operation.data, dispatch);
    }
    // 支持旧格式的redo函数  
    if (typeof operation.redo === 'function') {
      return operation.redo();
    }
    console.warn(`未找到操作类型 ${operation.type} 的重做处理器`);
  }
}

// 创建全局操作管理器实例
const operationManager = new OperationManager();

const state = {
  bookmarks: [],
  folders: [
    {
      id: 'root',
      name: '收藏夹根目录',
      parentId: null,
      isExpanded: true,
    }
  ],
  selectedItems: [],
  invalidBookmarks: [],
  duplicateBookmarks: [],
  // 操作历史记录
  history: [],
  // 当前操作索引，用于撤销
  currentHistoryIndex: -1,
  // 最后一次操作描述
  lastOperation: null,
  // 已撤销的操作ID集合
  undoneOperationIds: new Set(),
  // 缓存相关
  _cachedBookmarksWithPath: null,
  _lastBookmarkCount: 0
};

const getters = {
  // 获取指定文件夹下的子文件夹
  getFoldersByParentId: (state) => (parentId) => {
    return state.folders.filter(folder => folder.parentId === parentId);
  },

  // 获取指定文件夹下的所有子文件夹(包括嵌套的)
  getAllChildFolders: (state) => (parentId) => {
    const result = [];
    
    const findAllChildren = (pid) => {
      const children = state.folders.filter(folder => folder.parentId === pid);
      children.forEach(child => {
        result.push(child);
        findAllChildren(child.id);
      });
    };
    
    findAllChildren(parentId);
    return result;
  },

  // 获取指定文件夹下的书签
  getBookmarksByFolderId: (state) => (folderId) => {
    return state.bookmarks
      .filter(bookmark => bookmark.folderId === folderId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  // 获取所有书签（用于根目录显示）
  getAllBookmarks: (state) => {
    return state.bookmarks;
  },

  // 获取所有书签并带有路径信息（用于根目录优化显示）
  getAllBookmarksWithPath: (state, getters) => {
    // 使用缓存避免重复计算
    if (!state._cachedBookmarksWithPath || state._lastBookmarkCount !== state.bookmarks.length) {
      state._cachedBookmarksWithPath = state.bookmarks.map(bookmark => {
        const folderPath = getters.getFolderPath(bookmark.folderId);
        const pathString = folderPath.map(f => f.name).join(' / ');
        return {
          ...bookmark,
          folderPath: folderPath,
          pathString: pathString
        };
      });
      state._lastBookmarkCount = state.bookmarks.length;
    }
    return state._cachedBookmarksWithPath;
  },

  // 获取无效书签
  getInvalidBookmarks: (state) => {
    return state.invalidBookmarks;
  },

  // 获取重复书签
  getDuplicateBookmarks: (state) => {
    return state.duplicateBookmarks;
  },

  // 获取选中的项目
  getSelectedItems: (state) => {
    return state.selectedItems;
  },

  // 获取文件夹路径
  getFolderPath: (state) => (folderId) => {
    const path = [];
    let currentFolder = state.folders.find(f => f.id === folderId);
    
    while (currentFolder) {
      path.unshift(currentFolder);
      if (currentFolder.parentId === null) break;
      currentFolder = state.folders.find(f => f.id === currentFolder.parentId);
    }
    
    return path;
  }
};

const mutations = {
  // 清除缓存
  CLEAR_CACHE(state) {
    state._cachedBookmarksWithPath = null;
    state._lastBookmarkCount = 0;
  },

  // 添加书签
  ADD_BOOKMARK(state, bookmark) {
    return ErrorHandler.safeExecute(() => {
      // 验证和清理书签数据
      const cleanBookmark = validateBookmarkData(bookmark);
      if (!cleanBookmark) {
        throw new Error('无效的书签数据');
      }
      
      // 获取同一文件夹下现有书签的最大 order 值
      const maxOrder = state.bookmarks
        .filter(b => b.folderId === cleanBookmark.folderId)
        .reduce((max, b) => Math.max(max, b.order || 0), -1);
      
      const newBookmark = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        order: maxOrder + 1,
        ...cleanBookmark
      };
      
      state.bookmarks.push(newBookmark);
      clearCache(state);
      
      return newBookmark;
    }, '添加书签失败');
  },

  // 更新书签
  UPDATE_BOOKMARK(state, { id, updates }) {
    return ErrorHandler.safeExecute(() => {
      // 验证ID
      if (!Validator.isValidId(id)) {
        throw new Error('无效的书签ID');
      }
      
      // 验证更新数据
      if (!updates || typeof updates !== 'object') {
        throw new Error('更新数据必须是对象');
      }
      
      const index = state.bookmarks.findIndex(bookmark => bookmark.id === id);
      if (index === -1) {
        throw new Error('未找到指定书签');
      }
      
      // 创建更新后的书签数据进行验证
      const updatedBookmark = { ...state.bookmarks[index], ...updates };
      const cleanUpdates = validateBookmarkData(updatedBookmark);
      
      if (!cleanUpdates) {
        throw new Error('更新数据验证失败');
      }
      
      // 只更新经过验证的字段
      const allowedFields = ['name', 'url', 'description', 'folderId', 'order', 'isExpanded'];
      const safeUpdates = {};
      
      allowedFields.forEach(field => {
        if (field in updates) {
          safeUpdates[field] = cleanUpdates[field];
        }
      });
      
      state.bookmarks[index] = { ...state.bookmarks[index], ...safeUpdates };
      clearCache(state);
      
      return state.bookmarks[index];
    }, '更新书签失败');
  },

  // 删除书签
  DELETE_BOOKMARK(state, id) {
    return ErrorHandler.safeExecute(() => {
      // 验证ID
      if (!Validator.isValidId(id)) {
        throw new Error('无效的书签ID');
      }
      
      const originalLength = state.bookmarks.length;
      state.bookmarks = state.bookmarks.filter(bookmark => bookmark.id !== id);
      clearCache(state);
      
      return originalLength !== state.bookmarks.length;
    }, '删除书签失败', false);
  },

  // 批量删除书签
  DELETE_BOOKMARKS_BULK(state, ids) {
    return ErrorHandler.safeExecute(() => {
      // 验证ID数组
      if (!Validator.isValidArray(ids)) {
        throw new Error('ID列表必须是数组');
      }
      
      // 验证所有ID
      const validIds = ids.filter(id => Validator.isValidId(id));
      if (validIds.length === 0) {
        throw new Error('没有有效的书签ID');
      }
      
      const originalLength = state.bookmarks.length;
      state.bookmarks = state.bookmarks.filter(bookmark => !validIds.includes(bookmark.id));
      clearCache(state);
      
      return originalLength - state.bookmarks.length;
    }, '批量删除书签失败', 0);
  },

  // 添加文件夹
  ADD_FOLDER(state, folder) {
    return ErrorHandler.safeExecute(() => {
      // 验证和清理文件夹数据
      const cleanFolder = validateFolderData(folder);
      if (!cleanFolder) {
        throw new Error('无效的文件夹数据');
      }
      
      const newFolder = {
        id: generateId(),
        isExpanded: false,
        createdAt: new Date().toISOString(),
        ...cleanFolder
      };
      
      state.folders.push(newFolder);
      clearCache(state);
      
      return newFolder;
    }, '添加文件夹失败');
  },

  // 更新文件夹
  UPDATE_FOLDER(state, { id, updates }) {
    return ErrorHandler.safeExecute(() => {
      // 验证ID
      if (!Validator.isValidId(id)) {
        throw new Error('无效的文件夹ID');
      }
      
      // 验证更新数据
      if (!updates || typeof updates !== 'object') {
        throw new Error('更新数据必须是对象');
      }
      
      const index = state.folders.findIndex(folder => folder.id === id);
      if (index === -1) {
        throw new Error('未找到指定文件夹');
      }
      
      // 创建更新后的文件夹数据进行验证
      const updatedFolder = { ...state.folders[index], ...updates };
      
      // 对于名称更新，需要验证
      if ('name' in updates) {
        const cleanFolder = validateFolderData(updatedFolder);
        if (!cleanFolder) {
          throw new Error('文件夹名称验证失败');
        }
        updates.name = cleanFolder.name;
      }
      
      // 只更新经过验证的字段
      const allowedFields = ['name', 'parentId', 'isExpanded', 'order'];
      const safeUpdates = {};
      
      allowedFields.forEach(field => {
        if (field in updates) {
          if (field === 'parentId' && !Validator.isValidId(updates[field])) {
            throw new Error('无效的父文件夹ID');
          }
          safeUpdates[field] = updates[field];
        }
      });
      
      state.folders[index] = { ...state.folders[index], ...safeUpdates };
      clearCache(state);
      
      return state.folders[index];
    }, '更新文件夹失败');
  },

  // 删除文件夹
  DELETE_FOLDER(state, id) {
    // 删除该文件夹的所有子文件夹
    const childFolderIds = [];
    
    const findChildFolders = (parentId) => {
      const children = state.folders.filter(f => f.parentId === parentId);
      children.forEach(child => {
        childFolderIds.push(child.id);
        findChildFolders(child.id);
      });
    };
    
    findChildFolders(id);
    
    // 删除该文件夹下的所有书签
    state.bookmarks = state.bookmarks.filter(bookmark => bookmark.folderId !== id && !childFolderIds.includes(bookmark.folderId));
    
    // 删除子文件夹
    state.folders = state.folders.filter(folder => !childFolderIds.includes(folder.id));
    
    // 删除文件夹本身
    state.folders = state.folders.filter(folder => folder.id !== id);
    
    clearCache(state);
  },

  // 移动项目
  MOVE_ITEMS(state, { itemIds, targetFolderId, itemType }) {
    if (itemType === 'bookmark') {
      // 移动书签
      itemIds.forEach(id => {
        const index = state.bookmarks.findIndex(b => b.id === id);
        if (index !== -1) {
          state.bookmarks[index].folderId = targetFolderId;
        }
      });
      // 保存书签到localStorage
      localStorage.setItem('bookmarks', JSON.stringify(state.bookmarks));
    } else if (itemType === 'folder') {
      // 移动文件夹
      itemIds.forEach(id => {
        // 检查是否会导致循环引用
        let currentFolder = state.folders.find(f => f.id === targetFolderId);
        while (currentFolder && currentFolder.parentId !== null) {
          if (currentFolder.id === id) return; // 避免循环引用
          currentFolder = state.folders.find(f => f.id === currentFolder.parentId);
        }
        
        const index = state.folders.findIndex(f => f.id === id);
        if (index !== -1) {
          state.folders[index].parentId = targetFolderId;
        }
      });
      // 保存文件夹到localStorage
      localStorage.setItem('folders', JSON.stringify(state.folders));
    }
    clearCache(state);
  },

  // 设置选中的项目
  SET_SELECTED_ITEMS(state, items) {
    state.selectedItems = items;
  },

  // 清空选中的项目
  CLEAR_SELECTED_ITEMS(state) {
    state.selectedItems = [];
  },

  // 导入书签
  IMPORT_BOOKMARKS(state, { bookmarks, folders }) {
    // 合并书签，避免重复
    const existingBookmarkUrls = new Set(state.bookmarks.map(b => b.url));
    const newBookmarks = bookmarks.filter(b => !existingBookmarkUrls.has(b.url));
    
    state.bookmarks = [...state.bookmarks, ...newBookmarks];
    
    // 合并文件夹，避免重复
    // 使用更准确的去重逻辑：检查name+parentId的组合是否存在
    const existingFolderKeys = new Set(
      state.folders.map(f => `${f.name}|${f.parentId}`)
    );
    const newFolders = folders.filter(f => 
      !existingFolderKeys.has(`${f.name}|${f.parentId}`)
    );
    
    state.folders = [...state.folders, ...newFolders];
    
    clearCache(state);
  },

  // 设置无效书签
  SET_INVALID_BOOKMARKS(state, bookmarks) {
    state.invalidBookmarks = bookmarks;
  },

  // 设置重复书签
  SET_DUPLICATE_BOOKMARKS(state, bookmarks) {
    state.duplicateBookmarks = bookmarks;
  },

  // 展开/折叠文件夹
  TOGGLE_FOLDER_EXPANSION(state, folderId) {
    const index = state.folders.findIndex(folder => folder.id === folderId);
    if (index !== -1) {
      state.folders[index].isExpanded = !state.folders[index].isExpanded;
    }
  },

  // 排序书签
  SORT_BOOKMARKS(state, { folderId, sortFunction }) {
    // 获取要排序的书签
    const bookmarksInFolder = state.bookmarks.filter(b => b.folderId === folderId);
    if (bookmarksInFolder.length === 0) return;
    
    // 排序书签
    const sortedBookmarks = [...bookmarksInFolder].sort(sortFunction);
    
    // 更新每个书签的order字段以反映新的排序
    sortedBookmarks.forEach((bookmark, index) => {
      const originalIndex = state.bookmarks.findIndex(b => b.id === bookmark.id);
      if (originalIndex !== -1) {
        state.bookmarks[originalIndex].order = index;
      }
    });
  },

  // 排序文件夹
  SORT_FOLDERS(state, { parentId, sortFunction }) {
    const foldersWithParent = state.folders.filter(f => f.parentId === parentId);
    const foldersWithoutParent = state.folders.filter(f => f.parentId !== parentId);
    const sortedFolders = [...foldersWithParent].sort(sortFunction);
    
    // 重新构建文件夹数组，保持其他父文件夹的子文件夹位置不变
    state.folders = [...foldersWithoutParent, ...sortedFolders];
  },

  // 添加操作到历史记录
  ADD_OPERATION(state, operation) {
    // 为操作添加唯一ID和时间戳
    const operationWithId = {
      ...operation,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    
    // 清除当前索引之后的历史记录（如果用户在中间撤销后又进行了新操作）
    if (state.currentHistoryIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.currentHistoryIndex + 1);
    }
    
    state.history.push(operationWithId);
    state.currentHistoryIndex = state.history.length - 1;
    state.lastOperation = operationWithId;
  },

  // 撤销操作
  UNDO_OPERATION(state) {
    if (state.history.length > 0 && state.currentHistoryIndex >= 0) {
      const operation = state.history[state.currentHistoryIndex];
      if (operation) {
        // 检查操作是否已被撤销
        if (state.undoneOperationIds.has(operation.id)) {
          console.warn('操作已被撤销过:', operation.id);
          return;
        }
        
        // 标记操作为已撤销
        state.undoneOperationIds.add(operation.id);
        
        // 支持旧格式（带有 undo 函数的操作）
        if (typeof operation.undo === 'function') {
          operation.undo();
        }
        
        state.currentHistoryIndex--;
        
        // 清除 lastOperation 以避免再次显示撤销通知
        state.lastOperation = null;
      }
    }
  },

  // 重做操作
  REDO_OPERATION(state) {
    if (state.currentHistoryIndex < state.history.length - 1) {
      state.currentHistoryIndex++;
      const operation = state.history[state.currentHistoryIndex];
      
      if (operation) {
        // 从已撤销列表中移除（如果存在）
        state.undoneOperationIds.delete(operation.id);
        
        // 支持旧格式（带有 redo 函数的操作）
        if (typeof operation.redo === 'function') {
          operation.redo();
        }
      }
    }
  },

  // 更新历史索引
  UPDATE_HISTORY_INDEX(state, newIndex) {
    state.currentHistoryIndex = newIndex;
  },

  // 初始化 undoneOperationIds 为 Set 对象
  INIT_UNDONE_OPERATION_IDS(state) {
    state.undoneOperationIds = new Set();
  },

  // 重置收藏夹
  RESET_FOLDERS(state) {
    // 只保留根文件夹，删除所有其他文件夹
    state.folders = [{
      id: 'root',
      name: '收藏夹根目录',
      parentId: null,
      isExpanded: true,
    }];
    clearCache(state);
  },
  
  // 重置书签
  RESET_BOOKMARKS(state) {
    state.bookmarks = [];
    state.selectedItems = [];
    state.invalidBookmarks = [];
    state.duplicateBookmarks = [];
    clearCache(state);
  },
  
  // 重置历史记录
  RESET_HISTORY(state) {
    state.history = [];
    state.currentHistoryIndex = -1;
    state.lastOperation = null;
    state.undoneOperationIds.clear();
  },

  // 重新排序书签位置
  REORDER_BOOKMARKS(state, { folderId, bookmarkId, targetIndex }) {
    // 获取同一文件夹下的所有书签
    const folderBookmarks = state.bookmarks.filter(b => b.folderId === folderId);
    
    // 确保所有书签都有 order 字段
    folderBookmarks.forEach((bookmark, index) => {
      if (bookmark.order === undefined) {
        bookmark.order = index;
      }
    });
    
    // 按 order 排序
    folderBookmarks.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // 找到要移动的书签的当前索引
    const currentIndex = folderBookmarks.findIndex(b => b.id === bookmarkId);
    if (currentIndex === -1 || currentIndex === targetIndex) return;
    
    // 从数组中移除该书签
    const [bookmarkToMove] = folderBookmarks.splice(currentIndex, 1);
    
    // 在目标位置插入书签
    folderBookmarks.splice(targetIndex, 0, bookmarkToMove);
    
    // 更新所有书签的顺序号
    folderBookmarks.forEach((bookmark, index) => {
      const stateIndex = state.bookmarks.findIndex(b => b.id === bookmark.id);
      if (stateIndex !== -1) {
        state.bookmarks[stateIndex].order = index;
      }
    });
    
    clearCache(state);
    
    // 保存到localStorage
    localStorage.setItem('bookmarks', JSON.stringify(state.bookmarks));
  }
};

const actions = {
  // 初始化操作管理器 - 注册所有可撤销操作
  initOperationManager() {
    // 注册moveItems操作
    operationManager.register('moveItems', 
      // 撤销函数
      (data, dispatch) => {
        const { itemIds, itemType, originalState } = data;
        if (itemType === 'bookmark') {
          itemIds.forEach(id => {
            if (originalState[id]) {
              dispatch('moveItems', {
                itemIds: [id],
                targetFolderId: originalState[id].folderId,
                itemType: 'bookmark',
                skipHistory: true
              });
            }
          });
        } else if (itemType === 'folder') {
          itemIds.forEach(id => {
            if (originalState[id]) {
              dispatch('moveItems', {
                itemIds: [id],
                targetFolderId: originalState[id].parentId,
                itemType: 'folder',
                skipHistory: true
              });
            }
          });
        }
      },
      // 重做函数
      (data, dispatch) => {
        dispatch('moveItems', {
          itemIds: data.itemIds,
          targetFolderId: data.targetFolderId,
          itemType: data.itemType,
          skipHistory: true
        });
      }
    );
    
    // 注册reorderBookmarks操作
    operationManager.register('reorderBookmarks',
      // 撤销函数
      (data, dispatch) => {
        if (data.originalIndex !== undefined && data.originalIndex !== -1) {
          dispatch('reorderBookmarks', { 
            folderId: data.folderId, 
            bookmarkId: data.bookmarkId, 
            targetIndex: data.originalIndex,
            skipHistory: true
          });
        }
      },
      // 重做函数
      (data, dispatch) => {
        dispatch('reorderBookmarks', {
          folderId: data.folderId,
          bookmarkId: data.bookmarkId,
          targetIndex: data.targetIndex,
          skipHistory: true
        });
      }
    );
  },

  // 初始化书签顺序（为已存在的书签设置 order 字段）
  initializeBookmarkOrder({ commit, state, dispatch }) {
    // 先初始化操作管理器
    dispatch('initOperationManager');
    
    const folders = {};
    
    // 按文件夹分组书签
    state.bookmarks.forEach(bookmark => {
      if (!folders[bookmark.folderId]) {
        folders[bookmark.folderId] = [];
      }
      folders[bookmark.folderId].push(bookmark);
    });
    
    // 为每个文件夹的书签设置顺序
    Object.keys(folders).forEach(folderId => {
      const bookmarksInFolder = folders[folderId];
      bookmarksInFolder.forEach((bookmark, index) => {
        if (bookmark.order === undefined) {
          commit('UPDATE_BOOKMARK', {
            id: bookmark.id,
            updates: { order: index }
          });
        }
      });
    });
  },

  // 添加书签
  addBookmark({ commit }, bookmark) {
    commit('ADD_BOOKMARK', bookmark);
    return Promise.resolve();
  },

  // 更新书签
  updateBookmark({ commit }, { id, updates }) {
    commit('UPDATE_BOOKMARK', { id, updates });
    return Promise.resolve();
  },

  // 删除书签
  deleteBookmark({ commit }, id) {
    commit('DELETE_BOOKMARK', id);
    return Promise.resolve();
  },

  // 批量删除书签
  deleteBookmarksBulk({ commit }, ids) {
    commit('DELETE_BOOKMARKS_BULK', ids);
    return Promise.resolve();
  },

  // 添加文件夹
  addFolder({ commit }, folder) {
    commit('ADD_FOLDER', folder);
    return Promise.resolve();
  },

  // 更新文件夹
  updateFolder({ commit }, { id, updates }) {
    commit('UPDATE_FOLDER', { id, updates });
    return Promise.resolve();
  },

  // 删除文件夹
  deleteFolder({ commit }, id) {
    commit('DELETE_FOLDER', id);
    return Promise.resolve();
  },

  // 移动项目
  moveItems({ commit, dispatch, state }, { itemIds, targetFolderId, itemType, skipHistory = false }) {
    // 保存移动前的状态，便于撤销
    const originalState = {};
    
    if (itemType === 'bookmark') {
      itemIds.forEach(id => {
        const bookmark = state.bookmarks.find(b => b.id === id);
        if (bookmark) {
          originalState[id] = {
            folderId: bookmark.folderId
          };
        }
      });
    } else if (itemType === 'folder') {
      itemIds.forEach(id => {
        const folder = state.folders.find(f => f.id === id);
        if (folder) {
          originalState[id] = {
            parentId: folder.parentId
          };
        }
      });
    }
    
    // 执行移动操作
    commit('MOVE_ITEMS', { itemIds, targetFolderId, itemType });
    
    // 只有在不跳过历史记录时才添加到历史记录
    if (!skipHistory) {
      const operation = {
        type: 'moveItems',
        description: `移动${itemType === 'bookmark' ? '书签' : '文件夹'}`,
        data: {
          itemIds,
          targetFolderId,
          itemType,
          originalState
        },
        undo: () => {
          // 恢复原始状态
          if (itemType === 'bookmark') {
            itemIds.forEach(id => {
              if (originalState[id]) {
                commit('MOVE_ITEMS', { 
                  itemIds: [id], 
                  targetFolderId: originalState[id].folderId, 
                  itemType: 'bookmark' 
                });
              }
            });
          } else if (itemType === 'folder') {
            itemIds.forEach(id => {
              if (originalState[id]) {
                commit('MOVE_ITEMS', { 
                  itemIds: [id], 
                  targetFolderId: originalState[id].parentId, 
                  itemType: 'folder' 
                });
              }
            });
          }
        },
        redo: () => {
          // 重新执行移动操作
          commit('MOVE_ITEMS', { itemIds, targetFolderId, itemType });
        }
      };
      
      dispatch('addToHistory', operation);
    }
    
    return Promise.resolve();
  },

  // 设置选中的项目
  setSelectedItems({ commit }, items) {
    commit('SET_SELECTED_ITEMS', items);
    return Promise.resolve();
  },

  // 清空选中的项目
  clearSelectedItems({ commit }) {
    commit('CLEAR_SELECTED_ITEMS');
    return Promise.resolve();
  },

  // 导入书签
  importBookmarks({ commit }, { bookmarks, folders }) {
    commit('IMPORT_BOOKMARKS', { bookmarks, folders });
    return Promise.resolve();
  },

  // 检测无效书签
  async checkInvalidBookmarks({ commit, state }) {
    const invalidBookmarks = [];
    
    // 批量检测，每次最多同时检测10个书签，避免页面卡死
    const batchSize = 10;
    const bookmarks = [...state.bookmarks];
    
    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize);
      
      // 并行检测当前批次的书签
      const results = await Promise.allSettled(
        batch.map(async (bookmark) => {
          try {
            // 设置3秒超时，避免长时间等待
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(bookmark.url, {
              method: 'HEAD',
              signal: controller.signal,
              // 不使用no-cors模式，让网络错误被正确捕获
            });
            
            clearTimeout(timeoutId);
            
            // 如果响应状态不是2xx，认为是无效书签
            if (!response.ok) {
              return { status: 'invalid', bookmark };
            }
            
            return { status: 'valid', bookmark };
          } catch (error) {
            // 网络错误、超时或其他错误都认为是无效书签
            return { status: 'invalid', bookmark };
          }
        })
      );
      
      // 收集无效书签
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.status === 'invalid') {
          invalidBookmarks.push(result.value.bookmark);
        } else if (result.status === 'rejected') {
          // Promise被拒绝的情况，也认为是无效书签
          // 这里需要找到对应的书签，但由于Promise.allSettled的特性，我们需要另一种方式
        }
      });
      
      // 小延迟，避免浏览器过载
      if (i + batchSize < bookmarks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    commit('SET_INVALID_BOOKMARKS', invalidBookmarks);
    return invalidBookmarks;
  },

  // 检测重复书签
  checkDuplicateBookmarks({ commit, state }) {
    const urlMap = {};
    const duplicateBookmarks = [];
    
    state.bookmarks.forEach(bookmark => {
      if (urlMap[bookmark.url]) {
        duplicateBookmarks.push(bookmark);
      } else {
        urlMap[bookmark.url] = true;
      }
    });
    
    commit('SET_DUPLICATE_BOOKMARKS', duplicateBookmarks);
    return duplicateBookmarks;
  },

  // 切换文件夹展开/折叠状态
  toggleFolderExpansion({ commit }, folderId) {
    commit('TOGGLE_FOLDER_EXPANSION', folderId);
    return Promise.resolve();
  },

  // 按名称排序书签
  sortBookmarksByName({ commit, state }, folderId) {
    // 获取排序前的书签状态（用于撤销）
    const bookmarksBeforeSort = state.bookmarks.filter(b => b.folderId === folderId);
    const originalOrder = bookmarksBeforeSort.map(b => ({ id: b.id, index: state.bookmarks.findIndex(item => item.id === b.id) }));
    
    const sortFunction = (a, b) => a.name.localeCompare(b.name);
    commit('SORT_BOOKMARKS', { folderId, sortFunction });
    
    // 获取文件夹名称用于操作描述
    const folder = state.folders.find(f => f.id === folderId);
    const folderName = folder ? folder.name : '文件夹';
    
    // 记录操作历史
    const operation = {
      type: 'sort',
      description: `按名称排序文件夹"${folderName}"中的书签`,
      data: {
        folderId,
        originalOrder
      },
      timestamp: new Date().toISOString()
    };
    
    commit('ADD_OPERATION', operation);
    return Promise.resolve();
  },

  // 按URL排序书签
  sortBookmarksByUrl({ commit, state }, folderId) {
    // 获取排序前的书签状态（用于撤销）
    const bookmarksBeforeSort = state.bookmarks.filter(b => b.folderId === folderId);
    const originalOrder = bookmarksBeforeSort.map(b => ({ id: b.id, index: state.bookmarks.findIndex(item => item.id === b.id) }));
    
    const sortFunction = (a, b) => a.url.localeCompare(b.url);
    commit('SORT_BOOKMARKS', { folderId, sortFunction });
    
    // 获取文件夹名称用于操作描述
    const folder = state.folders.find(f => f.id === folderId);
    const folderName = folder ? folder.name : '文件夹';
    
    // 记录操作历史
    const operation = {
      type: 'sort',
      description: `按URL排序文件夹"${folderName}"中的书签`,
      data: {
        folderId,
        originalOrder
      },
      timestamp: new Date().toISOString()
    };
    
    commit('ADD_OPERATION', operation);
    return Promise.resolve();
  },

  // 按创建日期排序书签
  sortBookmarksByDate({ commit, state }, folderId) {
    // 获取排序前的书签状态（用于撤销）
    const bookmarksBeforeSort = state.bookmarks.filter(b => b.folderId === folderId);
    const originalOrder = bookmarksBeforeSort.map(b => ({ id: b.id, index: state.bookmarks.findIndex(item => item.id === b.id) }));
    
    const sortFunction = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
    commit('SORT_BOOKMARKS', { folderId, sortFunction });
    
    // 获取文件夹名称用于操作描述
    const folder = state.folders.find(f => f.id === folderId);
    const folderName = folder ? folder.name : '文件夹';
    
    // 记录操作历史
    const operation = {
      type: 'sort',
      description: `按创建日期排序文件夹"${folderName}"中的书签`,
      data: {
        folderId,
        originalOrder
      },
      timestamp: new Date().toISOString()
    };
    
    commit('ADD_OPERATION', operation);
    return Promise.resolve();
  },

  // 自定义排序书签
  sortBookmarksCustom({ commit, state }, { folderId, sortFunctionString }) {
    try {
      const sortFunction = new Function('a', 'b', sortFunctionString);
      
      // 获取排序前的书签状态（用于撤销）
      const bookmarksBeforeSort = state.bookmarks.filter(b => b.folderId === folderId);
      const originalOrder = bookmarksBeforeSort.map(b => ({ id: b.id, index: state.bookmarks.findIndex(item => item.id === b.id) }));
      
      // 执行排序
      commit('SORT_BOOKMARKS', { folderId, sortFunction });
      
      // 获取文件夹名称用于操作描述
      const folder = state.folders.find(f => f.id === folderId);
      const folderName = folder ? folder.name : '文件夹';
      
      // 记录操作历史
      const operation = {
        type: 'sort',
        description: `自定义排序文件夹"${folderName}"中的书签`,
        data: {
          folderId,
          originalOrder
        },
        timestamp: new Date().toISOString()
      };
      
      commit('ADD_OPERATION', operation);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Invalid sort function:', error);
      return Promise.reject(error);
    }
  },

  // 按名称排序文件夹
  sortFoldersByName({ commit }, parentId) {
    const sortFunction = (a, b) => a.name.localeCompare(b.name);
    commit('SORT_FOLDERS', { parentId, sortFunction });
    return Promise.resolve();
  },

  // 添加操作到历史记录
  addOperation({ commit }, operation) {
    commit('ADD_OPERATION', operation);
    return Promise.resolve();
  },

  // 撤销操作
  undoOperation({ commit, dispatch }) {
    commit('UNDO_OPERATION', { dispatch });
    return Promise.resolve();
  },

  // 重做操作
  redoOperation({ commit, dispatch }) {
    commit('REDO_OPERATION', { dispatch });
    return Promise.resolve();
  },

  // 重置所有文件夹
  resetAllFolders({ commit }) {
    commit('RESET_FOLDERS');
    return Promise.resolve();
  },
  
  // 重置所有书签
  resetAllBookmarks({ commit }) {
    commit('RESET_BOOKMARKS');
    return Promise.resolve();
  },
  
  // 重置历史记录
  resetHistory({ commit }) {
    commit('RESET_HISTORY');
    return Promise.resolve();
  },
  
  // 重置所有内容
  resetAll({ dispatch }) {
    return Promise.all([
      dispatch('resetAllBookmarks'),
      dispatch('resetAllFolders'),
      dispatch('resetHistory')
    ]);
  },
  
  reorderBookmarks({ commit, dispatch, state }, { folderId, bookmarkId, targetIndex, operationType = 'reorder', skipHistory = false }) {
    const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
    const bookmarkName = bookmark ? bookmark.name : '书签';
    
    let description;
    switch (operationType) {
      case 'up':
        description = `上移书签"${bookmarkName}"`;
        break;
      case 'down':
        description = `下移书签"${bookmarkName}"`;
        break;
      case 'drag':
        description = `拖拽调整书签"${bookmarkName}"的位置`;
        break;
      default:
        description = `调整书签"${bookmarkName}"的位置`;
        break;
    }
    
    // 保存操作前的索引，用于撤销
    let originalIndex = -1;
    if (!skipHistory) {
      const folderBookmarks = state.bookmarks.filter(b => b.folderId === folderId);
      folderBookmarks.forEach((b, index) => {
        if (b.order === undefined) {
          b.order = index;
        }
      });
      folderBookmarks.sort((a, b) => (a.order || 0) - (b.order || 0));
      originalIndex = folderBookmarks.findIndex(b => b.id === bookmarkId);
    }
    
    commit('REORDER_BOOKMARKS', { folderId, bookmarkId, targetIndex });
    
    // 只有在不跳过历史记录时才添加到历史记录
    if (!skipHistory) {
      // 创建兼容新旧系统的操作对象
      const operation = {
        type: 'reorderBookmarks',
        description: description,
        data: { folderId, bookmarkId, targetIndex, originalIndex },
        // 兼容旧系统的 undo 函数
        undo: () => {
          if (originalIndex !== undefined && originalIndex !== -1) {
            dispatch('reorderBookmarks', { 
              folderId, 
              bookmarkId, 
              targetIndex: originalIndex,
              skipHistory: true
            });
          }
        },
        // 兼容旧系统的 redo 函数
        redo: () => {
          dispatch('reorderBookmarks', { 
            folderId, 
            bookmarkId, 
            targetIndex,
            skipHistory: true
          });
        }
      };
      
      dispatch('addToHistory', operation);
    }
  },
  
  moveBookmarkUp({ state, dispatch }, bookmarkId) {
    const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;
    
    const folderId = bookmark.folderId;
    const folderBookmarks = state.bookmarks.filter(b => b.folderId === folderId);
    
    // 确保所有书签都有 order 字段，如果没有则按索引设置
    folderBookmarks.forEach((b, index) => {
      if (b.order === undefined) {
        b.order = index;
      }
    });
    
    folderBookmarks.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = folderBookmarks.findIndex(b => b.id === bookmarkId);
    if (currentIndex <= 0) return; // 已经是第一个，无法上移
    
    dispatch('reorderBookmarks', {
      folderId,
      bookmarkId,
      targetIndex: currentIndex - 1,
      operationType: 'up'
    });
  },
  
  moveBookmarkDown({ state, dispatch }, bookmarkId) {
    const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;
    
    const folderId = bookmark.folderId;
    const folderBookmarks = state.bookmarks.filter(b => b.folderId === folderId);
    
    // 确保所有书签都有 order 字段，如果没有则按索引设置
    folderBookmarks.forEach((b, index) => {
      if (b.order === undefined) {
        b.order = index;
      }
    });
    
    folderBookmarks.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = folderBookmarks.findIndex(b => b.id === bookmarkId);
    if (currentIndex === -1 || currentIndex >= folderBookmarks.length - 1) return; // 已经是最后一个，无法下移
    
    dispatch('reorderBookmarks', {
      folderId,
      bookmarkId,
      targetIndex: currentIndex + 1,
      operationType: 'down'
    });
  },

  // 简化的撤销操作处理
  applySavedHistory({ dispatch }, { type, data }) {
    return operationManager.undo({ type, data }, dispatch);
  },
  
  // 添加操作到历史记录
  addToHistory({ commit }, operation) {
    commit('ADD_OPERATION', operation);
  },

  // 统一的撤销操作
  undo({ commit, dispatch, state }) {
    if (state.currentHistoryIndex >= 0) {
      const operation = state.history[state.currentHistoryIndex];
      
      if (operation) {
        // 使用统一的操作管理器处理撤销
        operationManager.undo(operation, dispatch);
        
        // 更新历史索引
        commit('UPDATE_HISTORY_INDEX', state.currentHistoryIndex - 1);
      }
    }
  },

  // 统一的重做操作  
  redo({ commit, dispatch, state }) {
    if (state.currentHistoryIndex < state.history.length - 1) {
      const nextIndex = state.currentHistoryIndex + 1;
      const operation = state.history[nextIndex];
      
      if (operation) {
        // 使用统一的操作管理器处理重做
        operationManager.redo(operation, dispatch);
        
        // 更新历史索引
        commit('UPDATE_HISTORY_INDEX', nextIndex);
      }
    }
  }
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}; 