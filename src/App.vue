<template>
  <div id="app">
    <div class="app-container">
      <Header 
        @search="handleSearch"
        @add-bookmark="showAddBookmarkDialog"
        @add-folder="showAddFolderDialog"
        @importBookmarks="showImportDialog"
        @exportBookmarks="showExportDialog"
        @checkInvalid="checkInvalidBookmarks"
        @checkDuplicate="checkDuplicateBookmarks"
        @resetAll="showResetConfirmation"
        @navigate-by-path="navigateByPath"
        @search-paths="searchPaths"
        @navigate-to-folder="handleFolderSelected"
        :folders="folders"
      />
      <div class="main-content">
        <div class="sidebar-container" :style="{ width: sidebarWidth + 'px' }">
          <Sidebar 
            @folder-selected="handleFolderSelected"
            @add-bookmark="showAddBookmarkDialog"
            @custom-sort-folder="showCustomSortFolderDialog"
            @show-special-folder="handleSpecialFolderSelected"
          />
        </div>
        <div class="resizer" @mousedown="initResize"></div>
        <div class="content-container">
          <BookmarkList 
            :current-folder-id="currentFolderId"
            :special-mode="specialMode"
            @folder-selected="handleFolderSelected"
          />
        </div>
      </div>
    </div>

    <!-- 添加书签对话框 -->
    <AddBookmarkDialog 
      :visible.sync="addBookmarkDialogVisible"
      :initial-folder-id="currentFolderId"
    />

    <!-- 添加文件夹对话框 -->
    <el-dialog
      title="新建文件夹"
      :visible.sync="addFolderDialogVisible"
      width="400px"
    >
      <el-form :model="folderForm" :rules="folderRules" ref="folderForm" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="folderForm.name"></el-input>
        </el-form-item>
        <el-form-item label="父文件夹">
          <el-select v-model="folderForm.parentId" placeholder="请选择父文件夹">
            <el-option
              v-for="folder in folderOptions"
              :key="folder.id"
              :label="folder.label"
              :value="folder.id"
            ></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="addFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createFolder">确定</el-button>
      </span>
    </el-dialog>

    <!-- 自定义排序对话框 -->
    <el-dialog
      title="自定义文件夹排序"
      :visible.sync="customSortFolderDialogVisible"
      width="600px"
    >
      <div class="custom-sort-content">
        <p>请输入自定义排序函数（JavaScript）：</p>
        <p class="sort-instruction">
          <small>• 支持函数体格式：<code>return a.name.localeCompare(b.name)</code></small><br>
          <small>• 支持箭头函数格式：<code>(a, b) => a.name.localeCompare(b.name)</code></small><br>
          <small>• 参数a、b代表要比较的两个书签对象</small>
        </p>
        <el-input
          type="textarea"
          :rows="8"
          v-model="customSortFolderFunction"
          placeholder="例如：return a.name.localeCompare(b.name)"
        ></el-input>
        <div class="example-section">
          <p>示例：</p>
          <pre>// 按名称的字符长度排序
return a.name.length - b.name.length;

// 按名称的拼音首字母排序
return a.name.localeCompare(b.name, 'zh-CN');

// 按创建时间排序
return new Date(a.createdAt) - new Date(b.createdAt);</pre>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="customSortFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyCustomSortFolder">应用排序</el-button>
      </span>
    </el-dialog>

    <!-- 导入导出组件 -->
    <ImportExport
      :import-dialog-visible.sync="importDialogVisible"
      :export-dialog-visible.sync="exportDialogVisible"
    />
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import { APP_CONSTANTS } from '@/constants';
import { Validator, SecurityUtils, ErrorHandler } from '@/utils/validation';
import Header from './components/layout/Header.vue';
import Sidebar from './components/layout/Sidebar.vue';
import BookmarkList from './components/bookmarks/BookmarkList.vue';
import AddBookmarkDialog from './components/bookmarks/AddBookmarkDialog.vue';
import ImportExport from './components/common/ImportExport.vue';

