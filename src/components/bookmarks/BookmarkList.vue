<template>
  <div class="bookmark-list">
    <div class="list-header">
      <div class="path-navigation">
        <el-button-group class="history-buttons">
          <el-button size="mini" icon="el-icon-arrow-left" :disabled="!canGoBack" title="后退" @click="goBack"></el-button>
          <el-button size="mini" icon="el-icon-arrow-right" :disabled="!canGoForward" title="前进" @click="goForward"></el-button>
        </el-button-group>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item
            v-for="folder in folderPath"
            :key="folder.id"
            @click.native="navigateToFolder(folder.id)"
          >
            {{ safeDisplayText(folder.name) }}
          </el-breadcrumb-item>
        </el-breadcrumb>
        <el-dropdown v-if="navigationHistory.length > 1" class="recent-paths" @command="navigateFromHistory">
          <el-button size="mini" icon="el-icon-time" title="最近访问"></el-button>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item v-for="(entry, index) in recentHistory" :key="entry.id + '-' + index" :command="indexOfHistoryEntry(entry)">
              {{ entry.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
        <el-tooltip content="复制当前路径" placement="top">
          <i class="el-icon-copy-document copy-path-icon" @click="copyCurrentPath"></i>
        </el-tooltip>
        <el-tag v-if="currentFolderId === 'root'" size="mini" type="info">显示所有书签</el-tag>
      </div>
      <div class="list-actions">
        <el-button-group v-if="selectedBookmarks.length > 0">
          <el-button size="small" type="primary" @click="moveBulk">移动</el-button>
          <el-button size="small" type="danger" @click="deleteBulk">删除</el-button>
        </el-button-group>
        <el-dropdown v-if="bookmarks.length > 0 && currentFolderId !== 'root' && !specialMode" @command="handleSortCommand">
          <el-button size="small">排序<i class="el-icon-arrow-down el-icon--right"></i></el-button>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="name">按名称排序</el-dropdown-item>
            <el-dropdown-item command="url">按 URL 排序</el-dropdown-item>
            <el-dropdown-item command="date">按添加日期排序</el-dropdown-item>
            <el-dropdown-item command="custom">自定义排序</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
        <el-tooltip v-if="currentFolderId === 'root'" content="根目录显示所有书签，进入具体文件夹后可排序" placement="top">
          <el-button size="small" disabled>排序<i class="el-icon-arrow-down el-icon--right"></i></el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="bookmark-table-wrapper">
      <!-- 小列表继续使用 Element Table，保留选择、列展示和键盘可访问性。 -->
      <el-table
        v-if="!useVirtualList"
        ref="bookmarkTable"
        :data="paginatedBookmarks"
        style="width: 100%"
        height="100%"
        row-key="id"
        v-loading="loading"
        :row-class-name="getRowClassName"
        :class="{ 'dragging-active': dragState.isDragging }"
        @selection-change="handleSelectionChange"
        @row-contextmenu="handleContextMenu"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column label="名称" min-width="180">
          <template slot-scope="scope">
            <div
              class="bookmark-name"
              :class="dragClass(scope.$index, scope.row)"
              draggable="true"
              @dragstart="handleDragStart($event, scope.row, scope.$index)"
              @dragover="handleDragOver($event, scope.$index)"
              @dragenter="handleDragEnter($event)"
              @dragleave="handleDragLeave($event)"
              @drop="handleDrop($event)"
              @dragend="cleanupDrag"
            >
              <img class="favicon" :data-url="scope.row.url" :data-bookmark-id="scope.row.id" alt="" loading="lazy" :src="getInitialFaviconSrc(scope.row.url)" @error="handleFaviconError" @load="handleFaviconLoad">
              <span class="text-ellipsis">{{ safeDisplayText(scope.row.name) }}</span>
              <i v-if="!specialMode && currentFolderId !== 'root'" class="el-icon-sort drag-handle" title="拖拽排序"></i>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" min-width="250" show-overflow-tooltip></el-table-column>
        <el-table-column label="所在路径" min-width="200">
          <template slot-scope="scope">
            <div class="bookmark-path"><span class="text-ellipsis">{{ getBookmarkPath(scope.row) }}</span><i class="el-icon-copy-document copy-item-path" title="复制路径" @click.stop="copyItemPath(scope.row)"></i></div>
          </template>
        </el-table-column>
        <el-table-column label="添加日期" width="180"><template slot-scope="scope">{{ formatDate(scope.row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template slot-scope="scope"><bookmark-actions :bookmark="scope.row" @command="handleCommand"></bookmark-actions></template>
        </el-table-column>
      </el-table>

      <!-- 大列表只渲染视口内的行，避免一次性创建数百/数千个表格节点。 -->
      <VirtualList
        v-else
        ref="virtualList"
        class="virtual-bookmark-list"
        :items="paginatedBookmarks"
        :item-height="virtualRowHeight"
        :container-height="virtualListHeight"
        :get-key="bookmarkKey"
      >
        <template slot-scope="{ item }">
          <div class="virtual-bookmark-row" :class="{ 'bookmark-row-target': item.id === focusBookmarkId }">
            <el-checkbox :value="isSelected(item)" class="virtual-selection" @change="toggleBookmarkSelection(item, $event)"></el-checkbox>
            <img class="favicon" :data-url="item.url" :data-bookmark-id="item.id" alt="" loading="lazy" :src="getInitialFaviconSrc(item.url)" @error="handleFaviconError" @load="handleFaviconLoad">
            <div class="virtual-bookmark-main"><span class="bookmark-title text-ellipsis">{{ safeDisplayText(item.name) }}</span><span class="bookmark-url text-ellipsis">{{ safeDisplayText(item.url) }}</span></div>
            <span class="virtual-bookmark-path text-ellipsis">{{ getBookmarkPath(item) }}</span>
            <span class="virtual-bookmark-date">{{ formatDate(item.createdAt) }}</span>
            <bookmark-actions :bookmark="item" @command="handleCommand"></bookmark-actions>
          </div>
        </template>
        <div slot="empty" class="empty-content"><i class="el-icon-box"></i><p>暂无书签</p></div>
      </VirtualList>
    </div>

    <div class="pagination-container">
      <el-pagination
        small
        background
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="pageSizes"
        :layout="paginationLayout"
        :total="bookmarks.length"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      ></el-pagination>
    </div>

    <el-dialog title="编辑书签" :visible.sync="editDialogVisible" width="500px" @close="handleEditCancel">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="editForm.name"></el-input></el-form-item>
        <el-form-item label="URL"><el-input v-model="editForm.url"></el-input></el-form-item>
        <el-form-item label="描述"><el-input type="textarea" v-model="editForm.description"></el-input></el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="handleEditCancel">取消</el-button><el-button type="primary" @click="saveBookmark">确定</el-button></span>
    </el-dialog>

    <el-dialog title="移动到文件夹" :visible.sync="moveDialogVisible" width="400px">
      <el-tree :data="folderTreeData" :props="defaultProps" node-key="id" :default-expanded-keys="['root']" @node-click="handleFolderSelect"></el-tree>
      <span slot="footer"><el-button @click="moveDialogVisible = false">取消</el-button><el-button type="primary" :disabled="!selectedFolderId" @click="moveBookmark">确定</el-button></span>
    </el-dialog>

    <el-dialog title="自定义排序" :visible.sync="customSortDialogVisible" width="600px">
      <div class="custom-sort-content">
        <p>请输入自定义排序函数（JavaScript）：</p>
        <p class="sort-instruction"><small>支持函数体：<code>return a.name.localeCompare(b.name)</code></small><br><small>支持箭头函数：<code>(a, b) =&gt; a.name.localeCompare(b.name)</code></small></p>
        <el-select v-if="sortHistoryOptions.length" v-model="selectedSortHistoryId" clearable filterable placeholder="使用历史排序函数" class="sort-history-select" @change="useSortHistory">
          <el-option v-for="item in sortHistoryOptions" :key="item.id" :label="formatSortHistoryLabel(item)" :value="item.id"></el-option>
        </el-select>
        <el-input v-model="customSortFunction" type="textarea" :rows="8" placeholder="例如：return a.name.localeCompare(b.name)"></el-input>
      </div>
      <span slot="footer"><el-button @click="customSortDialogVisible = false">取消</el-button><el-button type="primary" @click="applyCustomSort">应用排序</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import VirtualList from '@/components/common/VirtualList.vue';
import { Validator, SecurityUtils } from '@/utils/validation';
import { APP_CONSTANTS } from '@/constants';
import { DevTools } from '@/utils/devTools';

const { normalizeSortFunction } = require('@/utils/sortFunction');

/** 书签操作菜单单独组件，避免虚拟列表每行重复编译复杂模板。 */
const BookmarkActions = {
  name: 'BookmarkActions',
  props: { bookmark: { type: Object, required: true } },
  template: `<span class="action-buttons"><el-button size="mini" @click.stop="$emit('command', 'open', bookmark)">打开</el-button><el-dropdown trigger="click" @command="$emit('command', $event, bookmark)"><el-button size="mini" type="text"><i class="el-icon-more"></i></el-button><el-dropdown-menu slot="dropdown"><el-dropdown-item command="edit">编辑</el-dropdown-item><el-dropdown-item command="move">移动</el-dropdown-item><el-dropdown-item command="moveUp">上移</el-dropdown-item><el-dropdown-item command="moveDown">下移</el-dropdown-item><el-dropdown-item command="delete" divided>删除</el-dropdown-item></el-dropdown-menu></el-dropdown></span>`
};

export default {
  name: 'BookmarkList',
  components: { VirtualList, BookmarkActions },
  props: {
    currentFolderId: { type: String, required: true },
    specialMode: { type: String, default: null },
    focusBookmarkId: { type: String, default: null },
    navigationHistory: { type: Array, default: () => [] },
    navigationHistoryIndex: { type: Number, default: 0 }
  },
  data() {
    return {
      selectedBookmarks: [],
      currentPage: 1,
      pageSize: 50,
      loading: false,
      viewportWidth: typeof window === 'undefined' ? 1200 : window.innerWidth,
      virtualListHeight: APP_CONSTANTS.VIRTUAL_LIST.MIN_HEIGHT,
      virtualRowHeight: APP_CONSTANTS.VIRTUAL_LIST.ROW_HEIGHT,
      editDialogVisible: false,
      moveDialogVisible: false,
      customSortDialogVisible: false,
      selectedFolderId: null,
      currentEditingBookmarkId: null,
      selectedSortHistoryId: null,
      customSortFunction: 'return a.name.localeCompare(b.name)',
      editForm: { id: null, name: '', url: '', description: '' },
      defaultProps: { children: 'children', label: 'name' },
      dragState: { isDragging: false, draggedBookmark: null, draggedIndex: -1, targetIndex: -1, dropPosition: null },
      lazyLoading: { observer: null, loadedIcons: new Set(), failedIcons: new Set(), loadingIcons: new Set(), retryCount: new Map(), defaultIcon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiNlZWUiLz48L3N2Zz4=' }
    };
  },
  computed: {
    ...mapState({ folders: state => state.bookmarks.folders, invalidBookmarks: state => state.bookmarks.invalidBookmarks, duplicateBookmarks: state => state.bookmarks.duplicateBookmarks, sortHistory: state => state.bookmarks.sortHistory }),
    ...mapGetters('bookmarks', ['getBookmarksByFolderId', 'getAllBookmarks', 'getAllBookmarksWithPath', 'getFoldersByParentId', 'getFolderPath']),
    bookmarks() {
      if (this.specialMode === 'invalid') return this.invalidBookmarks;
      if (this.specialMode === 'duplicate') return this.duplicateBookmarks;
      return this.currentFolderId === 'root' ? this.getAllBookmarksWithPath : this.getBookmarksByFolderId(this.currentFolderId);
    },
    paginatedBookmarks() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.bookmarks.slice(start, start + this.pageSize);
    },
    useVirtualList() { return this.bookmarks.length > APP_CONSTANTS.VIRTUAL_LIST.THRESHOLD; },
    pageSizes() { return this.currentFolderId === 'root' ? APP_CONSTANTS.PAGINATION.ROOT_PAGE_SIZES : APP_CONSTANTS.PAGINATION.FOLDER_PAGE_SIZES; },
    paginationLayout() { return this.viewportWidth < 680 ? 'prev, pager, next' : this.viewportWidth < 920 ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'; },
    folderPath() {
      if (this.specialMode) return [this.folders.find(folder => folder.id === 'root'), { id: this.specialMode, name: this.specialMode === 'invalid' ? '失效书签' : '重复书签' }].filter(Boolean);
      return this.getFolderPath(this.currentFolderId);
    },
    canGoBack() { return this.navigationHistoryIndex > 0; },
    canGoForward() { return this.navigationHistoryIndex < this.navigationHistory.length - 1; },
    recentHistory() { return this.navigationHistory.slice().reverse().slice(0, 8); },
    sortHistoryOptions() { return (this.sortHistory || []).filter(item => !item.folderId || item.folderId === this.currentFolderId); },
    folderTreeData() {
      const root = this.folders.find(folder => folder.id === 'root');
      return root ? [{ ...root, children: this.folderTreeDataBuild('root', new Set()) }] : [];
    }
  },
  watch: {
    currentFolderId() { this.resetListState(); },
    specialMode() { this.resetListState(); },
    'bookmarks.length'() { this.keepPageInRange(); },
    focusBookmarkId: { immediate: true, handler() { this.$nextTick(this.focusBookmark); } },
    editDialogVisible(visible) {
      if (visible && this.currentEditingBookmarkId) {
        const current = this.getAllBookmarks.find(bookmark => bookmark.id === this.currentEditingBookmarkId);
        if (current) this.editForm = { ...current };
      }
    }
  },
  methods: {
    ...mapActions('bookmarks', ['updateBookmark', 'deleteBookmark', 'deleteBookmarksBulk', 'moveItems', 'sortBookmarksByName', 'sortBookmarksByUrl', 'sortBookmarksByDate', 'sortBookmarksCustom', 'moveBookmarkUp', 'moveBookmarkDown']),
    resetListState() { this.currentPage = 1; this.selectedBookmarks = []; this.pageSize = this.currentFolderId === 'root' ? APP_CONSTANTS.PAGINATION.ROOT_PAGE_SIZES[0] : APP_CONSTANTS.PAGINATION.FOLDER_PAGE_SIZES[1]; this.$nextTick(this.observeFaviconElements); },
    keepPageInRange() { this.currentPage = Math.min(this.currentPage, Math.max(1, Math.ceil(this.bookmarks.length / this.pageSize))); this.$nextTick(this.observeFaviconElements); },
    safeDisplayText(text) { return Validator.isEmpty(text) ? '' : SecurityUtils.stripHtml(String(text)); },
    validateAndSanitizeInput(input, maxLength) { const value = SecurityUtils.sanitizeInput(input || ''); return maxLength ? value.slice(0, maxLength) : value; },
    formatDate(dateString) { if (!this._dateCache) this._dateCache = new Map(); if (this._dateCache.has(dateString)) return this._dateCache.get(dateString); const value = new Date(dateString).toLocaleString(); this._dateCache.set(dateString, value); return value; },
    bookmarkKey(bookmark) { return bookmark.id; },
    getRowClassName({ row }) { return row.id === this.focusBookmarkId ? 'bookmark-row-target' : ''; },
    dragClass(index, bookmark) { return { dragging: this.dragState.isDragging && this.dragState.draggedBookmark && bookmark.id === this.dragState.draggedBookmark.id, 'drop-target': this.dragState.targetIndex === index }; },
    getInitialFaviconSrc(url) { return this.lazyLoading.loadedIcons.has(url) ? this.getFavicon(url) : this.lazyLoading.defaultIcon; },
    getFavicon(url) { if (!Validator.isValidUrl(url)) return ''; if (!this._faviconCache) this._faviconCache = new Map(); if (!this._faviconCache.has(url)) { const parsed = new URL(url); this._faviconCache.set(url, `${parsed.protocol}//${parsed.hostname}/favicon.ico`); } return this._faviconCache.get(url); },
    handleFaviconError(event) { const url = event.target.dataset.url; if (url) { this.lazyLoading.failedIcons.add(url); event.target.src = this.lazyLoading.defaultIcon; } },
    handleFaviconLoad(event) { const url = event.target.dataset.url; if (url && event.target.src.indexOf('data:image') !== 0) { this.lazyLoading.loadedIcons.add(url); this.lazyLoading.loadingIcons.delete(url); } },
    setupLazyLoading() {
      if (!('IntersectionObserver' in window)) return this.loadAllFavicons();
      this.lazyLoading.observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { const image = entry.target; const url = image.dataset.url; if (url && !this.lazyLoading.loadedIcons.has(url) && !this.lazyLoading.failedIcons.has(url)) { image.src = this.getFavicon(url) || this.lazyLoading.defaultIcon; } this.lazyLoading.observer.unobserve(image); } }), { root: null, rootMargin: '120px 0px', threshold: 0.01 });
      this.$nextTick(this.observeFaviconElements);
    },
    observeFaviconElements() { if (!this.lazyLoading.observer || !this.$el) return; this.$el.querySelectorAll('.favicon[data-url]').forEach(image => { if (!this.lazyLoading.loadedIcons.has(image.dataset.url) && !this.lazyLoading.failedIcons.has(image.dataset.url)) this.lazyLoading.observer.observe(image); }); },
    loadAllFavicons() { this.$nextTick(() => this.$el.querySelectorAll('.favicon[data-url]').forEach(image => { image.src = this.getFavicon(image.dataset.url) || this.lazyLoading.defaultIcon; })); },
    handleSelectionChange(items) { this.selectedBookmarks = items; },
    isSelected(bookmark) { return this.selectedBookmarks.some(item => item.id === bookmark.id); },
    toggleBookmarkSelection(bookmark, checked) { this.selectedBookmarks = checked ? this.selectedBookmarks.concat(bookmark) : this.selectedBookmarks.filter(item => item.id !== bookmark.id); },
    handleSizeChange(size) { this.pageSize = size; this.currentPage = 1; },
    handleCurrentChange(page) { this.currentPage = page; this.$nextTick(this.observeFaviconElements); },
    focusBookmark() {
      if (!this.focusBookmarkId) return;
      const index = this.bookmarks.findIndex(bookmark => bookmark.id === this.focusBookmarkId);
      if (index < 0) return;
      this.currentPage = Math.floor(index / this.pageSize) + 1;
      this.$nextTick(() => {
        const pageIndex = index % this.pageSize;
        if (this.useVirtualList && this.$refs.virtualList) this.$refs.virtualList.scrollToItem(pageIndex);
        else { const target = this.$el.querySelector('.bookmark-row-target'); if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' }); }
        this.observeFaviconElements();
      });
    },
    navigateToFolder(folderId) { this.$emit('folder-selected', folderId); },
    goBack() { if (this.canGoBack) this.$emit('navigate-history', this.navigationHistoryIndex - 1); },
    goForward() { if (this.canGoForward) this.$emit('navigate-history', this.navigationHistoryIndex + 1); },
    indexOfHistoryEntry(entry) { return this.navigationHistory.findIndex(item => item.id === entry.id && item.label === entry.label); },
    navigateFromHistory(index) { if (typeof index === 'number' && index >= 0) this.$emit('navigate-history', index); },
    getBookmarkPath(bookmark) { if (bookmark.pathString && this.currentFolderId === 'root') return this.safeDisplayText(bookmark.pathString); const path = this.getFolderPath(bookmark.folderId); return path.length ? path.map(folder => this.safeDisplayText(folder.name)).join(' / ') : '根目录'; },
    copyText(text, success = '路径已复制到剪贴板') { if (!text) return this.$message.warning('路径为空'); const done = () => this.$message.success(success); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => this.$message.error('复制失败')); else { const input = document.createElement('textarea'); input.value = text; document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input); done(); } },
    copyCurrentPath() { this.copyText(this.folderPath.map(folder => this.safeDisplayText(folder.name)).join('/')); },
    copyItemPath(bookmark) { this.copyText(this.getBookmarkPath(bookmark)); },
    openBookmark(bookmark) { const url = SecurityUtils.sanitizeUrl(bookmark && bookmark.url); if (!url) return this.$message.error('书签 URL 无效或不安全'); window.open(url, '_blank', 'noopener,noreferrer'); },
    handleCommand(command, bookmark) {
      if (command === 'open') return this.openBookmark(bookmark);
      if (command === 'edit') { this.currentEditingBookmarkId = bookmark.id; this.editForm = { ...bookmark }; this.editDialogVisible = true; }
      else if (command === 'move') { this.editForm = { ...bookmark }; this.selectedFolderId = null; this.moveDialogVisible = true; }
      else if (command === 'moveUp') this.moveBookmarkUp(bookmark.id);
      else if (command === 'moveDown') this.moveBookmarkDown(bookmark.id);
      else if (command === 'delete') this.$confirm('此操作将永久删除该书签，是否继续？', '提示', { type: 'warning' }).then(() => this.deleteBookmark(bookmark.id)).catch(() => {});
    },
    saveBookmark() { const data = { name: this.validateAndSanitizeInput(this.editForm.name, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME), url: SecurityUtils.sanitizeUrl(this.editForm.url), description: this.validateAndSanitizeInput(this.editForm.description, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_DESCRIPTION) }; if (!data.name || !Validator.isValidUrl(data.url)) return this.$message.error('请输入有效的名称和 URL'); this.updateBookmark({ id: this.editForm.id, updates: data }).then(() => { this.editDialogVisible = false; this.$message.success('更新成功'); }).catch(error => this.$message.error(error.message || '更新失败')); },
    handleEditCancel() { this.editDialogVisible = false; this.currentEditingBookmarkId = null; },
    handleFolderSelect(folder) { this.selectedFolderId = folder.id; },
    moveBookmark() { if (!this.selectedFolderId) return; const ids = Array.isArray(this.editForm.id) ? this.editForm.id : [this.editForm.id]; this.moveItems({ itemIds: ids, targetFolderId: this.selectedFolderId, itemType: 'bookmark' }).then(() => { this.moveDialogVisible = false; this.selectedBookmarks = []; this.$message.success('移动成功'); }); },
    moveBulk() { if (!this.selectedBookmarks.length) return; this.editForm = { id: this.selectedBookmarks.map(bookmark => bookmark.id) }; this.selectedFolderId = null; this.moveDialogVisible = true; },
    deleteBulk() { if (!this.selectedBookmarks.length) return; this.$confirm(`此操作将永久删除选中的 ${this.selectedBookmarks.length} 个书签，是否继续？`, '提示', { type: 'warning' }).then(() => this.deleteBookmarksBulk(this.selectedBookmarks.map(bookmark => bookmark.id))).catch(() => {}); },
    handleSortCommand(command) { if (this.currentFolderId === 'root') return; if (command === 'name') this.sortBookmarksByName(this.currentFolderId); else if (command === 'url') this.sortBookmarksByUrl(this.currentFolderId); else if (command === 'date') this.sortBookmarksByDate(this.currentFolderId); else if (command === 'custom') { this.selectedSortHistoryId = null; this.customSortDialogVisible = true; } },
    formatSortHistoryLabel(item) { return `${new Date(item.createdAt).toLocaleString()} · ${item.sortFunctionString.slice(0, 50)}`; },
    useSortHistory(id) { const item = this.sortHistoryOptions.find(history => history.id === id); if (item) this.customSortFunction = item.sortFunctionString; },
    applyCustomSort() { if (this.currentFolderId === 'root') return this.$message.warning('根目录不能排序'); try { const code = normalizeSortFunction(this.customSortFunction); this.sortBookmarksCustom({ folderId: this.currentFolderId, sortFunctionString: code }).then(() => { this.customSortDialogVisible = false; this.$message.success('排序成功，函数已保存到历史'); }).catch(error => this.$message.error(error.message || '排序失败')); } catch (error) { this.$message.error(error.message); } },
    folderTreeDataBuild(parentId, visited) { if (visited.has(parentId)) return []; visited.add(parentId); return this.getFoldersByParentId(parentId).map(folder => ({ ...folder, children: this.folderTreeDataBuild(folder.id, new Set(visited)) })); },
    handleContextMenu(event) { event.preventDefault(); },
    handleDragStart(event, bookmark, index) { if (this.currentFolderId === 'root' || this.specialMode) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/json', JSON.stringify({ type: 'bookmark', id: bookmark.id, name: bookmark.name })); this.dragState = { isDragging: true, draggedBookmark: bookmark, draggedIndex: index, targetIndex: index, dropPosition: null }; },
    handleDragOver(event, index) { if (!this.dragState.isDragging) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const target = event.clientY < rect.top + rect.height / 2 ? index : index + 1; this.dragState.targetIndex = this.dragState.draggedIndex < target ? target - 1 : target; },
    handleDragEnter(event) { if (this.dragState.isDragging) event.preventDefault(); },
    handleDragLeave() {},
    handleDrop(event) { if (!this.dragState.isDragging) return; event.preventDefault(); const target = this.dragState.targetIndex; const source = this.dragState.draggedIndex; if (target !== source) this.$store.dispatch('bookmarks/reorderBookmarks', { folderId: this.currentFolderId, bookmarkId: this.dragState.draggedBookmark.id, targetIndex: target, operationType: 'drag' }); this.cleanupDrag(); },
    cleanupDrag() { this.dragState = { isDragging: false, draggedBookmark: null, draggedIndex: -1, targetIndex: -1, dropPosition: null }; },
    updateViewport() { this.viewportWidth = window.innerWidth; this.virtualListHeight = Math.max(APP_CONSTANTS.VIRTUAL_LIST.MIN_HEIGHT, Math.min(APP_CONSTANTS.VIRTUAL_LIST.MAX_HEIGHT, window.innerHeight - APP_CONSTANTS.VIRTUAL_LIST.VIEWPORT_OFFSET)); }
  },
  mounted() { this.updateViewport(); window.addEventListener('resize', this.updateViewport); this.setupLazyLoading(); },
  updated() { this.$nextTick(this.observeFaviconElements); },
  beforeDestroy() { window.removeEventListener('resize', this.updateViewport); if (this.lazyLoading.observer) this.lazyLoading.observer.disconnect(); if (this._dateCache) this._dateCache.clear(); if (this._faviconCache) this._faviconCache.clear(); this.cleanupDrag(); }
};
</script>

<style scoped>
.bookmark-list { height: 100%; min-width: 0; display: flex; flex-direction: column; padding: 15px; box-sizing: border-box; }
.list-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; min-width: 0; }
.path-navigation { min-width: 0; display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
.path-navigation .el-breadcrumb { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.history-buttons, .recent-paths { flex-shrink: 0; }
.copy-path-icon, .copy-item-path { cursor: pointer; color: #909399; flex-shrink: 0; }
.list-actions { display: flex; gap: 8px; flex-shrink: 0; }
.bookmark-table-wrapper { flex: 1; min-height: 0; overflow: hidden; }
.bookmark-name, .bookmark-path { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 4px 8px; border-radius: 4px; }
.bookmark-name { cursor: grab; position: relative; }
.bookmark-name:hover { background: #f5f7fa; }
.bookmark-name.dragging { opacity: .5; }
.bookmark-name.drop-target { background: #f0f9eb; }
.text-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.favicon { width: 16px; height: 16px; flex: 0 0 16px; border-radius: 2px; background: #f5f5f5; }
.drag-handle { margin-left: auto; color: #999; }
.action-buttons { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.virtual-bookmark-list { width: 100%; }
.virtual-bookmark-row { height: 62px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid #ebeef5; box-sizing: border-box; }
.virtual-bookmark-row:hover, .virtual-bookmark-row.bookmark-row-target { background: #f0f9ff; }
.virtual-selection { flex: 0 0 22px; }
.virtual-bookmark-main { display: flex; flex-direction: column; min-width: 180px; flex: 1; gap: 4px; }
.bookmark-title { color: #303133; }
.bookmark-url { color: #909399; font-size: 12px; }
.virtual-bookmark-path { width: 200px; color: #909399; font-size: 12px; }
.virtual-bookmark-date { width: 145px; color: #909399; font-size: 12px; }
.pagination-container { flex: 0 0 auto; min-width: 0; display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 8px; padding-top: 12px; background: #fff; }
.pagination-container .el-pagination { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 100%; }
.custom-sort-content { max-height: 55vh; overflow-y: auto; }
.sort-instruction { padding: 10px; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; }
.sort-history-select { width: 100%; margin-bottom: 10px; }
.empty-content { padding: 60px 0; text-align: center; color: #909399; }
.empty-content i { display: block; font-size: 42px; margin-bottom: 12px; }
@media (max-width: 900px) { .virtual-bookmark-path, .virtual-bookmark-date { display: none; } .list-header { align-items: flex-start; flex-direction: column; } .list-actions { width: 100%; justify-content: flex-end; } }
@media (max-width: 680px) { .bookmark-list { padding: 10px; } .pagination-container { justify-content: center; } .pagination-container .el-pagination { justify-content: center; } }
</style>
