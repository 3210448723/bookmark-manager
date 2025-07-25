// 数据访问层 - 提供统一的数据获取和缓存机制
import { Validator, SecurityUtils, ErrorHandler } from './validation';
import cacheManager from './cacheManager';
import { APP_CONSTANTS } from '@/constants';

class DataAccessLayer {
  constructor() {
    this.initialized = false;
    this.store = null;
  }

  // 初始化DAL
  init(store) {
    this.store = store;
    this.initialized = true;
    
    // 创建专用缓存
    cacheManager.createCache('bookmarks', 1000);
    cacheManager.createCache('folders', 500);
    cacheManager.createCache('paths', 200);
  }

  // 确保DAL已初始化
  ensureInitialized() {
    if (!this.initialized || !this.store) {
      throw new Error('DataAccessLayer未初始化，请先调用init方法');
    }
  }

  // 获取所有书签（带缓存）
  getBookmarks(useCache = true) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      const cacheKey = 'all_bookmarks';
      
      if (useCache) {
        const cached = cacheManager.get('bookmarks', cacheKey);
        if (cached) return cached;
      }
      
      const bookmarks = this.store.state.bookmarks.bookmarks || [];
      
      // 验证和清理数据
      const validBookmarks = bookmarks
        .filter(bookmark => this.isValidBookmark(bookmark))
        .map(bookmark => this.sanitizeBookmark(bookmark));
      
      if (useCache) {
        cacheManager.set('bookmarks', cacheKey, validBookmarks);
      }
      
