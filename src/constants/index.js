// 应用常量配置
export const APP_CONSTANTS = {
  // 文件限制
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  
  // 支持的文件扩展名
  SUPPORTED_FILE_EXTENSIONS: ['.html', '.htm'],
  
  // 防抖延迟
  DEBOUNCE_DELAY: {
    SEARCH: 300, // 搜索防抖
    TREE_EXPAND: 100, // 树展开防抖
    RESOURCE_CLEANUP: 100 // 资源清理延迟
  },
  
  // 文本长度限制
  TEXT_LIMITS: {
    FOLDER_NAME: 50,
    BOOKMARK_NAME: 500,
    BOOKMARK_DESCRIPTION: 500,
    FILE_NAME: 255
  },
  
  // 递归深度限制
  MAX_DEPTH: {
    FOLDER_PARSING: 20,
    HTML_GENERATION: 20
  },
  
  // 分页配置
  PAGINATION: {
    ROOT_PAGE_SIZES: [50, 100, 200, 500],
    FOLDER_PAGE_SIZES: [10, 20, 50, 100],
    DEFAULT_SEARCH_RESULTS: 50,
    ROOT_MAX_HEIGHT: 600,
    FOLDER_MAX_HEIGHT: 500
  },
  
  // 缓存限制
  CACHE_LIMITS: {
    MAX_PATH_CACHE_SIZE: 10000,
    MAX_BOOKMARK_CACHE_SIZE: 5000,
    MAX_SEARCH_CACHE_SIZE: 1000 // 新增搜索缓存限制
  },
  
  // UI布局
  LAYOUT: {
    SIDEBAR_MIN_WIDTH: 180,
    SIDEBAR_MAX_OFFSET: 350,
    CHANGE_THRESHOLD: 0.8 // 80%变化阈值
  },
  
  // 时间转换
  TIME_CONVERSION: {
    MS_TO_SECONDS: 1000
  },
  
  // 支持的URL协议
  SUPPORTED_PROTOCOLS: ['http:', 'https:', 'ftp:'],
  
  // 字符编码
  CHAR_CODES: {
    MIN_PRINTABLE: 32,
    DELETE: 127
  }
};

export default APP_CONSTANTS;
