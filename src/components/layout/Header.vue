<template>
  <div class="header">
    <div class="logo">
      <h1>收藏夹管理助手</h1>
    </div>
    <div class="search-box">
      <el-input
        placeholder="搜索收藏夹"
        prefix-icon="el-icon-search"
        v-model="searchQuery"
        @keyup.enter.native="handleSearch"
        clearable
        :maxlength="$store.state.constants ? $store.state.constants.TEXT_LIMITS.BOOKMARK_NAME : 100"
        show-word-limit
      >
        <el-button slot="append" icon="el-icon-search" @click="handleSearch"></el-button>
      </el-input>
    </div>
    <div class="path-navigator">
      <el-popover
        placement="bottom"
        width="400"
        trigger="click"
        v-model="showPathNavigator"
      >
        <div class="path-input-container">
          <p class="path-tip">输入路径如 <code>收藏夹根目录/工作/项目</code> 进行跳转</p>
          <el-input
            placeholder="输入路径，使用 / 分隔层级"
            v-model="pathInput"
            clearable
            @keyup.enter.native="navigateByPath"
            :maxlength="$store.state.constants ? $store.state.constants.TEXT_LIMITS.FILE_NAME : 255"
            show-word-limit
          >
            <el-button slot="append" icon="el-icon-position" @click="navigateByPath">跳转</el-button>
          </el-input>
          <div v-if="pathSuggestions.length > 0" class="path-suggestions">
            <p>可能的路径：</p>
            <ul class="suggestion-list">
              <li 
                v-for="(suggestion, index) in pathSuggestions" 
                :key="index" 
                @click="selectSuggestion(suggestion)"
                class="suggestion-item"
                :title="suggestion.pathString"
              >
                {{ suggestion.pathString }}
              </li>
            </ul>
          </div>
        </div>
        <el-button icon="el-icon-location" slot="reference">路径导航</el-button>
      </el-popover>
    </div>
    <div class="actions">
      <el-button-group>
        <el-button 
          :disabled="!canUndo" 
          @click="handleUndo" 
          icon="el-icon-refresh-left"
          size="small"
          title="撤销"
        ></el-button>
        <el-button 
          :disabled="!canRedo" 
          @click="handleRedo" 
          icon="el-icon-refresh-right"
          size="small"
          title="重做"
        ></el-button>
      </el-button-group>
      <el-button-group style="margin-left: 10px;">
        <el-button type="primary" @click="showAddBookmarkDialog" icon="el-icon-plus">添加收藏</el-button>
        <el-button type="primary" @click="showAddFolderDialog" icon="el-icon-folder-add">添加文件夹</el-button>
        <el-dropdown trigger="click" @command="handleCommand">
          <el-button type="primary" icon="el-icon-more">
            更多操作<i class="el-icon-arrow-down el-icon--right"></i>
          </el-button>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="importBookmarks">
              <i class="el-icon-download"></i> 导入书签
            </el-dropdown-item>
            <el-dropdown-item command="exportBookmarks">
              <i class="el-icon-upload2"></i> 导出书签
            </el-dropdown-item>
            <el-dropdown-item divided command="checkInvalid">
              <i class="el-icon-warning-outline"></i> 检测失效书签
            </el-dropdown-item>
            <el-dropdown-item command="checkDuplicate">
              <i class="el-icon-copy-document"></i> 检测重复书签
            </el-dropdown-item>
            <el-dropdown-item divided command="resetAll">
              <i class="el-icon-delete"></i> 清除所有收藏夹
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </el-button-group>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import { APP_CONSTANTS } from '@/constants';
import { Validator, SecurityUtils, ErrorHandler } from '@/utils/validation';