      return validBookmarks;
    }, '获取书签失败', []);
  }

  // 根据文件夹ID获取书签
  getBookmarksByFolderId(folderId, useCache = true) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      if (!Validator.isValidId(folderId)) {
        return [];
      }
      
      const cacheKey = `bookmarks_${folderId}`;
      
      if (useCache) {
        const cached = cacheManager.get('bookmarks', cacheKey);
        if (cached) return cached;
      }
      
      const allBookmarks = this.getBookmarks(useCache);
      const folderBookmarks = allBookmarks.filter(bookmark => 
        bookmark && bookmark.folderId === folderId
      );
      
      if (useCache) {
        cacheManager.set('bookmarks', cacheKey, folderBookmarks);
      }
      
      return folderBookmarks;
    }, '根据文件夹ID获取书签失败', []);
  }

  // 获取所有文件夹（带缓存）
  getFolders(useCache = true) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      const cacheKey = 'all_folders';
      
      if (useCache) {
        const cached = cacheManager.get('folders', cacheKey);
        if (cached) return cached;
      }
      
      const folders = this.store.state.bookmarks.folders || [];
      
      // 验证和清理数据
      const validFolders = folders
        .filter(folder => this.isValidFolder(folder))
        .map(folder => this.sanitizeFolder(folder));
      
      if (useCache) {
        cacheManager.set('folders', cacheKey, validFolders);
      }
      
      return validFolders;
    }, '获取文件夹失败', []);
  }

  // 根据父文件夹ID获取子文件夹
  getFoldersByParentId(parentId, useCache = true) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      if (!Validator.isValidId(parentId)) {
        return [];
      }
      
      const cacheKey = `folders_${parentId}`;
      
      if (useCache) {
        const cached = cacheManager.get('folders', cacheKey);
        if (cached) return cached;
      }
      
      const allFolders = this.getFolders(useCache);
      const childFolders = allFolders.filter(folder => 
        folder && folder.parentId === parentId
      );
      
      if (useCache) {
        cacheManager.set('folders', cacheKey, childFolders);
      }
      
      return childFolders;
    }, '根据父文件夹ID获取子文件夹失败', []);
  }

  // 获取文件夹路径（带缓存）
  getFolderPath(folderId, useCache = true) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      if (!Validator.isValidId(folderId)) {
        return [];
      }
      
      const cacheKey = `path_${folderId}`;
      
      if (useCache) {
        const cached = cacheManager.get('paths', cacheKey);
        if (cached) return cached;
      }
      
      const path = [];
      const allFolders = this.getFolders(useCache);
      let currentFolderId = folderId;
      let depth = 0;
      
      // 防止无限循环
      while (currentFolderId && depth < APP_CONSTANTS.MAX_DEPTH.FOLDER_PARSING) {
        const folder = allFolders.find(f => f && f.id === currentFolderId);
        
        if (!folder) break;
        
        path.unshift(folder);
        currentFolderId = folder.parentId;
        depth++;
      }
      
      if (useCache) {
        cacheManager.set('paths', cacheKey, path);
      }
      
      return path;
    }, '获取文件夹路径失败', []);
  }

  // 搜索书签
  searchBookmarks(query, options = {}) {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      const {
        caseSensitive = false,
        searchInUrl = true,
        searchInDescription = true,
        folderId = null,
        limit = 100
      } = options;
      
      if (!query || query.trim().length === 0) {
        return [];
      }
      
      const cleanQuery = SecurityUtils.sanitizeInput(query.trim());
      const searchQuery = caseSensitive ? cleanQuery : cleanQuery.toLowerCase();
      
      const bookmarks = folderId 
        ? this.getBookmarksByFolderId(folderId, true)
        : this.getBookmarks(true);
      
      const results = bookmarks.filter(bookmark => {
        if (!bookmark) return false;
        
        const name = caseSensitive ? bookmark.name : bookmark.name.toLowerCase();
        
        let matches = name.includes(searchQuery);
        
        if (!matches && searchInUrl && bookmark.url) {
          const url = caseSensitive ? bookmark.url : bookmark.url.toLowerCase();
          matches = url.includes(searchQuery);
        }
        
        if (!matches && searchInDescription && bookmark.description) {
          const desc = caseSensitive ? bookmark.description : bookmark.description.toLowerCase();
          matches = desc.includes(searchQuery);
        }
        
        return matches;
      });
      
      return results.slice(0, limit);
    }, '搜索书签失败', []);
  }

  // 验证书签数据
  isValidBookmark(bookmark) {
    return bookmark &&
           typeof bookmark === 'object' &&
           Validator.isValidId(bookmark.id) &&
           typeof bookmark.name === 'string' &&
           bookmark.name.length > 0 &&
           bookmark.name.length <= APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME;
  }

  // 验证文件夹数据
  isValidFolder(folder) {
    return folder &&
           typeof folder === 'object' &&
           Validator.isValidId(folder.id) &&
           typeof folder.name === 'string' &&
           folder.name.length > 0 &&
           folder.name.length <= APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME;
  }

  // 清理书签数据
  sanitizeBookmark(bookmark) {
    return {
      ...bookmark,
      name: SecurityUtils.sanitizeInput(bookmark.name || ''),
      url: bookmark.url ? SecurityUtils.sanitizeUrl(bookmark.url) : '',
      description: bookmark.description ? SecurityUtils.sanitizeInput(bookmark.description) : ''
    };
  }

  // 清理文件夹数据
  sanitizeFolder(folder) {
    return {
      ...folder,
      name: SecurityUtils.sanitizeInput(folder.name || '')
    };
  }

  // 获取统计信息
  getStats() {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      const bookmarks = this.getBookmarks(true);
      const folders = this.getFolders(true);
      
      const stats = {
        totalBookmarks: bookmarks.length,
        totalFolders: folders.length,
        folderStats: {},
        cacheStats: cacheManager.getAllStats()
      };
      
      // 计算每个文件夹的书签数量
      folders.forEach(folder => {
        const folderBookmarks = this.getBookmarksByFolderId(folder.id, true);
        stats.folderStats[folder.id] = {
          name: folder.name,
          bookmarkCount: folderBookmarks.length
        };
      });
      
      return stats;
    }, '获取统计信息失败', {});
  }

  // 清理所有缓存
  clearCache() {
    cacheManager.clear('bookmarks');
    cacheManager.clear('folders');
    cacheManager.clear('paths');
  }

  // 清理特定类型的缓存
  clearCacheType(type) {
    cacheManager.clear(type);
  }

  // 预加载数据
  preloadData() {
    return ErrorHandler.safeExecuteAsync(async () => {
      this.ensureInitialized();
      
      // 预加载基础数据
      this.getBookmarks(true);
      this.getFolders(true);
      
      // 预加载根文件夹的书签
      this.getBookmarksByFolderId('root', true);
      
      console.log('数据预加载完成');
    }, '数据预加载失败');
  }

  // 数据验证
  validateData() {
    return ErrorHandler.safeExecute(() => {
      this.ensureInitialized();
      
      const issues = [];
      const bookmarks = this.store.state.bookmarks.bookmarks || [];
      const folders = this.store.state.bookmarks.folders || [];
      
      // 检查书签数据完整性
      bookmarks.forEach(bookmark => {
        if (!this.isValidBookmark(bookmark)) {
          issues.push(`无效的书签数据: ${bookmark?.id || '未知ID'}`);
        }
      });
      
      // 检查文件夹数据完整性
      folders.forEach(folder => {
        if (!this.isValidFolder(folder)) {
          issues.push(`无效的文件夹数据: ${folder?.id || '未知ID'}`);
        }
      });
      
      return {
        isValid: issues.length === 0,
        issues
      };
    }, '数据验证失败', { isValid: false, issues: ['验证过程失败'] });
  }
}

// 创建单例实例
const dataAccessLayer = new DataAccessLayer();

export default dataAccessLayer;
