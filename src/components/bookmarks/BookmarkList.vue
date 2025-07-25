<template>
  <div class="bookmark-list">
    <div class="list-header">
      <div class="path-navigation">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item 
            v-for="folder in folderPath" 
            :key="folder.id"
            @click.native="navigateToFolder(folder.id)"
          >
            {{ safeDisplayText(folder.name) }}
          </el-breadcrumb-item>
        </el-breadcrumb>
        <el-tooltip content="复制当前路径" placement="top">
          <i 
            class="el-icon-copy-document copy-path-icon" 
            @click="copyCurrentPath"
          ></i>
        </el-tooltip>
        <div v-if="currentFolderId === 'root'" class="root-tip">
          <el-tag size="mini" type="info">显示所有书签</el-tag>
        </div>
      </div>
      <div class="list-actions">
        <el-button-group v-if="selectedBookmarks.length > 0">
          <el-button size="small" type="primary" @click="moveBulk">移动</el-button>
          <el-button size="small" type="danger" @click="deleteBulk">删除</el-button>
        </el-button-group>
        <el-dropdown @command="handleSortCommand" v-if="bookmarks.length > 0 && currentFolderId !== 'root'">
          <el-button size="small">
            排序<i class="el-icon-arrow-down el-icon--right"></i>
          </el-button>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item command="name">按名称排序</el-dropdown-item>
            <el-dropdown-item command="url">按URL排序</el-dropdown-item>
            <el-dropdown-item command="date">按添加日期排序</el-dropdown-item>
            <el-dropdown-item command="custom">自定义排序</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
        <el-tooltip v-if="currentFolderId === 'root'" content="根目录显示所有书签，无法排序。请进入具体文件夹进行排序。" placement="top">
          <el-button size="small" disabled>
            排序<i class="el-icon-arrow-down el-icon--right"></i>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="bookmark-table-wrapper">
      <el-table
        :data="paginatedBookmarks"
        style="width: 100%"
        @selection-change="handleSelectionChange"
        row-key="id"
        v-loading="loading"
        @row-contextmenu="handleContextMenu"
        @row-click="handleRowClick"
        height="100%"
        :max-height="currentFolderId === 'root' ? 600 : 500"
        lazy
        ref="bookmarkTable"
        :class="{ 'dragging-active': dragState.isDragging }"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <!-- todo: 点击列名进行对应的排序 -->
        <el-table-column label="名称" min-width="180">
          <template slot-scope="scope">
            <div 
              class="bookmark-name"
              :class="{ 
                'dragging': dragState.isDragging && scope.row.id === dragState.draggedBookmark?.id,
                'drop-target': dragState.isDragging && scope.$index === dragState.dropTargetIndex,
                'drag-above': dragState.isDragging && scope.$index === dragState.dropTargetIndex && dragState.dropPosition === 'above',
                'drag-below': dragState.isDragging && scope.$index === dragState.dropTargetIndex && dragState.dropPosition === 'below'
              }"
              draggable="true"
              @dragstart="handleDragStart($event, scope.row, scope.$index)"
              @dragover="handleDragOver($event, scope.$index)"
              @dragenter="handleDragEnter($event, scope.$index)"
              @dragleave="handleDragLeave($event)"
              @drop="handleDrop($event, scope.$index)"
              @dragend="handleDragEnd($event)"
            >
              <img 
                ref="favicon"
                :data-url="scope.row.url"
                :data-bookmark-id="scope.row.id"
                class="favicon" 
                alt=""
                :src="getInitialFaviconSrc(scope.row.url)"
                @error="handleFaviconError"
                @load="handleFaviconLoad"
              />
              <span>{{ scope.row.name }}</span>
              <i 
                v-if="!specialMode && currentFolderId !== 'root'" 
                class="el-icon-sort drag-handle" 
                title="拖拽排序"
              ></i>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" min-width="250"></el-table-column>
        <el-table-column label="所在路径" min-width="200">
          <template slot-scope="scope">
            <div class="bookmark-path">
              <span>{{ getBookmarkPath(scope.row) }}</span>
              <i 
                class="el-icon-copy-document copy-item-path" 
                @click="copyItemPath(scope.row)"
                title="复制路径"
              ></i>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="添加日期" width="180">
          <template slot-scope="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template slot-scope="scope">
            <el-button
              size="mini"
              @click="openBookmark(scope.row)"
            >
              打开
            </el-button>
            <el-dropdown trigger="click" @command="(command) => handleCommand(command, scope.row)">
              <el-button size="mini" type="text">
                <i class="el-icon-more"></i>
              </el-button>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item command="move">移动</el-dropdown-item>
                <el-dropdown-item command="moveUp">上移</el-dropdown-item>
                <el-dropdown-item command="moveDown">下移</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-container">
      <el-pagination
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        :current-page="currentPage"
        :page-sizes="currentFolderId === 'root' ? [50, 100, 200, 500] : [10, 20, 50, 100]"
        :page-size="pageSize"
        layout="total, sizes, prev, pager, next, jumper"
        :total="bookmarks.length"
      >
      </el-pagination>
    </div>

    <!-- 编辑书签对话框 -->
    <el-dialog
      title="编辑书签"
      :visible.sync="editDialogVisible"
      width="500px"
      @close="handleEditCancel"
    >
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name"></el-input>
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="editForm.url"></el-input>
        </el-form-item>
        <el-form-item label="描述">
          <el-input type="textarea" v-model="editForm.description"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleEditCancel">取消</el-button>
        <el-button type="primary" @click="saveBookmark">确定</el-button>
      </span>
    </el-dialog>

    <!-- 移动书签对话框 -->
    <el-dialog
      title="移动到文件夹"
      :visible.sync="moveDialogVisible"
      width="400px"
    >
      <el-tree
        :data="folderTreeData"
        :props="defaultProps"
        node-key="id"
        :default-expanded-keys="['root']"
        :highlight-current="true"
        @node-click="handleFolderSelect"
      >
        <span class="custom-tree-node" slot-scope="{ node, data }">
          <i :class="['folder-icon', data.isExpanded ? 'el-icon-folder-opened' : 'el-icon-folder']"></i>
          {{ node.label }}
        </span>
      </el-tree>
      <span slot="footer" class="dialog-footer">
        <el-button @click="moveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="moveBookmark" :disabled="!selectedFolderId">确定</el-button>
      </span>
    </el-dialog>

    <!-- 自定义排序对话框 -->
    <el-dialog
      title="自定义排序"
      :visible.sync="customSortDialogVisible"
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
          v-model="customSortFunction"
          placeholder="例如：return a.name.localeCompare(b.name)"
        ></el-input>
        <div class="example-section">
          <p>示例：</p>
          <!-- todo: 排序及其历史记录无效 -->
          <pre>// 按名称的字符长度排序