export default {
  name: 'App',
  components: {
    Header,
    Sidebar,
    BookmarkList,
    AddBookmarkDialog,
    ImportExport
  },
  data() {
    return {
      currentFolderId: 'root',
      specialMode: null,
      searchQuery: '',
      addBookmarkDialogVisible: false,
      addFolderDialogVisible: false,
      importDialogVisible: false,
      exportDialogVisible: false,
      customSortFolderDialogVisible: false,
      customSortFolderFunction: 'return a.name.localeCompare(b.name)',
      folderToSort: null,
      folderForm: {
        name: '',
        parentId: 'root'
      },
      folderRules: {
        name: [
          { required: true, message: '请输入文件夹名称', trigger: 'blur' },
          { 
            validator: this.validateFolderName, 
            trigger: 'blur' 
          }
        ]
      },
      searchPathsTimer: null,
      allFolderPathsCache: null,
      sidebarWidth: 250,
      isResizing: false,
      // 用于跟踪已使用的撤销通知
      usedUndoNotifications: new Set(),
      // 当前活跃的通知
      activeNotifications: new Map()
    };
  },
  computed: {
    ...mapState({
      folders: state => state.bookmarks.folders,
      lastOperation: state => state.bookmarks.lastOperation
    }),
    ...mapGetters('bookmarks', [
      'getFolderPath',
      'getFoldersByParentId'
    ]),
    folderOptions() {
      return ErrorHandler.safeExecute(() => {
        // 验证文件夹数据
        if (!Validator.isValidArray(this.folders)) {
          return [];
        }
        
        // 构建所有文件夹的扁平列表，包含路径信息
        const result = [];
        
        const traverse = (folder) => {
          // 验证文件夹数据
          if (!this.isValidFolderData(folder)) {
            return;
          }
          
          // 获取当前文件夹的路径
          const path = this.getFolderPath(folder.id);
          if (!Validator.isValidArray(path)) {
            return;
          }
          
          const label = path
            .filter(f => f && f.name)
            .map(f => SecurityUtils.escapeHtml(f.name))
            .join(' / ');
          
          result.push({
            id: folder.id,
            label
          });
          
          // 递归处理子文件夹
          const children = this.folders.filter(f => 
            f && f.parentId === folder.id && this.isValidFolderData(f)
          );
          children.forEach(traverse);
        };
        
        // 从根文件夹开始遍历
        const rootFolder = this.folders.find(f => f && f.id === 'root');
        if (rootFolder && this.isValidFolderData(rootFolder)) {
          traverse(rootFolder);
        }
        
        return result;
      }, '构建文件夹选项失败', []);
    },
    
    // 安全显示当前文件夹ID
    safeCurrentFolderId() {
      return Validator.isValidId(this.currentFolderId) ? this.currentFolderId : 'root';
    }
  },
  watch: {
    // 监听最近操作，如果有新操作，则显示撤销通知
    lastOperation(newOperation, oldOperation) {
      return ErrorHandler.safeExecute(() => {
        if (newOperation && newOperation.id) {
          // 关闭之前的所有活跃通知
          this.activeNotifications.forEach((notification) => {
            if (notification && typeof notification.close === 'function') {
              notification.close();
            }
          });
          this.activeNotifications.clear();
          
          // 如果操作涉及文件夹（添加、删除、移动、重命名），清除路径缓存
          if (newOperation.type === 'add' || newOperation.type === 'delete' || 
              newOperation.type === 'move' || newOperation.type === 'update' ||
              newOperation.type === 'import' || newOperation.type === 'reset') {
            this.allFolderPathsCache = null;
          }
          
          // 使用操作自身的ID
          const operationId = newOperation.id;
          // 安全显示操作描述
          const safeDescription = SecurityUtils.escapeHtml(newOperation.description || '操作');
          
          const notification = this.$notify({
            title: '操作完成',
            message: `${safeDescription}已完成，点击可撤销此操作`,
            duration: 5000,
            type: 'info',
            onClick: () => {
              // 检查是否已经被使用过
              if (this.usedUndoNotifications.has(operationId)) {
                this.$message.warning('该操作已经被撤销过了');
                return;
              }
              
              // 标记为已使用
              this.usedUndoNotifications.add(operationId);
              
              // 从活跃通知中移除
              this.activeNotifications.delete(operationId);
              
              // 执行撤销
              this.undoLastOperation();
              
              // 关闭通知
              if (notification && typeof notification.close === 'function') {
                notification.close();
              }
            }
          });
          
          // 存储活跃的通知
          this.activeNotifications.set(operationId, notification);
        }
      }, '操作通知处理失败');
    }
  },
  methods: {
    ...mapActions('bookmarks', [
      'addFolder',
      'checkInvalidBookmarks',
      'checkDuplicateBookmarks',
      'sortBookmarksCustom',
      'undoOperation',
      'resetAllBookmarks',
      'resetAllFolders',
      'resetAll'
    ]),
    
    // 验证文件夹数据
    isValidFolderData(folder) {
      return folder && 
             typeof folder === 'object' &&
             Validator.isValidId(folder.id) &&
             typeof folder.name === 'string' &&
             folder.name.length <= APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME;
    },
    
    // 验证文件夹名称
    validateFolderName(rule, value, callback) {
      return ErrorHandler.safeExecute(() => {
        if (Validator.isEmpty(value)) {
          callback(new Error('文件夹名称不能为空'));
          return;
        }
        
        if (value.length > APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME) {
          callback(new Error(`文件夹名称不能超过${APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME}个字符`));
          return;
        }
        
        // 检查危险字符
        const dangerousChars = ['<', '>', '"', '\'', '&', '/', '\\'];
        if (dangerousChars.some(char => value.includes(char))) {
          callback(new Error('文件夹名称包含非法字符'));
          return;
        }
        
        callback();
      }, '文件夹名称验证失败', () => callback(new Error('验证失败')));
    },
    
    // 验证和清理搜索查询
    validateAndSanitizeSearch(query) {
      if (Validator.isEmpty(query)) {
        return '';
      }
      
      if (query.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) {
        this.$message.warning(`搜索内容已截断到${APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME}个字符`);
        query = query.substring(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME);
      }
      
      return SecurityUtils.sanitizeInput(query);
    },
    
    // 验证和清理自定义排序函数
    validateAndSanitizeCustomSort(functionStr) {
      if (Validator.isEmpty(functionStr)) {
        throw new Error('排序函数不能为空');
      }
      
      // 去除前后空白
      let cleanStr = functionStr.trim();
      
      // 如果是箭头函数格式，转换为函数体格式
      const arrowFunctionRegex = /^\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*(.+)$/;
      const match = cleanStr.match(arrowFunctionRegex);
      if (match) {
        const functionBody = match[1].trim();
        // 如果函数体没有 return 语句，则添加
        if (!functionBody.startsWith('return ') && !functionBody.includes('return ')) {
          cleanStr = `return ${functionBody}`;
        } else {
          cleanStr = functionBody;
        }
      }
      
      // 如果不是以 return 开头，自动添加
      if (!cleanStr.startsWith('return ') && !cleanStr.includes('return ')) {
        cleanStr = `return ${cleanStr}`;
      }
      
      // 基本安全检查 - 禁止危险关键字
      const dangerousKeywords = [
        'eval', 'Function', 'setTimeout', 'setInterval',
        'document', 'window', 'global', 'process',
        'require', 'import', 'fetch', 'XMLHttpRequest'
      ];
      
      if (dangerousKeywords.some(keyword => cleanStr.includes(keyword))) {
        throw new Error('排序函数包含不安全的内容');
      }
      
      // 长度限制
      if (cleanStr.length > 1000) {
        throw new Error('排序函数过长');
      }
      
      // 尝试创建函数进行语法验证
      try {
        new Function('a', 'b', cleanStr);
      } catch (error) {
        throw new Error(`排序函数语法错误: ${error.message}`);
      }
      
      return SecurityUtils.sanitizeInput(cleanStr);
    },
    
    // 处理文件夹选择
    handleFolderSelected(folderId) {
      return ErrorHandler.safeExecute(() => {
        // 验证文件夹ID
        if (!Validator.isValidId(folderId)) {
          this.$message.error('无效的文件夹ID');
          return;
        }
        
        this.currentFolderId = folderId;
        this.specialMode = null;
      }, '文件夹选择失败');
    },
    
    // 处理特殊文件夹选择
    handleSpecialFolderSelected(mode) {
      return ErrorHandler.safeExecute(() => {
        // 验证模式
        const validModes = ['invalid', 'duplicate'];
        if (!validModes.includes(mode)) {
          this.$message.error('无效的特殊文件夹模式');
          return;
        }
        
        this.specialMode = mode;
      }, '特殊文件夹选择失败');
    },
    
    // 处理搜索
    handleSearch(query) {
      return ErrorHandler.safeExecute(() => {
        // 验证和清理搜索查询
        const cleanQuery = this.validateAndSanitizeSearch(query);
        this.searchQuery = cleanQuery;
        
        if (Validator.isEmpty(cleanQuery)) {
          // 如果查询为空，则不执行搜索
          return;
        }
        
        // 执行搜索
        const lowercaseQuery = cleanQuery.toLowerCase().trim();
        
        // 搜索相关书签
        const bookmarks = this.$store.state.bookmarks.bookmarks;
        if (!Validator.isValidArray(bookmarks)) {
          return;
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
          // 获取书签所在文件夹的路径
          const folderPath = this.getFolderPath(bookmark.folderId);
          const pathString = Validator.isValidArray(folderPath) 
            ? folderPath.map(f => SecurityUtils.escapeHtml(f.name || '')).join(' / ')
            : '';
          
          return {
            ...bookmark,
            folderPath: folderPath,
            pathString: pathString
          };
        });
        
        // 如果找到结果，显示一个自定义的搜索结果对话框
        if (bookmarksWithPath.length > 0) {
          this.$notify({
            title: '搜索结果',
            message: `找到 ${bookmarksWithPath.length} 个匹配的书签`,
            type: 'success',
            duration: 3000
          });
          
          // 在搜索结果对话框中显示匹配的书签，包含路径信息
          // 使用安全的方式显示搜索结果，避免XSS风险
          const searchResultsHtml = this.generateSearchResultsHtml(bookmarksWithPath);
          
          this.$confirm(searchResultsHtml, '搜索结果', {
            dangerouslyUseHTMLString: true, // 允许HTML渲染以正确显示搜索结果
            confirmButtonText: '关闭',
            showCancelButton: false,
            closeOnClickModal: true,
            center: true,
            customClass: 'search-results-dialog'
          }).catch(() => {});
          
          // 改用更安全的组件方式显示搜索结果
          this.showSearchResultsDialog(bookmarksWithPath);
        } else {
          this.$message({
            type: 'info',
            message: `未找到匹配"${SecurityUtils.escapeHtml(query)}"的书签`
          });
        }
      }, '搜索处理失败');
    },
    
    showAddBookmarkDialog(folderId) {
      return ErrorHandler.safeExecute(() => {
        if (folderId && Validator.isValidId(folderId)) {
          this.currentFolderId = folderId;
        }
        this.addBookmarkDialogVisible = true;
      }, '显示添加书签对话框失败');
    },
    
    showAddFolderDialog() {
      return ErrorHandler.safeExecute(() => {
        this.folderForm = {
          name: '',
          parentId: this.currentFolderId
        };
        this.addFolderDialogVisible = true;
      }, '显示添加文件夹对话框失败');
    },
    
    createFolder() {
      return ErrorHandler.safeExecute(() => {
        this.$refs.folderForm.validate((valid) => {
          if (valid) {
            // 验证和清理文件夹名称
            const cleanName = SecurityUtils.sanitizeInput(this.folderForm.name);
            if (cleanName.length > APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME) {
              this.$message.warning(`文件夹名称不能超过${APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME}个字符`);
              return;
            }
            
            this.addFolder({
              ...this.folderForm,
              name: cleanName
            });
            this.addFolderDialogVisible = false;
            this.$message({
              type: 'success',
              message: '创建文件夹成功!'
            });
          } else {
            return false;
          }
        });
      }, '创建文件夹失败');
    },
    
    showImportDialog() {
      return ErrorHandler.safeExecute(() => {
        this.importDialogVisible = true;
      }, '显示导入对话框失败');
    },
    
    showExportDialog() {
      return ErrorHandler.safeExecute(() => {
        this.exportDialogVisible = true;
      }, '显示导出对话框失败');
    },
    
    async checkInvalidBookmarks() {
      return ErrorHandler.safeExecuteAsync(async () => {
        this.$message({
          message: '正在检测无效书签，请稍候...',
          type: 'info'
        });
        
        const invalidBookmarks = await this.$store.dispatch('bookmarks/checkInvalidBookmarks');
        if (Validator.isValidArray(invalidBookmarks) && invalidBookmarks.length > 0) {
          this.$message({
            message: `检测到 ${invalidBookmarks.length} 个无效书签`,
            type: 'warning'
          });
          this.handleSpecialFolderSelected('invalid');
        } else {
          this.$message({
            message: '未检测到无效书签',
            type: 'success'
          });
        }
      }, '检测无效书签失败');
    },
    
    checkDuplicateBookmarks() {
      return ErrorHandler.safeExecute(() => {
        const duplicateBookmarks = this.$store.dispatch('bookmarks/checkDuplicateBookmarks');
        if (Validator.isValidArray(duplicateBookmarks) && duplicateBookmarks.length > 0) {
          this.$message({
            message: `检测到 ${duplicateBookmarks.length} 个重复书签`,
            type: 'warning'
          });
          this.handleSpecialFolderSelected('duplicate');
        } else {
          this.$message({
            message: '未检测到重复书签',
            type: 'success'
          });
        }
      }, '检测重复书签失败');
    },
    
    showCustomSortFolderDialog(folderId) {
      return ErrorHandler.safeExecute(() => {
        if (!Validator.isValidId(folderId)) {
          this.$message.error('无效的文件夹ID');
          return;
        }
        this.folderToSort = folderId;
        this.customSortFolderDialogVisible = true;
      }, '显示自定义排序对话框失败');
    },
    
    applyCustomSortFolder() {
      return ErrorHandler.safeExecute(() => {
        if (!this.folderToSort) {
          this.$message.warning('请先选择要排序的文件夹');
          return;
        }
        
        try {
          // 验证和清理排序函数
          const cleanFunction = this.validateAndSanitizeCustomSort(this.customSortFolderFunction);
          
          this.sortBookmarksCustom({
            folderId: this.folderToSort,
            sortFunctionString: cleanFunction
          });
          this.customSortFolderDialogVisible = false;
          this.$message({
            type: 'success',
            message: '排序成功!'
          });
        } catch (error) {
          this.$message({
            type: 'error',
            message: error.message || '排序函数格式错误'
          });
        }
      }, '应用自定义排序失败');
    },
    
    undoLastOperation() {
      return ErrorHandler.safeExecute(() => {
        this.undoOperation();
        // 清除文件夹路径缓存，确保撤销操作后路径搜索结果是最新的
        this.allFolderPathsCache = null;
        this.$message({
          type: 'success',
          message: '操作已撤销'
        });
      }, '撤销操作失败');
    },
    
    showResetConfirmation() {
      this.$confirm('确定要清除所有收藏夹和书签吗？此操作无法撤销。', '确认清除', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 关闭所有活跃的通知
        this.activeNotifications.forEach((notification) => {
          if (notification && typeof notification.close === 'function') {
            notification.close();
          }
        });
        this.activeNotifications.clear();
        this.usedUndoNotifications.clear();
        
        // 调用 Vuex 的 resetAll action
        this.resetAll().then(() => {
          // 重置组件状态
          this.currentFolderId = 'root';
          this.specialMode = null;
          
          // 清除文件夹路径缓存
          this.allFolderPathsCache = null;
          
          // 重置搜索状态
          this.searchQuery = '';
          
          this.$message({
            type: 'success',
            message: '所有收藏夹和书签已清除'
          });
          
          // 等待下一次 DOM 更新周期，确保所有组件都已更新
          this.$nextTick(() => {
            // 强制更新所有子组件
            this.$forceUpdate();
          });
        }).catch(error => {
          this.$message.error('清除失败: ' + error.message);
        });
      }).catch(() => {});
    },
    
    navigateByPath(path) {
      if (!path) return;
      
      // 解析路径
      const parts = path.split('/').map(p => p.trim()).filter(p => p);
      
      if (parts.length === 0) return;
      
      // 从根目录开始查找
      let currentFolderId = 'root';
      let foundComplete = true;
      
      // 逐级查找文件夹
      for (let i = 0; i < parts.length; i++) {
        const folderName = parts[i];
        
        // 如果是第一部分，且为根目录名称，则跳过
        if (i === 0 && folderName === '收藏夹根目录') {
          continue;
        }
        
        // 查找当前级别下匹配名称的文件夹
        const childFolders = this.getFoldersByParentId(currentFolderId);
        const matchedFolder = childFolders.find(f => f.name === folderName);
        
        if (!matchedFolder) {
          foundComplete = false;
          this.$message.warning(`找不到路径中的文件夹"${folderName}"`);
          break;
        }
        
        currentFolderId = matchedFolder.id;
      }
      
      if (foundComplete) {
        this.handleFolderSelected(currentFolderId);
        this.$message.success('已跳转到指定路径');
      }
    },
    
    searchPaths(query, callback) {
      if (!query) {
        callback([]);
        return;
      }
      
      // 使用防抖优化，防止频繁计算
      if (this.searchPathsTimer) {
        clearTimeout(this.searchPathsTimer);
      }
      
      this.searchPathsTimer = setTimeout(() => {
        const lowercaseQuery = query.toLowerCase();
        const results = [];
        
        // 只构建一次路径缓存
        if (!this.allFolderPathsCache) {
          this.allFolderPathsCache = [];
          
          const buildPath = (folderId, depth = 0) => {
            // 防止无限递归，添加深度限制
            if (depth > APP_CONSTANTS.MAX_DEPTH.FOLDER_PARSING || this.allFolderPathsCache.length > APP_CONSTANTS.CACHE_LIMITS.MAX_PATH_CACHE_SIZE) {
              console.warn('递归深度或路径数量达到限制，停止构建路径缓存');
              return;
            }
            
            const path = this.getFolderPath(folderId);
            const pathString = path.map(f => f.name).join(' / ');
            
            this.allFolderPathsCache.push({
              id: folderId,
              pathString: pathString,
              path: path
            });
            
            // 递归处理子文件夹
            const children = this.getFoldersByParentId(folderId);
            children.forEach(child => buildPath(child.id, depth + 1));
          };
          
          // 从根目录开始构建所有路径
          buildPath('root', 0);
        }
        
        // 查找匹配的路径
        for (let i = 0; i < this.allFolderPathsCache.length; i++) {
          const item = this.allFolderPathsCache[i];
          if (item.pathString.toLowerCase().includes(lowercaseQuery)) {
            results.push(item);
            // 增加返回结果数量限制
            if (results.length >= APP_CONSTANTS.PAGINATION.DEFAULT_SEARCH_RESULTS) break;
          }
        }
        
        // 返回结果
        callback(results);
      }, APP_CONSTANTS.DEBOUNCE_DELAY.SEARCH); // 防抖
    },
    
    initResize(e) {
      this.isResizing = true;
      document.addEventListener('mousemove', this.handleResize);
      document.addEventListener('mouseup', this.stopResize);
      // 阻止默认选择行为
      e.preventDefault();
    },
    
    handleResize(e) {
      if (!this.isResizing) return;
      const newWidth = e.clientX;
      
      // 限制最小和最大宽度
      if (newWidth < APP_CONSTANTS.LAYOUT.SIDEBAR_MIN_WIDTH) {
        this.sidebarWidth = APP_CONSTANTS.LAYOUT.SIDEBAR_MIN_WIDTH;
      } else if (newWidth > window.innerWidth - APP_CONSTANTS.LAYOUT.SIDEBAR_MAX_OFFSET) {
        this.sidebarWidth = window.innerWidth - APP_CONSTANTS.LAYOUT.SIDEBAR_MAX_OFFSET;
      } else {
        this.sidebarWidth = newWidth;
      }
    },
    
    stopResize() {
      this.isResizing = false;
      document.removeEventListener('mousemove', this.handleResize);
      document.removeEventListener('mouseup', this.stopResize);
    },
    
    // 安全地生成搜索结果HTML，避免XSS
    generateSearchResultsHtml(bookmarksWithPath) {
      const escapeHtml = (text) => {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
      }
      
      const resultsList = bookmarksWithPath.map(bookmark => {
        const escapedName = escapeHtml(bookmark.name)
        const escapedUrl = escapeHtml(bookmark.url)
        const escapedPath = escapeHtml(bookmark.pathString)
        
        return `
          <li style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <div><b>${escapedName}</b></div>
            <div style="color: #999; font-size: 12px;">${escapedUrl}</div>
            <div style="color: #67C23A; font-size: 12px; margin-top: 5px;">
              <i class="el-icon-folder"></i> ${escapedPath}
            </div>
          </li>
        `
      }).join('')
      
      return `
        <div style="max-height: 300px; overflow-y: auto;">
          <h3>找到 ${bookmarksWithPath.length} 个匹配的书签</h3>
          <ul style="list-style: none; padding: 0;">
            ${resultsList}
          </ul>
        </div>
      `
    },
    
    // 处理搜索结果交互，避免全局事件污染
    handleSearchResultInteraction(bookmarksWithPath) {
      // 为每个书签显示操作按钮的MessageBox
      const actions = bookmarksWithPath.map(bookmark => ({
        text: `${bookmark.name} - 跳转到文件夹`,
        callback: () => this.handleFolderSelected(bookmark.folderId)
      }))
      
      // 可以在这里实现更安全的交互方式
      // 比如使用弹出菜单或其他组件方式
    },
    
    // 更安全地显示搜索结果的方法
    showSearchResultsDialog(bookmarksWithPath) {
      // 使用Element UI的Table组件更安全地显示搜索结果
      const resultData = bookmarksWithPath.map(bookmark => ({
        name: bookmark.name,
        url: bookmark.url,
        path: bookmark.pathString,
        folderId: bookmark.folderId
      }));
      
      // 创建一个简单的搜索结果显示
      this.$msgbox({
        title: `搜索结果 (${bookmarksWithPath.length}条)`,
        message: `找到了${bookmarksWithPath.length}个匹配的书签，您可以在书签列表中查看详细信息。`,
        showCancelButton: false,
        confirmButtonText: '确定',
        type: 'info'
      });
    }
  },
  
  beforeDestroy() {
    // 清理所有活跃的通知
    this.activeNotifications.forEach((notification) => {
      if (notification && typeof notification.close === 'function') {
        notification.close();
      }
    });
    this.activeNotifications.clear();
    this.usedUndoNotifications.clear();
    
    // 清理定时器
    if (this.searchPathsTimer) {
      clearTimeout(this.searchPathsTimer);
      this.searchPathsTimer = null;
    }
    
    // 清理事件监听器
    document.removeEventListener('mousemove', this.handleResize);
    document.removeEventListener('mouseup', this.stopResize);
    
    // 清理可能的window事件监听器
    window.removeEventListener('jump-to-folder', this.handleJumpToFolder);
    
    // 清理缓存
    this.allFolderPathsCache = null;
  }
};
</script>

<style>
/* 全局样式 */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}

#app {
  height: 100%;
  color: #2c3e50;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar-container {
  width: 250px;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.05s ease;
}

.content-container {
  flex: 1;
  overflow: hidden;
}

.resizer {
  width: 8px;
  background-color: #eee;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
  z-index: 10;
}

.resizer:hover {
  background-color: #ddd;
}

.resizer::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 30px;
  background-color: #ccc;
  border-radius: 1px;
}

.custom-sort-content {
  max-height: 500px;
  overflow-y: auto;
}

.sort-instruction {
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  padding: 10px;
  margin: 10px 0;
  color: #0369a1;
}

.sort-instruction code {
  background-color: #e0f2fe;
  padding: 2px 4px;
  border-radius: 2px;
  font-family: monospace;
}

.example-section {
  margin-top: 15px;
  background-color: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
}

.example-section pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
