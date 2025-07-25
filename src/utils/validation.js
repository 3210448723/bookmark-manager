// 防御性编程和输入验证工具
import { APP_CONSTANTS } from '@/constants';

/**
 * 通用验证工具类
 */
export class Validator {
  /**
   * 检查值是否为空或未定义
   */
  static isEmpty(value) {
    return value === null || value === undefined || value === '';
  }
  
  /**
   * 检查字符串是否为空或只包含空白字符
   */
  static isBlankString(str) {
    return typeof str !== 'string' || str.trim() === '';
  }
  
  /**
   * 安全地获取对象属性，避免空指针异常
   */
  static safeGet(obj, path, defaultValue = null) {
    if (!obj || typeof obj !== 'object') return defaultValue;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current;
  }
  
  /**
   * 验证URL格式
   */
  static isValidUrl(url) {
    if (this.isBlankString(url)) return false;
    
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:', 'ftp:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }
  
  /**
   * 验证文件名是否安全
   */
  static isSafeFileName(fileName) {
    if (this.isBlankString(fileName)) return false;
    
    // 检查非法字符
    const illegalChars = /[<>:"/\\|?*]/;
    if (illegalChars.test(fileName)) return false;
    
    // 检查控制字符
    for (let i = 0; i < fileName.length; i++) {
      const charCode = fileName.charCodeAt(i);
      if (charCode >= 0 && charCode <= 31) return false; // 控制字符
    }
    
    // 检查保留名称（Windows）
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(fileName.toUpperCase())) return false;
    
    // 检查长度
    return fileName.length <= 255;
  }
  
  /**
   * 验证文本长度
   */
  static isValidTextLength(text, maxLength) {
    if (this.isEmpty(text)) return true; // 空值被认为是有效的
    return typeof text === 'string' && text.length <= maxLength;
  }
  
  /**
   * 验证数组是否有效且非空
   */
  static isValidArray(arr) {
    return Array.isArray(arr) && arr.length > 0;
  }
  
  /**
   * 验证ID格式（假设使用UUID或类似格式）
   */
  static isValidId(id) {
    if (this.isBlankString(id)) return false;
    // 简单的ID格式验证
    return /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 50;
  }
}

/**
 * 书签特定的验证器
 */
export class BookmarkValidator {
  /**
   * 验证书签对象
   */
  static validateBookmark(bookmark) {
    const errors = [];
    
    if (!bookmark || typeof bookmark !== 'object') {
      errors.push('书签必须是一个对象');
      return { isValid: false, errors };
    }
    
    // 验证ID
    if (!Validator.isValidId(bookmark.id)) {
      errors.push('书签ID格式无效');
    }
    
    // 验证名称
    if (Validator.isBlankString(bookmark.name)) {
      errors.push('书签名称不能为空');
    } else if (!Validator.isValidTextLength(bookmark.name, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME)) {
      errors.push(`书签名称长度不能超过${APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME}个字符`);
    }
    
    // 验证URL
    if (!Validator.isValidUrl(bookmark.url)) {
      errors.push('书签URL格式无效');
    }
    
    // 验证文件夹ID
    if (!Validator.isEmpty(bookmark.folderId) && !Validator.isValidId(bookmark.folderId)) {
      errors.push('文件夹ID格式无效');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 验证文件夹对象
   */
  static validateFolder(folder) {
    const errors = [];
    
    if (!folder || typeof folder !== 'object') {
      errors.push('文件夹必须是一个对象');
      return { isValid: false, errors };
    }
    
    // 验证ID
    if (!Validator.isValidId(folder.id)) {
      errors.push('文件夹ID格式无效');
    }
    
    // 验证名称
    if (Validator.isBlankString(folder.name)) {
      errors.push('文件夹名称不能为空');
    } else if (!Validator.isValidTextLength(folder.name, APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME)) {
      errors.push(`文件夹名称长度不能超过${APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME}个字符`);
    }
    
    // 验证父文件夹ID
    if (!Validator.isEmpty(folder.parentId) && !Validator.isValidId(folder.parentId)) {
      errors.push('父文件夹ID格式无效');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 安全工具类 - 防止XSS和注入攻击
 */
export class SecurityUtils {
  /**
   * HTML转义
   */
  static escapeHtml(text) {
    if (Validator.isEmpty(text)) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * 移除HTML标签
   */
  static stripHtml(html) {
    if (Validator.isEmpty(html)) return '';
    
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
  
  /**
   * 清理用户输入，移除危险字符
   */
  static sanitizeInput(input) {
    if (Validator.isEmpty(input)) return '';
    
    return String(input)
      .replace(/[<>]/g, '') // 移除尖括号
      .replace(/javascript:/gi, '') // 移除javascript协议
      .replace(/data:/gi, '') // 移除data协议
      .trim();
  }
  
  /**
   * 验证并清理URL
   */
  static sanitizeUrl(url) {
    if (!Validator.isValidUrl(url)) return '';
    
    try {
      const urlObj = new URL(url);
      // 只允许安全的协议
      if (!['http:', 'https:', 'ftp:'].includes(urlObj.protocol)) {
        return '';
      }
      return urlObj.toString();
    } catch {
      return '';
    }
  }
}

/**
 * 错误处理工具
 */
export class ErrorHandler {
  /**
   * 安全地执行可能抛出异常的函数
   */
  static safeExecute(fn, defaultValue = null, errorCallback = null) {
    try {
      return fn();
    } catch (error) {
      if (errorCallback && typeof errorCallback === 'function') {
        errorCallback(error);
      } else {
        console.error('执行出错:', error);
      }
      return defaultValue;
    }
  }
  
  /**
   * 异步函数的安全执行器
   */
  static async safeExecuteAsync(asyncFn, defaultValue = null, errorCallback = null) {
    try {
      return await asyncFn();
    } catch (error) {
      if (errorCallback && typeof errorCallback === 'function') {
        errorCallback(error);
      } else {
        console.error('异步执行出错:', error);
      }
      return defaultValue;
    }
  }
  
  /**
   * 格式化错误消息
   */
  static formatError(error, context = '') {
    if (!error) return '未知错误';
    
    const prefix = context ? `[${context}] ` : '';
    
    if (error.message) {
      return `${prefix}${error.message}`;
    }
    
    if (typeof error === 'string') {
      return `${prefix}${error}`;
    }
    
    return `${prefix}未知错误`;
  }
}

/**
 * 性能监控工具
 */
export class PerformanceUtils {
  /**
   * 节流函数
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  /**
   * 防抖函数（增强版，支持立即执行）
   */
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function(...args) {
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      }, wait);
      if (callNow) func.apply(this, args);
    };
  }
  
  /**
   * 限制并发数量的异步执行器
   */
  static async limitConcurrency(tasks, limit = 3) {
    const results = [];
    const executing = [];
    
    for (const task of tasks) {
      const promise = Promise.resolve().then(task);
      results.push(promise);
      
      if (tasks.length >= limit) {
        executing.push(promise.then(() => executing.splice(executing.indexOf(promise), 1)));
      }
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
    
    return Promise.allSettled(results);
  }
}

// 导出默认对象，包含所有工具类
export default {
  Validator,
  BookmarkValidator,
  SecurityUtils,
  ErrorHandler,
  PerformanceUtils
};