return a.name.length - b.name.length;

// 按名称的拼音首字母排序
return a.name.localeCompare(b.name, 'zh-CN');

// 按创建时间排序
return new Date(a.createdAt) - new Date(b.createdAt);

// 综合多个条件排序
if (a.url && b.url) {
  const domainA = new URL(a.url).hostname;
  const domainB = new URL(b.url).hostname;
  const domainCompare = domainA.localeCompare(domainB);
  
  if (domainCompare === 0) {
    return a.name.localeCompare(b.name);
  }
  
  return domainCompare;
} else {
  return a.name.localeCompare(b.name);
}</pre>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="customSortDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyCustomSort">应用排序</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import { DevTools } from '@/utils/devTools';
import { Validator, SecurityUtils, ErrorHandler } from '@/utils/validation';
import { APP_CONSTANTS } from '@/constants';

export default {
  name: 'BookmarkList',
  props: {
    currentFolderId: {
      type: String,
      required: true
    },
    specialMode: {
      type: String,
      default: null // 可以是 'invalid' 或 'duplicate'
    }
  },
  data() {
    return {
      selectedBookmarks: [],
      currentPage: 1,
      pageSize: 50, // 增加默认分页大小以便显示更多书签
      loading: false,
      editDialogVisible: false,
      moveDialogVisible: false,
      customSortDialogVisible: false,
      editForm: {
        id: null,
        name: '',
        url: '',
        description: ''
      },
      currentEditingBookmarkId: null,
      selectedFolderId: null,
      customSortFunction: 'return a.name.localeCompare(b.name)',
      defaultProps: {
        children: 'children',
        label: 'name'
      },
      // 拖拽相关状态
      dragState: {
        isDragging: false,
        draggedBookmark: null,
        draggedIndex: -1,
        dropTargetIndex: -1,
        originalIndex: -1,
        targetIndex: -1,
        dropPosition: null,
        dragPreviewElement: null,
        dragStartPosition: { x: 0, y: 0 },
        isInternalDrag: false, // 是否为内部排序拖拽
        cancelKeys: ['Escape', 'Enter', ' ']
      },
      dragListeners: {
        keydown: null,
        click: null,
        mousemove: null,
        dragend: null
      },
      // 懒加载相关状态
      lazyLoading: {
        observer: null,
        loadedIcons: new Set(),
        failedIcons: new Set(),
        retryCount: new Map(),
        loadingIcons: new Set(),
        maxRetries: 2,
        retryDelay: 1000,
        defaultIcon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjIiIGZpbGw9IiM5OTkiLz4KPHN2Zz4='
      }
    };
  },
  computed: {
    ...mapState({
      folders: state => state.bookmarks.folders,
      invalidBookmarks: state => state.bookmarks.invalidBookmarks,
      duplicateBookmarks: state => state.bookmarks.duplicateBookmarks
    }),
    ...mapGetters('bookmarks', [
      'getBookmarksByFolderId',
      'getAllBookmarks',
      'getAllBookmarksWithPath',
      'getFoldersByParentId',
      'getFolderPath'
    ]),
    bookmarks() {
      if (this.specialMode === 'invalid') {
        return this.invalidBookmarks;
      } else if (this.specialMode === 'duplicate') {
        return this.duplicateBookmarks;
      } else if (this.currentFolderId === 'root') {
        // 当在根目录时，使用优化的方法获取所有书签并带有路径信息
        return this.getAllBookmarksWithPath;
      } else {
        return this.getBookmarksByFolderId(this.currentFolderId);
      }
    },
    paginatedBookmarks() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.bookmarks.slice(start, end);
    },
    folderPath() {
      if (this.specialMode) {
        const rootFolder = this.folders.find(f => f.id === 'root');
        const specialFolder = {
          id: this.specialMode,
          name: this.specialMode === 'invalid' ? '失效书签' : '重复书签'
        };
        return [rootFolder, specialFolder];
      }
      return this.getFolderPath(this.currentFolderId);
    },
    folderTreeData() {
      // 构建文件夹树结构 (与 Sidebar 组件相同)
      const buildTree = (parentId) => {
        const children = this.getFoldersByParentId(parentId);
        return children.map(folder => {
          const childFolders = buildTree(folder.id);
          return {
            ...folder,
            children: childFolders.length ? childFolders : []
          };
        });
      };
      
      const rootFolder = this.folders.find(f => f.id === 'root');
      if (!rootFolder) return [];
      
      return [{
        ...rootFolder,
        children: buildTree('root')
      }];
    }
  },
  watch: {
    currentFolderId(newId, oldId) {
      this.currentPage = 1;
      this.selectedBookmarks = [];
      
      // 根目录下使用更大的分页大小以显示更多书签
      if (newId === 'root' && oldId !== 'root') {
        this.pageSize = 100;
      } else if (newId !== 'root' && oldId === 'root') {
        this.pageSize = 20;
      }
      
      // 重新初始化懒加载
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    specialMode() {
      this.currentPage = 1;
      this.selectedBookmarks = [];
      
      // 重新初始化懒加载
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    currentPage() {
      // 分页变化时重新观察新的favicon元素
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    pageSize() {
      // 分页大小变化时重新观察favicon元素
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    'bookmarks.length'() {
      // 当书签数量变化时，确保当前页不会超出范围
      const maxPage = Math.ceil(this.bookmarks.length / this.pageSize) || 1;
      if (this.currentPage > maxPage) {
        this.currentPage = maxPage;
      }
      
      // 重新观察favicon元素
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    editDialogVisible(visible) {
      if (visible && this.currentEditingBookmarkId) {
        // 对话框打开时，重新获取最新的书签数据
        const latestBookmark = this.getAllBookmarks.find(b => b.id === this.currentEditingBookmarkId);
        if (latestBookmark) {
          this.editForm = { ...latestBookmark };
        }
      } else if (!visible) {
        // 对话框关闭时清理状态
        this.currentEditingBookmarkId = null;
      }
    }
  },
  methods: {
    ...mapActions('bookmarks', [
      'updateBookmark',
      'deleteBookmark',
      'deleteBookmarksBulk',
      'moveItems',
      'sortBookmarksByName',
      'sortBookmarksByUrl',
      'sortBookmarksByDate',
      'sortBookmarksCustom',
      'checkInvalidBookmarks',
      'checkDuplicateBookmarks',
      'moveBookmarkUp',
      'moveBookmarkDown'
    ]),
    
    // 安全显示文本，防止XSS
    safeDisplayText(text) {
      if (Validator.isEmpty(text)) return '';
      return SecurityUtils.stripHtml(String(text));
    },
    
    // 验证并清理用户输入
    validateAndSanitizeInput(input, maxLength = null) {
      if (Validator.isEmpty(input)) return '';
      
      let sanitized = SecurityUtils.sanitizeInput(input);
      
      if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }
      
      return sanitized;
    },
    handleSelectionChange(val) {
      this.selectedBookmarks = val;
    },
    handleSizeChange(val) {
      this.pageSize = val;
      this.currentPage = 1;
    },
    handleCurrentChange(val) {
      this.currentPage = val;
    },
    formatDate(dateString) {
      // 使用缓存避免重复计算
      if (!this._dateCache) {
        this._dateCache = new Map();
      }
      
      if (this._dateCache.has(dateString)) {
        return this._dateCache.get(dateString);
      }
      
      const date = new Date(dateString);
      const formatted = date.toLocaleString();
      this._dateCache.set(dateString, formatted);
      return formatted;
    },
    // 获取初始favicon源（懒加载前的占位符）
    getInitialFaviconSrc(url) {
      // 如果已经加载过，直接返回缓存的结果
      if (this.lazyLoading.loadedIcons.has(url)) {
        return this.getFavicon(url);
      }
      
      // 如果加载失败过，返回默认图标
      if (this.lazyLoading.failedIcons.has(url)) {
        return this.lazyLoading.defaultIcon;
      }
      
      // 否则返回默认图标，等待懒加载
      return this.lazyLoading.defaultIcon;
    },
    
    getFavicon(url) {
      // 使用缓存避免重复计算
      if (!this._faviconCache) {
        this._faviconCache = new Map();
      }
      
      if (this._faviconCache.has(url)) {
        return this._faviconCache.get(url);
      }
      
      // 验证URL有效性
      if (!Validator.isValidUrl(url)) {
        this._faviconCache.set(url, '');
        return '';
      }
      
      try {
        const urlObj = new URL(url);
        const favicon = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
        this._faviconCache.set(url, favicon);
        return favicon;
      } catch (e) {
        DevTools.warn('生成favicon URL失败:', e);
        this._faviconCache.set(url, '');
        return '';
      }
    },
    handleFaviconError(e) {
      const url = e.target.dataset.url;
      const bookmarkId = e.target.dataset.bookmarkId;
      
      if (url) {
        // 标记为加载失败
        this.lazyLoading.failedIcons.add(url);
        this.lazyLoading.loadingIcons.delete(url);
        
        // 检查重试次数
        const retryCount = this.lazyLoading.retryCount.get(url) || 0;
        
        if (retryCount < this.lazyLoading.maxRetries) {
          // 延迟重试
          setTimeout(() => {
            this.retryFaviconLoad(e.target, url);
          }, this.lazyLoading.retryDelay * (retryCount + 1));
          
          this.lazyLoading.retryCount.set(url, retryCount + 1);
          DevTools.log(`Favicon加载失败，将在 ${this.lazyLoading.retryDelay * (retryCount + 1)}ms 后重试 (${retryCount + 1}/${this.lazyLoading.maxRetries})`, url);
        } else {
          // 超过重试次数，设置为默认图标
          e.target.src = this.lazyLoading.defaultIcon;
          e.target.style.display = '';
          DevTools.warn('Favicon加载失败，已达最大重试次数:', url);
        }
      } else {
        // 如果没有URL信息，直接隐藏
        e.target.style.display = 'none';
      }
    },
    
    handleFaviconLoad(e) {
      const url = e.target.dataset.url;
      if (url) {
        // 标记为成功加载
        this.lazyLoading.loadedIcons.add(url);
        this.lazyLoading.loadingIcons.delete(url);
        this.lazyLoading.failedIcons.delete(url);
        this.lazyLoading.retryCount.delete(url);
        
        // 更新缓存
        this._faviconCache.set(url, e.target.src);
        
        DevTools.log('Favicon加载成功:', url);
      }
    },
    
    retryFaviconLoad(imgElement, url) {
      if (!imgElement || !url) return;
      
      // 移除失败标记，准备重试
      this.lazyLoading.failedIcons.delete(url);
      this.lazyLoading.loadingIcons.add(url);
      
      // 重新设置src触发加载
      const faviconUrl = this.getFavicon(url);
      if (faviconUrl && faviconUrl !== this.lazyLoading.defaultIcon) {
        imgElement.src = faviconUrl;
      }
    },
    
    // 设置懒加载观察器
    setupLazyLoading() {
      if (!('IntersectionObserver' in window)) {
        // 不支持Intersection Observer，降级到立即加载
        DevTools.warn('浏览器不支持Intersection Observer，将立即加载所有图标');
        this.loadAllFavicons();
        return;
      }
      
      // 创建观察器
      this.lazyLoading.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const url = img.dataset.url;
            
            if (url && !this.lazyLoading.loadingIcons.has(url) && !this.lazyLoading.loadedIcons.has(url)) {
              this.loadFaviconLazy(img, url);
            }
            
            // 停止观察已处理的元素
            this.lazyLoading.observer.unobserve(img);
          }
        });
      }, {
        root: null,
        rootMargin: '50px 0px', // 提前50px开始加载
        threshold: 0.1
      });
      
      // 观察所有favicon元素
      this.$nextTick(() => {
        this.observeFaviconElements();
      });
    },
    
    // 观察favicon元素
    observeFaviconElements() {
      if (!this.lazyLoading.observer) return;
      
      const faviconElements = this.$el.querySelectorAll('.favicon[data-url]');
      faviconElements.forEach(img => {
        const url = img.dataset.url;
        
        // 只观察未加载且未失败的图标
        if (url && !this.lazyLoading.loadedIcons.has(url) && !this.lazyLoading.failedIcons.has(url)) {
          this.lazyLoading.observer.observe(img);
        }
      });
    },
    
    // 懒加载单个favicon
    loadFaviconLazy(imgElement, url) {
      if (!imgElement || !url) return;
      
      // 防止重复加载
      if (this.lazyLoading.loadingIcons.has(url) || this.lazyLoading.loadedIcons.has(url)) {
        return;
      }
      
      this.lazyLoading.loadingIcons.add(url);
      
      // 获取favicon URL
      const faviconUrl = this.getFavicon(url);
      
      if (faviconUrl && faviconUrl !== this.lazyLoading.defaultIcon) {
        // 预加载图片
        const preloader = new Image();
        
        preloader.onload = () => {
          // 预加载成功，更新实际图片
          imgElement.src = faviconUrl;
          this.lazyLoading.loadedIcons.add(url);
          this.lazyLoading.loadingIcons.delete(url);
          this.lazyLoading.failedIcons.delete(url);
          
          // 更新缓存
          this._faviconCache.set(url, faviconUrl);
          
          DevTools.log('懒加载favicon成功:', url);
        };
        
        preloader.onerror = () => {
          // 预加载失败
          this.lazyLoading.loadingIcons.delete(url);
          this.lazyLoading.failedIcons.add(url);
          
          const retryCount = this.lazyLoading.retryCount.get(url) || 0;
          
          if (retryCount < this.lazyLoading.maxRetries) {
            // 延迟重试
            setTimeout(() => {
              this.retryFaviconLoad(imgElement, url);
            }, this.lazyLoading.retryDelay * (retryCount + 1));
            
            this.lazyLoading.retryCount.set(url, retryCount + 1);
            DevTools.log(`懒加载favicon失败，将重试 (${retryCount + 1}/${this.lazyLoading.maxRetries})`, url);
          } else {
            // 超过重试次数，保持默认图标
            DevTools.warn('懒加载favicon失败，已达最大重试次数:', url);
          }
        };
        
        // 开始预加载
        preloader.src = faviconUrl;
      }
    },
    
    // 立即加载所有favicon（降级方案）
    loadAllFavicons() {
      this.$nextTick(() => {
        const faviconElements = this.$el.querySelectorAll('.favicon[data-url]');
        faviconElements.forEach(img => {
          const url = img.dataset.url;
          if (url) {
            this.loadFaviconLazy(img, url);
          }
        });
      });
    },
    
    // 清理懒加载相关资源
    cleanupLazyLoading() {
      if (this.lazyLoading.observer) {
        this.lazyLoading.observer.disconnect();
        this.lazyLoading.observer = null;
      }
      
      // 清理状态
      this.lazyLoading.loadedIcons.clear();
      this.lazyLoading.failedIcons.clear();
      this.lazyLoading.retryCount.clear();
      this.lazyLoading.loadingIcons.clear();
    },
    openBookmark(bookmark) {
      // 验证书签对象
      if (!bookmark || !bookmark.url) {
        this.$message.error('书签信息无效');
        return;
      }
      
      // 验证URL安全性
      const sanitizedUrl = SecurityUtils.sanitizeUrl(bookmark.url);
      if (!sanitizedUrl) {
        this.$message.error('书签URL无效或不安全');
        return;
      }
      
      try {
        window.open(sanitizedUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        DevTools.error('打开书签失败:', error);
        this.$message.error('无法打开书签');
      }
    },
    handleCommand(command, bookmark) {
      switch (command) {
        case 'edit':
          this.currentEditingBookmarkId = bookmark.id;
          this.editForm = { ...bookmark };
          this.editDialogVisible = true;
          break;
        case 'move':
          this.editForm = { ...bookmark };
          this.moveDialogVisible = true;
          break;
        case 'moveUp':
          this.moveBookmarkUp(bookmark.id);
          break;
        case 'moveDown':
          this.moveBookmarkDown(bookmark.id);
          break;
        case 'delete':
          this.$confirm('此操作将永久删除该书签, 是否继续?', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }).then(() => {
            this.deleteBookmark(bookmark.id);
            this.$message({
              type: 'success',
              message: '删除成功!'
            });
          }).catch(() => {});
          break;
      }
    },
    saveBookmark() {
      // 验证和清理输入数据
      const sanitizedData = {
        name: this.validateAndSanitizeInput(this.editForm.name, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME),
        url: SecurityUtils.sanitizeUrl(this.editForm.url),
        description: this.validateAndSanitizeInput(this.editForm.description, 500)
      };
      
      // 验证必填字段
      if (Validator.isBlankString(sanitizedData.name)) {
        this.$message.error('书签名称不能为空');
        return;
      }
      
      if (!Validator.isValidUrl(sanitizedData.url)) {
        this.$message.error('请输入有效的URL地址');
        return;
      }
      
      // 执行更新
      ErrorHandler.safeExecuteAsync(
        async () => {
          await this.updateBookmark({
            id: this.editForm.id,
            updates: sanitizedData
          });
          
          this.editDialogVisible = false;
          this.$message({
            type: 'success',
            message: '更新成功!'
          });
        },
        null,
        (error) => {
          DevTools.error('保存书签失败:', error);
          this.$message.error(`保存失败: ${ErrorHandler.formatError(error)}`);
        }
      );
    },
    handleEditCancel() {
      this.editDialogVisible = false;
    },
    handleFolderSelect(data) {
      this.selectedFolderId = data.id;
    },
    moveBookmark() {
      if (!this.selectedFolderId) return;
      
      this.moveItems({
        itemIds: [this.editForm.id],
        targetFolderId: this.selectedFolderId,
        itemType: 'bookmark'
      });
      
      this.moveDialogVisible = false;
      this.$message({
        type: 'success',
        message: '移动成功!'
      });
    },
    moveBulk() {
      if (this.selectedBookmarks.length === 0) return;
      
      this.moveDialogVisible = true;
      // 设置为批量模式
      this.editForm = { id: this.selectedBookmarks.map(b => b.id) };
    },
    deleteBulk() {
      if (this.selectedBookmarks.length === 0) return;
      
      this.$confirm(`此操作将永久删除选中的 ${this.selectedBookmarks.length} 个书签, 是否继续?`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.deleteBookmarksBulk(this.selectedBookmarks.map(b => b.id));
        this.$message({
          type: 'success',
          message: '批量删除成功!'
        });
      }).catch(() => {});
    },
    handleSortCommand(command) {
      // 检查是否在根目录
      if (this.currentFolderId === 'root') {
        this.$message({
          type: 'warning',
          message: '根目录显示所有书签，无法排序。请进入具体文件夹进行排序。'
        });
        return;
      }
      
      switch (command) {
        case 'name':
          this.sortBookmarksByName(this.currentFolderId);
          break;
        case 'url':
          this.sortBookmarksByUrl(this.currentFolderId);
          break;
        case 'date':
          this.sortBookmarksByDate(this.currentFolderId);
          break;
        case 'custom':
          this.customSortDialogVisible = true;
          break;
      }
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
    
    applyCustomSort() {
      try {
        // 检查是否在根目录
        if (this.currentFolderId === 'root') {
          this.$message({
            type: 'warning',
            message: '根目录显示所有书签，无法排序。请进入具体文件夹进行排序。'
          });
          return;
        }
        
        // 验证和清理排序函数
        const cleanFunction = this.validateAndSanitizeCustomSort(this.customSortFunction);
        
        this.sortBookmarksCustom({
          folderId: this.currentFolderId,
          sortFunctionString: cleanFunction
        });
        this.customSortDialogVisible = false;
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
    },
    navigateToFolder(folderId) {
      this.$emit('folder-selected', folderId);
    },
    handleContextMenu(event) {
      // 阻止默认右键菜单
      event.preventDefault();
      // 也可以在这里实现自定义右键菜单
    },
    handleRowClick() {
      // 实现行点击逻辑，如果需要的话
    },
    handleDragStart(event, bookmark, index) {
      DevTools.log('开始拖拽:', bookmark.name, 'at index:', index);
      
      // 重置拖拽状态
      this.resetDragState();
      
      // 设置基本拖拽数据（兼容跨文件夹拖拽）
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify({
        type: 'bookmark',
        id: bookmark.id,
        name: bookmark.name
      }));

      // 判断是否启用内部排序
      const canInternalSort = this.currentFolderId !== 'root' && !this.specialMode;
      
      if (canInternalSort) {
        // 启用内部排序拖拽
        this.dragState.isDragging = true;
        this.dragState.isInternalDrag = true;
        this.dragState.draggedBookmark = bookmark;
        this.dragState.draggedIndex = index;
        this.dragState.originalIndex = index;
        this.dragState.dropTargetIndex = -1;
        this.dragState.dragStartPosition = { x: event.clientX, y: event.clientY };

        // 创建拖拽预览
        this.createDragPreview(bookmark, event);

        // 添加内部排序标识
        event.dataTransfer.setData('bookmark-reorder', JSON.stringify({
          type: 'bookmark-reorder',
          id: bookmark.id,
          originalIndex: index
        }));

        // 设置事件监听器
        this.setupDragListeners();
        
        // 清除文本选择
        this.clearSelection();
        
        DevTools.log('内部排序拖拽已启用');
      } else {
        DevTools.log('使用跨文件夹拖拽模式');
      }

      // 设置通用拖拽结束处理
      this.setupDragEndHandler();
    },

    handleDragOver(event, index) {
      // 只处理内部排序
      if (!this.dragState.isDragging || !this.dragState.isInternalDrag) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      // 计算放置位置
      const rect = event.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      this.dragState.dropPosition = event.clientY < midY ? 'above' : 'below';
      
      // 计算目标索引
      let targetIndex = index;
      if (this.dragState.dropPosition === 'below') {
        targetIndex = index + 1;
      }

      // 调整索引（考虑拖拽元素移除的影响）
      if (this.dragState.draggedIndex < targetIndex) {
        targetIndex = targetIndex - 1;
      }

      this.dragState.dropTargetIndex = index;
      this.dragState.targetIndex = targetIndex;
    },

    handleDragEnter(event, index) {
      if (!this.dragState.isDragging || !this.dragState.isInternalDrag) {
        return;
      }
      event.preventDefault();
    },

    handleDragLeave(event) {
      if (!this.dragState.isDragging || !this.dragState.isInternalDrag) {
        return;
      }
      
      // 检查是否真正离开了元素
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX;
      const y = event.clientY;
      
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        this.dragState.dropTargetIndex = -1;
      }
    },

    handleDrop(event, index) {
      if (!this.dragState.isDragging || !this.dragState.isInternalDrag) {
        return;
      }

      event.preventDefault();
      DevTools.log('放置操作，目标索引:', this.dragState.targetIndex, '原始索引:', this.dragState.originalIndex);
      
      // 检查是否回到原位置
      if (this.dragState.targetIndex === this.dragState.originalIndex) {
        DevTools.log('拖拽回原位置，取消操作');
        this.cancelDrag();
        return;
      }

      // 执行重排序
      this.performReorder();
    },

    handleDragEnd(event) {
      DevTools.log('拖拽结束');
      
      // 清理状态
      setTimeout(() => {
        this.cleanupDrag();
      }, 100); // 延迟清理，确保其他事件处理完成
    },

    createDragPreview(bookmark, event) {
      const preview = document.createElement('div');
      preview.className = 'drag-preview';
      
      const faviconUrl = this.getFavicon(bookmark.url);
      preview.innerHTML = `
        <div class="drag-preview-content">
          ${faviconUrl ? `<img src="${faviconUrl}" class="favicon" />` : ''}
          <span>${bookmark.name}</span>
        </div>
      `;
      
      // 样式设置
      Object.assign(preview.style, {
        position: 'fixed',
        top: '-1000px',
        left: '-1000px',
        zIndex: '9999',
        pointerEvents: 'none',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transform: 'rotate(3deg)',
        opacity: '0.9',
        fontSize: '14px',
        fontFamily: 'inherit'
      });

      document.body.appendChild(preview);
      this.dragState.dragPreviewElement = preview;

      // 设置拖拽图像
      try {
        event.dataTransfer.setDragImage(preview, 0, 0);
      } catch (e) {
        DevTools.warn('设置拖拽图像失败:', e);
      }
    },

    setupDragListeners() {
      // 键盘取消
      this.dragListeners.keydown = (e) => {
        if (this.dragState.cancelKeys.includes(e.key)) {
          e.preventDefault();
          this.cancelDrag();
        }
      };

      // 点击取消
      this.dragListeners.click = (e) => {
        this.cancelDrag();
      };

      // 鼠标移动检测
      this.dragListeners.mousemove = (e) => {
        const distance = Math.sqrt(
          Math.pow(e.clientX - this.dragState.dragStartPosition.x, 2) + 
          Math.pow(e.clientY - this.dragState.dragStartPosition.y, 2)
        );
        
        // 回到起始位置附近时显示提示
        if (distance < 30) {
          this.showCancelHint();
        } else {
          this.hideCancelHint();
        }
      };

      // 注册事件
      document.addEventListener('keydown', this.dragListeners.keydown);
      document.addEventListener('click', this.dragListeners.click);
      document.addEventListener('mousemove', this.dragListeners.mousemove);
    },

    setupDragEndHandler() {
      // 拖拽结束处理（适用于所有拖拽类型）
      this.dragListeners.dragend = (e) => {
        DevTools.log('全局拖拽结束事件');
        
        // 清理跨文件夹拖拽的样式
        document.querySelectorAll('.dragover').forEach(el => {
          el.classList.remove('dragover');
        });
        
        // 清理内部拖拽状态
        if (this.dragState.isDragging) {
          this.cleanupDrag();
        }
        
        // 移除这个监听器
        document.removeEventListener('dragend', this.dragListeners.dragend);
        this.dragListeners.dragend = null;
      };
      
      document.addEventListener('dragend', this.dragListeners.dragend);
    },

    removeDragListeners() {
      Object.keys(this.dragListeners).forEach(eventType => {
        const listener = this.dragListeners[eventType];
        if (listener) {
          document.removeEventListener(eventType, listener);
          this.dragListeners[eventType] = null;
        }
      });
    },

    performReorder() {
      if (!this.dragState.draggedBookmark) {
        DevTools.warn('没有拖拽的书签');
        return;
      }

      // 计算实际索引（考虑分页）
      const pageOffset = (this.currentPage - 1) * this.pageSize;
      const actualTargetIndex = this.dragState.targetIndex + pageOffset;

      DevTools.log('执行重排序:', {
        bookmarkId: this.dragState.draggedBookmark.id,
        folderId: this.currentFolderId,
        targetIndex: actualTargetIndex,
        pageOffset
      });

      // 调用store action
      this.$store.dispatch('bookmarks/reorderBookmarks', {
        folderId: this.currentFolderId,
        bookmarkId: this.dragState.draggedBookmark.id,
        targetIndex: actualTargetIndex,
        operationType: 'drag'
      });

      // 显示成功消息
      this.$message({
        type: 'success',
        message: `已将 "${this.dragState.draggedBookmark.name}" 移动到新位置`,
        duration: 2000
      });

      // 清理状态
      this.cleanupDrag();
    },

    cancelDrag() {
      DevTools.log('取消拖拽');
      this.$message({
        message: '拖拽已取消',
        type: 'info',
        duration: 1500
      });
      this.cleanupDrag();
    },

    cleanupDrag() {
      DevTools.log('清理拖拽状态');
      
      // 移除预览元素
      if (this.dragState.dragPreviewElement) {
        try {
          document.body.removeChild(this.dragState.dragPreviewElement);
        } catch (e) {
          DevTools.warn('移除预览元素失败:', e);
        }
      }

      // 重置状态
      this.resetDragState();

      // 移除监听器
      this.removeDragListeners();

      // 隐藏提示
      this.hideCancelHint();
    },

    resetDragState() {
      this.dragState = {
        isDragging: false,
        draggedBookmark: null,
        draggedIndex: -1,
        dropTargetIndex: -1,
        originalIndex: -1,
        targetIndex: -1,
        dropPosition: null,
        dragPreviewElement: null,
        dragStartPosition: { x: 0, y: 0 },
        isInternalDrag: false,
        cancelKeys: ['Escape', 'Enter', ' ']
      };
    },

    clearSelection() {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    },

    showCancelHint() {
      // 可以在这里添加UI提示
      DevTools.log('提示: 释放鼠标可取消拖拽');
    },

    hideCancelHint() {
      // 隐藏UI提示
    },
    copyCurrentPath() {
      try {
        // 获取当前文件夹路径字符串
        const pathString = this.folderPath
          .map(f => this.safeDisplayText(f.name))
          .join('/');
        
        if (!pathString) {
          this.$message.warning('当前路径为空');
          return;
        }
        
        // 复制到剪贴板
        navigator.clipboard.writeText(pathString)
          .then(() => {
            this.$message({
              message: '路径已复制到剪贴板',
              type: 'success',
              duration: 1500
            });
          })
          .catch(err => {
            DevTools.error('复制路径失败:', err);
            this.$message.error('复制失败');
          });
      } catch (error) {
        DevTools.error('获取当前路径失败:', error);
        this.$message.error('获取路径失败');
      }
    },
    getBookmarkPath(bookmark) {
      try {
        // 验证书签对象
        if (!bookmark || !bookmark.folderId) {
          return '未知路径';
        }
        
        // 如果在根目录下，并且书签已经有路径信息，直接使用
        if (this.currentFolderId === 'root' && bookmark.pathString) {
          return this.safeDisplayText(bookmark.pathString);
        }
        
        // 否则动态计算路径
        const folderPath = this.getFolderPath(bookmark.folderId);
        if (!Validator.isValidArray(folderPath)) {
          return '根目录';
        }
        
        return folderPath
          .map(f => this.safeDisplayText(f.name))
          .join(' / ');
      } catch (error) {
        DevTools.error('获取书签路径失败:', error);
        return '路径获取失败';
      }
    },
    copyItemPath(bookmark) {
      try {
        // 验证书签对象
        if (!bookmark) {
          this.$message.error('书签信息无效');
          return;
        }
        
        // 获取书签所在文件夹的路径字符串
        const pathString = this.getBookmarkPath(bookmark);
        
        if (!pathString) {
          this.$message.warning('书签路径为空');
          return;
        }
        
        // 复制到剪贴板
        navigator.clipboard.writeText(pathString)
          .then(() => {
            this.$message({
              message: '路径已复制到剪贴板',
              type: 'success',
              duration: 1500
            });
          })
          .catch(err => {
            DevTools.error('复制路径失败:', err);
            this.$message.error('复制失败');
          });
      } catch (error) {
        DevTools.error('获取书签路径失败:', error);
        this.$message.error('获取路径失败');
      }
    },
    moveBookmarkUp(bookmarkId) {
      this.$store.dispatch('bookmarks/moveBookmarkUp', bookmarkId);
    },
    moveBookmarkDown(bookmarkId) {
      this.$store.dispatch('bookmarks/moveBookmarkDown', bookmarkId);
    },
    showToast(message, type = 'info') {
      this.$message({
        message,
        type,
        duration: 1500
      });
    }
  },
  
  mounted() {
    // 初始化懒加载
    this.setupLazyLoading();
  },
  
  updated() {
    // 页面更新后重新观察新的favicon元素
    this.$nextTick(() => {
      this.observeFaviconElements();
    });
  },
  
  beforeDestroy() {
    // 清理所有事件监听器
    this.removeDragListeners();
    
    // 清理缓存
    if (this._faviconCache) {
      this._faviconCache.clear();
    }
    if (this._dateCache) {
      this._dateCache.clear();
    }
    
    // 清理懒加载
    this.cleanupLazyLoading();
    
    // 清理拖拽相关状态
    this.cleanupDrag();
    
    // 清理任何可能残留的document事件监听器
    document.removeEventListener('keydown', this.handleEscapeKey);
    document.removeEventListener('click', this.handleGlobalClick);
    document.removeEventListener('mousemove', this.handleGlobalMouseMove);
    document.removeEventListener('dragend', this.handleGlobalDragEnd);
    
    // 清理可能的样式
    document.querySelectorAll('.dragover').forEach(el => {
      el.classList.remove('dragover');
    });
  }
};
</script>

