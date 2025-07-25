// 搜索服务 - 提供统一的搜索功能
import { Validator, SecurityUtils, ErrorHandler } from './validation';
import { APP_CONSTANTS } from '@/constants';

class SearchService {
  constructor() {
    this.searchCache = new Map();
    this.pathCache = null;
    this.searchTimer = null;
  }

  // 验证和清理搜索查询
  validateAndSanitizeQuery(query) {
    if (Validator.isEmpty(query)) {
      return '';
    }
    
    if (query.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) {
      query = query.substring(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME);
    }
    
    return SecurityUtils.sanitizeInput(query);
  }

  // 搜索书签
  searchBookmarks(query, bookmarks, getFolderPath) {
    return ErrorHandler.safeExecute(() => {
      const cleanQuery = this.validateAndSanitizeQuery(query);
      
      if (Validator.isEmpty(cleanQuery)) {
        return [];
      }

      // 检查缓存
      const cacheKey = cleanQuery.toLowerCase();
      if (this.searchCache.has(cacheKey)) {
        return this.searchCache.get(cacheKey);
      }

      const lowercaseQuery = cleanQuery.toLowerCase().trim();
      
      if (!Validator.isValidArray(bookmarks)) {
        return [];
      }

      const matchedBookmarks = bookmarks.filter(bookmark => {
        if (!bookmark || typeof bookmark !== 'object') {
          return false;
        }
        
        const name = (bookmark.name || '').toLowerCase();
        const url = (bookmark.url || '').toLowerCase();
        const description = (bookmark.description || '').toLowerCase();
        
        return name.includes(lowercaseQuery) || 
               url.includes(lowercaseQuery) ||
               description.includes(lowercaseQuery);
      });

      // 为每个匹配的书签添加路径信息
      const bookmarksWithPath = matchedBookmarks.map(bookmark => {
        const folderPath = getFolderPath(bookmark.folderId);
        const pathString = Validator.isValidArray(folderPath) 
          ? folderPath.map(f => SecurityUtils.escapeHtml(f.name || '')).join(' / ')
          : '';
        
        return {
          ...bookmark,
          folderPath,
          pathString
        };
      });

      // 缓存结果（限制缓存大小）
      if (this.searchCache.size >= APP_CONSTANTS.CACHE_LIMITS.MAX_SEARCH_CACHE_SIZE) {
        const firstKey = this.searchCache.keys().next().value;
        this.searchCache.delete(firstKey);
      }
      this.searchCache.set(cacheKey, bookmarksWithPath);

      return bookmarksWithPath;
    }, '搜索书签失败', []);
  }

  // 搜索路径
  searchPaths(query, getFolderPath, getFoldersByParentId, callback) {
    if (!query) {
      callback([]);
      return;
    }

    // 防抖优化
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      const lowercaseQuery = query.toLowerCase();
      const results = [];

      // 构建路径缓存
      if (!this.pathCache) {
        this.pathCache = [];
        
        const buildPath = (folderId, depth = 0) => {
          // 防止无限递归
          if (depth > APP_CONSTANTS.MAX_DEPTH.FOLDER_PARSING || 
              this.pathCache.length > APP_CONSTANTS.CACHE_LIMITS.MAX_PATH_CACHE_SIZE) {
            console.warn('递归深度或路径数量达到限制，停止构建路径缓存');
            return;
          }
          
          const path = getFolderPath(folderId);
          const pathString = path.map(f => f.name).join(' / ');
          
          this.pathCache.push({
            id: folderId,
            pathString,
            path
          });
          
          // 递归处理子文件夹
          const children = getFoldersByParentId(folderId);
          children.forEach(child => buildPath(child.id, depth + 1));
        };
        
        buildPath('root', 0);
      }

      // 查找匹配的路径
      for (let i = 0; i < this.pathCache.length; i++) {
        const item = this.pathCache[i];
        if (item.pathString.toLowerCase().includes(lowercaseQuery)) {
          results.push(item);
          if (results.length >= APP_CONSTANTS.PAGINATION.DEFAULT_SEARCH_RESULTS) break;
        }
      }

      callback(results);
    }, APP_CONSTANTS.DEBOUNCE_DELAY.SEARCH);
  }

  // 清理缓存
  clearCache() {
    this.searchCache.clear();
    this.pathCache = null;
  }

  // 清理定时器
  cleanup() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.clearCache();
  }
}

// 创建单例实例
const searchService = new SearchService();

export default searchService;