export default {
  name: 'HeaderComponent',
  data() {
    return {
      searchQuery: '',
      showPathNavigator: false,
      pathInput: '',
      pathSuggestions: [],
      pathSearchTimer: null // 添加防抖定时器
    };
  },
  props: {
    folders: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    ...mapState('bookmarks', ['history', 'currentHistoryIndex']),
    canUndo() {
      return this.currentHistoryIndex >= 0;
    },
    canRedo() {
      return this.currentHistoryIndex < this.history.length - 1;
    },
    currentOperation() {
      if (this.currentHistoryIndex >= 0 && this.history[this.currentHistoryIndex]) {
        return SecurityUtils.escapeHtml(this.history[this.currentHistoryIndex].description || '操作');
      }
      return '';
    },
    nextOperation() {
      const nextIndex = this.currentHistoryIndex + 1;
      if (nextIndex < this.history.length && this.history[nextIndex]) {
        return SecurityUtils.escapeHtml(this.history[nextIndex].description || '操作');
      }
      return '';
    },
    // 安全显示搜索查询
    safeSearchQuery() {
      return SecurityUtils.escapeHtml(this.searchQuery);
    },
    // 安全显示路径输入
    safePathInput() {
      return SecurityUtils.escapeHtml(this.pathInput);
    }
  },
  methods: {
    ...mapActions('bookmarks', ['undo', 'redo']),
    
    // 安全处理搜索
    handleSearch() {
      return ErrorHandler.safeExecute(() => {
        // 验证和清理搜索查询
        const cleanQuery = this.validateAndSanitizeSearchQuery(this.searchQuery);
        if (cleanQuery !== null) {
          this.$emit('search', cleanQuery);
        }
      }, '搜索操作失败');
    },
    
    // 验证和清理搜索查询
    validateAndSanitizeSearchQuery(query) {
      if (Validator.isEmpty(query)) {
        return '';
      }
      
      // 限制搜索查询长度
      if (query.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) {
        this.$message.warning(`搜索内容不能超过${APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME}个字符`);
        return null;
      }
      
      // 清理和转义输入
      return SecurityUtils.sanitizeInput(query);
    },
    
    showAddBookmarkDialog() {
      return ErrorHandler.safeExecute(() => {
        this.$emit('add-bookmark');
      }, '打开添加书签对话框失败');
    },
    
    showAddFolderDialog() {
      return ErrorHandler.safeExecute(() => {
        this.$emit('add-folder');
      }, '打开添加文件夹对话框失败');
    },
    
    handleCommand(command) {
      return ErrorHandler.safeExecute(() => {
        // 验证命令
        if (!this.isValidCommand(command)) {
          this.$message.error('无效的操作命令');
          return;
        }
        
        this.$emit(command);
      }, '执行操作命令失败');
    },
    
    // 验证命令是否合法
    isValidCommand(command) {
      const validCommands = [
        'importBookmarks', 
        'exportBookmarks', 
        'checkInvalid', 
        'checkDuplicate', 
        'resetAll'
      ];
      return validCommands.includes(command);
    },
    
    handleUndo() {
      return ErrorHandler.safeExecute(() => {
        if (this.canUndo) {
          this.undo();
          this.$message({
            type: 'success',
            message: `已撤销: ${this.currentOperation}`,
            duration: 1500
          });
        }
      }, '撤销操作失败');
    },
    
    handleRedo() {
      return ErrorHandler.safeExecute(() => {
        if (this.canRedo) {
          this.redo();
          this.$message({
            type: 'success',
            message: `已重做: ${this.nextOperation}`,
            duration: 1500
          });
        }
      }, '重做操作失败');
    },
    
    navigateByPath() {
      return ErrorHandler.safeExecute(() => {
        // 验证和清理路径输入
        const cleanPath = this.validateAndSanitizePathInput(this.pathInput);
        if (cleanPath === null) {
          return;
        }
        
        if (Validator.isEmpty(cleanPath)) {
          this.$message.warning('请输入有效的路径');
          return;
        }
        
        // 发送路径导航事件
        this.$emit('navigate-by-path', cleanPath);
        
        // 清空路径输入并关闭弹窗
        this.pathInput = '';
        this.showPathNavigator = false;
      }, '路径导航失败');
    },
    
    // 验证和清理路径输入
    validateAndSanitizePathInput(pathInput) {
      if (Validator.isEmpty(pathInput)) {
        return '';
      }
      
      // 限制路径长度
      if (pathInput.length > APP_CONSTANTS.TEXT_LIMITS.FILE_NAME) {
        this.$message.warning(`路径长度不能超过${APP_CONSTANTS.TEXT_LIMITS.FILE_NAME}个字符`);
        return null;
      }
      
      // 检查危险字符
      const dangerousChars = ['<', '>', '"', '\'', '&'];
      if (dangerousChars.some(char => pathInput.includes(char))) {
        this.$message.warning('路径包含非法字符');
        return null;
      }
      
      // 清理和规范化路径
      return SecurityUtils.sanitizeInput(pathInput.trim());
    },
    
    searchPaths() {
      return ErrorHandler.safeExecute(() => {
        // 清除之前的定时器
        if (this.pathSearchTimer) {
          clearTimeout(this.pathSearchTimer);
        }
        
        if (Validator.isEmpty(this.pathInput)) {
          this.pathSuggestions = [];
          return;
        }
        
        // 验证路径输入
        const cleanPath = this.validateAndSanitizePathInput(this.pathInput);
        if (cleanPath === null) {
          this.pathSuggestions = [];
          return;
        }
        
        // 添加防抖，减少频繁调用
        this.pathSearchTimer = setTimeout(() => {
          // 请求路径建议
          this.$emit('search-paths', cleanPath, (suggestions) => {
            // 验证返回的建议
            this.pathSuggestions = this.validatePathSuggestions(suggestions);
          });
        }, APP_CONSTANTS.DEBOUNCE_DELAY.SEARCH);
      }, '搜索路径失败');
    },
    
    // 验证路径建议
    validatePathSuggestions(suggestions) {
      if (!Validator.isValidArray(suggestions)) {
        return [];
      }
      
      return suggestions.filter(suggestion => {
        return suggestion && 
               Validator.isValidId(suggestion.id) && 
               typeof suggestion.pathString === 'string' &&
               suggestion.pathString.length <= APP_CONSTANTS.TEXT_LIMITS.FILE_NAME;
      }).map(suggestion => ({
        id: suggestion.id,
        pathString: SecurityUtils.escapeHtml(suggestion.pathString)
      }));
    },
    
    selectSuggestion(suggestion) {
      return ErrorHandler.safeExecute(() => {
        // 验证建议项
        if (!suggestion || !Validator.isValidId(suggestion.id)) {
          this.$message.error('无效的路径建议');
          return;
        }
        
        // 选择建议的路径并跳转
        this.$emit('navigate-to-folder', suggestion.id);
        this.pathInput = '';
        this.showPathNavigator = false;
      }, '选择路径建议失败');
    },
    
    // 安全清理方法
    safeCleanup() {
      if (this.pathSearchTimer) {
        clearTimeout(this.pathSearchTimer);
        this.pathSearchTimer = null;
      }
      this.pathSuggestions = [];
    }
  },
  watch: {
    pathInput() {
      this.searchPaths();
    },
    
    // 监听搜索查询变化，添加安全验证
    searchQuery(newVal) {
      if (newVal && newVal.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) {
        this.$nextTick(() => {
          this.searchQuery = newVal.substring(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME);
          this.$message.warning(`搜索内容已截断到${APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME}个字符`);
        });
      }
    }
  },
  
  // 添加组件销毁时的清理
  beforeDestroy() {
    this.safeCleanup();
  }
};
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #dcdfe6;
}

.logo {
  flex: 0 0 200px;
}

.logo h1 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.search-box {
  flex: 1;
  margin: 0 20px;
}

.path-navigator {
  margin-right: 20px;
}

.path-input-container {
  padding: 10px;
}

.path-tip {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 13px;
  color: #909399;
}

.path-suggestions {
  margin-top: 10px;
}

.suggestion-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.suggestion-item {
  padding: 5px 10px;
  cursor: pointer;
  border-bottom: 1px solid #ebeef5;
}

.suggestion-item:hover {
  background-color: #f5f7fa;
}

.actions {
  flex: 0 0 auto;
}
</style> 