<style scoped>
.bookmark-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 15px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.path-navigation {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.root-tip {
  margin-left: 10px;
}

.bookmark-table-wrapper {
  flex: 1;
  overflow: auto;
}

.bookmark-name {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  position: relative;
}

.bookmark-name:hover {
  background-color: #f5f7fa;
}

.bookmark-name.dragging {
  opacity: 0.5;
  transform: scale(0.95);
  background-color: #e6f7ff;
  border: 2px dashed #1890ff;
}

.bookmark-name.drop-target {
  background-color: #f6ffed;
  transform: scale(1.02);
}

.bookmark-name.drag-above::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: #1890ff;
  border-radius: 1px;
}

.bookmark-name.drag-below::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: #1890ff;
  border-radius: 1px;
}

.drag-handle {
  margin-left: auto;
  opacity: 0;
  color: #999;
  cursor: grab;
  transition: opacity 0.2s ease;
}

.bookmark-name:hover .drag-handle {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.dragging-active {
  user-select: none;
}

.dragging-active .bookmark-name:not(.dragging) {
  cursor: default;
}

/* 拖拽预览样式 */
.drag-preview {
  font-family: inherit;
}

.drag-preview-content {
  display: flex;
  align-items: center;
  font-size: 14px;
  white-space: nowrap;
}

.drag-preview .favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border-radius: 2px;
  transition: opacity 0.3s ease;
}

.favicon[src*="data:image/svg"] {
  opacity: 0.6;
}

.favicon:not([src*="data:image/svg"]) {
  opacity: 1;
}

/* 懒加载效果 */
.favicon.loading {
  opacity: 0.4;
  animation: favicon-pulse 1.5s infinite;
}

@keyframes favicon-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* 加载失败的favicon样式 */
.favicon.error {
  opacity: 0.3;
  filter: grayscale(1);
}

.pagination-container {
  margin-top: 15px;
  text-align: right;
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

.custom-tree-node {
  display: flex;
  align-items: center;
}

.folder-icon {
  margin-right: 5px;
  color: #e6a23c;
}

.copy-path-icon {
  margin-left: 10px;
  cursor: pointer;
}

.bookmark-path {
  display: flex;
  align-items: center;
}

.copy-item-path {
  margin-left: 5px;
  cursor: pointer;
}

.action-buttons {
  display: flex;
  gap: 5px;
}

.move-up-btn, .move-down-btn {
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 2px 5px;
  cursor: pointer;
}

.move-up-btn:hover, .move-down-btn:hover {
  background-color: #e0e0e0;
}
</style> 