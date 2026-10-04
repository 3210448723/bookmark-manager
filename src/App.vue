<template>
  <div id="app">
    <div class="app-container">
      <Header
        :folders="folders"
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
            :focus-bookmark-id="searchTargetBookmarkId"
            :navigation-history="navigationHistory"
            :navigation-history-index="navigationHistoryIndex"
            @folder-selected="handleFolderSelected"
            @navigate-history="navigateHistory"
          />
        </div>
      </div>
    </div>

    <AddBookmarkDialog :visible.sync="addBookmarkDialogVisible" :initial-folder-id="currentFolderId" />

    <el-dialog title="新建文件夹" :visible.sync="addFolderDialogVisible" width="400px">
      <el-form ref="folderForm" :model="folderForm" :rules="folderRules" label-width="80px">
        <el-form-item label="名称" prop="name"><el-input v-model="folderForm.name"></el-input></el-form-item>
        <el-form-item label="父文件夹">
          <el-select v-model="folderForm.parentId" placeholder="请选择父文件夹">
            <el-option v-for="folder in folderOptions" :key="folder.id" :label="folder.label" :value="folder.id"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="addFolderDialogVisible = false">取消</el-button><el-button type="primary" @click="createFolder">确定</el-button></span>
    </el-dialog>

    <el-dialog title="自定义文件夹排序" :visible.sync="customSortFolderDialogVisible" width="600px">
      <div class="custom-sort-content">
        <p>请输入自定义排序函数（JavaScript）：</p>
        <p class="sort-instruction"><small>支持函数体：<code>return a.name.localeCompare(b.name)</code></small><br><small>参数 a、b 代表要比较的两个书签对象。</small></p>
        <el-input v-model="customSortFolderFunction" type="textarea" :rows="8" placeholder="例如：return a.name.localeCompare(b.name)"></el-input>
      </div>
      <span slot="footer"><el-button @click="customSortFolderDialogVisible = false">取消</el-button><el-button type="primary" @click="applyCustomSortFolder">应用排序</el-button></span>
    </el-dialog>

    <!-- 搜索结果使用真实 Vue 节点渲染，避免 HTML 字符串和全局回调造成 XSS/状态污染。 -->
    <el-dialog title="搜索结果" :visible.sync="searchResultsDialogVisible" width="760px" custom-class="search-results-dialog">
      <div class="search-result-summary">找到 {{ searchResults.length }} 个匹配的书签，点击“定位”可展开对应路径并滚动到目标位置。</div>
      <el-table :data="searchResults" max-height="55vh" stripe @row-click="navigateToSearchResult">
        <el-table-column label="名称" min-width="180"><template slot-scope="scope"><span class="search-result-name">{{ safeText(scope.row.name) }}</span></template></el-table-column>
        <el-table-column prop="url" label="URL" min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column label="所在路径" min-width="210"><template slot-scope="scope">{{ safeText(scope.row.pathString) }}</template></el-table-column>
        <el-table-column label="操作" width="90"><template slot-scope="scope"><el-button type="primary" size="mini" @click.stop="navigateToSearchResult(scope.row)">定位</el-button></template></el-table-column>
      </el-table>
      <span slot="footer"><el-button @click="searchResultsDialogVisible = false">关闭</el-button></span>
    </el-dialog>

    <ImportExport :import-dialog-visible.sync="importDialogVisible" :export-dialog-visible.sync="exportDialogVisible" />
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import Header from './components/layout/Header.vue';
import Sidebar from './components/layout/Sidebar.vue';
import BookmarkList from './components/bookmarks/BookmarkList.vue';
import AddBookmarkDialog from './components/bookmarks/AddBookmarkDialog.vue';
import ImportExport from './components/common/ImportExport.vue';
import { APP_CONSTANTS } from '@/constants';
import { Validator, SecurityUtils, ErrorHandler } from '@/utils/validation';
import searchService from '@/utils/searchService';

const { normalizeSortFunction } = require('@/utils/sortFunction');

export default {
  name: 'App',
  components: { Header, Sidebar, BookmarkList, AddBookmarkDialog, ImportExport },
  data() {
    return {
      currentFolderId: 'root',
      specialMode: null,
      searchTargetBookmarkId: null,
      navigationHistory: [{ id: 'root', label: '收藏夹根目录' }],
      navigationHistoryIndex: 0,
      searchResults: [],
      searchResultsDialogVisible: false,
      searchQuery: '',
      addBookmarkDialogVisible: false,
      addFolderDialogVisible: false,
      importDialogVisible: false,
      exportDialogVisible: false,
      customSortFolderDialogVisible: false,
      customSortFolderFunction: 'return a.name.localeCompare(b.name)',
      folderToSort: null,
      folderForm: { name: '', parentId: 'root' },
      folderRules: { name: [{ required: true, message: '请输入文件夹名称', trigger: 'blur' }, { validator: this.validateFolderName, trigger: 'blur' }] },
      sidebarWidth: 250,
      isResizing: false,
      searchPathsTimer: null,
      activeNotifications: new Map()
    };
  },
  computed: {
    ...mapState({ folders: state => state.bookmarks.folders, lastOperation: state => state.bookmarks.lastOperation }),
    ...mapGetters('bookmarks', ['getFolderPath', 'getFoldersByParentId']),
    folderOptions() {
      const result = [];
      const visit = (folder, visited) => {
        if (!folder || visited.has(folder.id)) return;
        visited.add(folder.id);
        result.push({ id: folder.id, label: this.getFolderPath(folder.id).map(item => this.safeText(item.name)).join(' / ') });
        this.getFoldersByParentId(folder.id).forEach(child => visit(child, new Set(visited)));
      };
      const root = this.folders.find(folder => folder.id === 'root');
      if (root) visit(root, new Set());
      return result;
    }
  },
  watch: {
    lastOperation(operation) {
      if (!operation || !operation.id || !this.$notify) return;
      searchService.clearCache();
      const notification = this.$notify({ title: '操作完成', message: `${this.safeText(operation.description || '操作')}，可通过顶部撤销按钮回退`, type: 'info', duration: 3500 });
      this.activeNotifications.set(operation.id, notification);
    }
  },
  methods: {
    ...mapActions('bookmarks', ['addFolder', 'sortBookmarksCustom', 'checkInvalidBookmarks', 'checkDuplicateBookmarks', 'resetAll']),
    safeText(text) { return Validator.isEmpty(text) ? '' : SecurityUtils.stripHtml(String(text)); },
    validateFolderName(rule, value, callback) {
      const name = SecurityUtils.sanitizeInput(value || '');
      if (!name) return callback(new Error('文件夹名称不能为空'));
      if (name.length > APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME) return callback(new Error(`文件夹名称不能超过${APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME}个字符`));
      if (/["'&/\\<>]/.test(name)) return callback(new Error('文件夹名称包含非法字符'));
      callback();
    },
    handleFolderSelected(folderId) {
      if (!Validator.isValidId(folderId)) return this.$message.error('无效的文件夹 ID');
      this.specialMode = null;
      this.searchTargetBookmarkId = null;
      this.currentFolderId = folderId;
      this.recordNavigation(folderId);
    },
    handleSpecialFolderSelected(mode) {
      if (!['invalid', 'duplicate'].includes(mode)) return this.$message.error('无效的特殊文件夹模式');
      this.specialMode = mode;
      this.searchTargetBookmarkId = null;
    },
    recordNavigation(folderId) {
      const current = this.navigationHistory[this.navigationHistoryIndex];
      if (current && current.id === folderId) return;
      const entry = { id: folderId, label: this.getFolderPath(folderId).map(folder => this.safeText(folder.name)).join(' / ') || folderId };
      let history = this.navigationHistory.slice(0, this.navigationHistoryIndex + 1).concat(entry);
      if (history.length > APP_CONSTANTS.NAVIGATION_HISTORY_LIMIT) history = history.slice(-APP_CONSTANTS.NAVIGATION_HISTORY_LIMIT);
      this.navigationHistory = history;
      this.navigationHistoryIndex = history.length - 1;
    },
    navigateHistory(index) {
      const entry = this.navigationHistory[index];
      if (!entry) return;
      this.navigationHistoryIndex = index;
      this.currentFolderId = entry.id;
      this.specialMode = null;
      this.searchTargetBookmarkId = null;
    },
    handleSearch(query) {
      const cleanQuery = SecurityUtils.sanitizeInput(query || '').slice(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME);
      this.searchQuery = cleanQuery;
      if (!cleanQuery) { this.searchResults = []; this.searchResultsDialogVisible = false; return; }
      // 添加/编辑/删除书签不一定写入操作历史，搜索前主动失效缓存，避免返回旧结果。
      searchService.clearCache();
      const results = searchService.searchBookmarks(cleanQuery, this.$store.state.bookmarks.bookmarks, folderId => this.getFolderPath(folderId));
      this.searchResults = results.slice(0, APP_CONSTANTS.PAGINATION.DEFAULT_SEARCH_RESULTS);
      if (this.searchResults.length) this.searchResultsDialogVisible = true;
      else this.$message.info(`未找到匹配“${this.safeText(cleanQuery)}”的书签`);
    },
    navigateToSearchResult(bookmark) {
      if (!bookmark || !Validator.isValidId(bookmark.id)) return this.$message.error('搜索结果无效');
      this.searchResultsDialogVisible = false;
      this.specialMode = null;
      this.currentFolderId = Validator.isValidId(bookmark.folderId) ? bookmark.folderId : 'root';
      this.searchTargetBookmarkId = bookmark.id;
      this.recordNavigation(this.currentFolderId);
      this.$message.success('已定位到书签');
    },
    showAddBookmarkDialog(folderId) { if (folderId && Validator.isValidId(folderId)) this.handleFolderSelected(folderId); this.addBookmarkDialogVisible = true; },
    showAddFolderDialog() { this.folderForm = { name: '', parentId: this.currentFolderId }; this.addFolderDialogVisible = true; },
    async createFolder() {
      const valid = await new Promise(resolve => this.$refs.folderForm.validate(resolve));
      if (!valid) return;
      const name = SecurityUtils.sanitizeInput(this.folderForm.name);
      await this.addFolder({ name, parentId: Validator.isValidId(this.folderForm.parentId) ? this.folderForm.parentId : 'root' });
      this.addFolderDialogVisible = false;
      this.$message.success('创建文件夹成功');
    },
    showImportDialog() { this.importDialogVisible = true; },
    showExportDialog() { this.exportDialogVisible = true; },
    async checkInvalidBookmarks() {
      this.$message.info('正在检测无效书签，请稍候…');
      const result = await this.$store.dispatch('bookmarks/checkInvalidBookmarks');
      if (result.length) { this.handleSpecialFolderSelected('invalid'); this.$message.warning(`检测到 ${result.length} 个无效书签`); } else this.$message.success('未检测到无效书签');
    },
    async checkDuplicateBookmarks() {
      const result = await this.$store.dispatch('bookmarks/checkDuplicateBookmarks');
      if (result.length) { this.handleSpecialFolderSelected('duplicate'); this.$message.warning(`检测到 ${result.length} 个重复书签`); } else this.$message.success('未检测到重复书签');
    },
    showCustomSortFolderDialog(folderId) { if (!Validator.isValidId(folderId)) return this.$message.error('无效的文件夹 ID'); this.folderToSort = folderId; this.customSortFolderDialogVisible = true; },
    async applyCustomSortFolder() {
      if (!this.folderToSort) return;
      try {
        const code = normalizeSortFunction(this.customSortFolderFunction);
        await this.sortBookmarksCustom({ folderId: this.folderToSort, sortFunctionString: code });
        this.customSortFolderDialogVisible = false;
        this.$message.success('排序成功，函数已保存到历史');
      } catch (error) { this.$message.error(error.message || '排序函数格式错误'); }
    },
    showResetConfirmation() {
      this.$confirm('确定要清除所有收藏夹和书签吗？此操作无法撤销。', '确认清除', { type: 'warning' }).then(async () => {
        await this.resetAll();
        this.currentFolderId = 'root';
        this.specialMode = null;
        this.searchTargetBookmarkId = null;
        this.navigationHistory = [{ id: 'root', label: '收藏夹根目录' }];
        this.navigationHistoryIndex = 0;
        this.$message.success('所有收藏夹和书签已清除');
      }).catch(() => {});
    },
    navigateByPath(path) {
      const parts = String(path || '').split('/').map(item => SecurityUtils.sanitizeInput(item.trim())).filter(Boolean);
      if (!parts.length) return;
      let currentId = 'root';
      const start = parts[0] === '收藏夹根目录' ? 1 : 0;
      for (let index = start; index < parts.length; index += 1) {
        const next = this.getFoldersByParentId(currentId).find(folder => folder.name === parts[index]);
        if (!next) return this.$message.warning(`找不到路径中的文件夹“${parts[index]}”`);
        currentId = next.id;
      }
      this.handleFolderSelected(currentId);
      this.$message.success('已跳转到指定路径');
    },
    searchPaths(query, callback) {
      if (this.searchPathsTimer) clearTimeout(this.searchPathsTimer);
      if (!query) return callback([]);
      this.searchPathsTimer = setTimeout(() => {
        const results = [];
        const visit = (folder, visited) => {
          if (!folder || visited.has(folder.id) || results.length >= APP_CONSTANTS.PAGINATION.DEFAULT_SEARCH_RESULTS) return;
          visited.add(folder.id);
          const pathString = this.getFolderPath(folder.id).map(item => item.name).join(' / ');
          if (pathString.toLowerCase().includes(String(query).toLowerCase())) results.push({ id: folder.id, pathString });
          this.getFoldersByParentId(folder.id).forEach(child => visit(child, new Set(visited)));
        };
        visit(this.folders.find(folder => folder.id === 'root'), new Set());
        callback(results);
      }, APP_CONSTANTS.DEBOUNCE_DELAY.SEARCH);
    },
    initResize(event) { this.isResizing = true; document.addEventListener('mousemove', this.handleResize); document.addEventListener('mouseup', this.stopResize); event.preventDefault(); },
    handleResize(event) { if (!this.isResizing) return; const max = Math.max(APP_CONSTANTS.LAYOUT.SIDEBAR_MIN_WIDTH, window.innerWidth - APP_CONSTANTS.LAYOUT.SIDEBAR_MAX_OFFSET); this.sidebarWidth = Math.max(APP_CONSTANTS.LAYOUT.SIDEBAR_MIN_WIDTH, Math.min(max, event.clientX)); },
    stopResize() { this.isResizing = false; document.removeEventListener('mousemove', this.handleResize); document.removeEventListener('mouseup', this.stopResize); }
  },
  mounted() { this.$store.dispatch('bookmarks/initializeBookmarkOrder').catch(error => ErrorHandler.formatError(error, '初始化书签顺序失败')); },
  beforeDestroy() { if (this.searchPathsTimer) clearTimeout(this.searchPathsTimer); this.stopResize(); this.activeNotifications.forEach(notification => notification && notification.close && notification.close()); searchService.cleanup(); }
};
</script>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; }
body { font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif; color: #2c3e50; }
.app-container { height: 100%; display: flex; flex-direction: column; }
.main-content { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.sidebar-container { flex: 0 0 auto; overflow: hidden; }
.content-container { flex: 1; min-width: 0; overflow: hidden; }
.resizer { width: 8px; flex-shrink: 0; cursor: col-resize; background: #eee; z-index: 10; }
.resizer:hover { background: #dcdfe6; }
.custom-sort-content { max-height: 55vh; overflow-y: auto; }
.sort-instruction { padding: 10px; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; }
.search-results-dialog { max-width: calc(100vw - 24px); }
.search-result-summary { margin-bottom: 12px; color: #606266; }
.search-result-name { color: #303133; font-weight: 500; }
@media (max-width: 900px) { .resizer { display: none; } }
</style>
