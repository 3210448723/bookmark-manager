<template>
  <div>
    <!-- 导入对话框 -->
    <el-dialog
      title="导入书签"
      :visible="importDialogVisible"
      width="500px"
      @close="closeImportDialog"
    >
      <div class="import-container">
        <el-alert
          title="支持浏览器导出的书签HTML文件"
          type="info"
          :closable="false"
          show-icon
        >
        </el-alert>
        <div class="upload-area">
          <el-upload
            class="upload-demo"
            drag
            action="#"
            :auto-upload="false"
            :on-change="handleFileChange"
            :file-list="fileList"
            :limit="1"
            accept=".html,.htm"
            ref="upload"
          >
            <i class="el-icon-upload"></i>
            <div class="el-upload__text">将书签文件拖到此处，或<em>点击上传</em></div>
            <div class="el-upload__tip" slot="tip">只支持HTML格式的书签文件</div>
          </el-upload>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="closeImportDialog">取消</el-button>
        <el-button type="primary" @click="handleImportBookmarks" :disabled="!selectedFile">
          导入
        </el-button>
      </span>
    </el-dialog>

    <!-- 导出对话框 -->
    <el-dialog
      title="导出书签"
      :visible="exportDialogVisible"
      width="500px"
      @close="closeExportDialog"
    >
      <div class="export-container">
        <el-alert
          title="将会导出为HTML格式，可在其他浏览器中导入"
          type="info"
          :closable="false"
          show-icon
        >
        </el-alert>
        <div class="export-options">
          <el-checkbox v-model="exportAll">导出所有书签</el-checkbox>
          <div v-if="!exportAll" class="folder-select">
            <p>选择要导出的文件夹：</p>
            <el-tree
              :data="folderTreeData"
              :props="defaultProps"
              node-key="id"
              :default-expanded-keys="['root']"
              :highlight-current="true"
              show-checkbox
              ref="folderTree"
            >
              <span class="custom-tree-node" slot-scope="{ node, data }">
                <i :class="['folder-icon', data.isExpanded ? 'el-icon-folder-opened' : 'el-icon-folder']"></i>
                {{ node.label }}
              </span>
            </el-tree>
          </div>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="closeExportDialog">取消</el-button>
        <el-button type="primary" @click="handleExportBookmarks">
          导出
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import { APP_CONSTANTS } from '@/constants';
import { Validator, SecurityUtils, ErrorHandler, BookmarkValidator } from '@/utils/validation';

export default {
  name: 'ImportExport',
  props: {
    importDialogVisible: {
      type: Boolean,
      default: false
    },
    exportDialogVisible: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      fileList: [],
      selectedFile: null,
      exportAll: true,
      defaultProps: {
        children: 'children',
        label: 'name'
      }
    };
  },
  computed: {
    ...mapState({
      folders: state => state.bookmarks.folders,
      bookmarks: state => state.bookmarks.bookmarks
    }),
    ...mapGetters('bookmarks', [
      'getFoldersByParentId',
      'getBookmarksByFolderId'
    ]),
    folderTreeData() {
      // 构建文件夹树结构
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
    importDialogVisible(val) {
      if (!val) {
        this.fileList = [];
        this.selectedFile = null;
      }
    },
    exportDialogVisible(val) {
      if (!val) {
        this.exportAll = true;
      }
    }
  },
  methods: {
    ...mapActions('bookmarks', [
      'importBookmarks'
    ]),
    handleFileChange(file) {
      // 验证文件对象
      if (!file || !file.raw) {
        this.$message.error('文件信息无效');
        return;
      }
      
      // 验证文件类型
      const validTypes = ['text/html', 'application/octet-stream'];
      if (!validTypes.includes(file.raw.type) && !file.name.toLowerCase().endsWith('.html')) {
        this.$message.error('请选择HTML格式的书签文件');
        return;
      }
      
      // 验证文件大小
      if (file.raw.size > APP_CONSTANTS.MAX_FILE_SIZE) {
        this.$message.error(`文件大小不能超过${Math.round(APP_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024)}MB`);
        return;
      }
      
      // 验证文件名安全性
      if (!Validator.isSafeFileName(file.name)) {
        this.$message.error('文件名包含非法字符');
        return;
      }
      
      this.selectedFile = file;
    },
    closeImportDialog() {
      this.$emit('update:importDialogVisible', false);
    },
    closeExportDialog() {
      this.$emit('update:exportDialogVisible', false);
    },
    async handleImportBookmarks() {
      if (!this.selectedFile) {
        this.$message.warning('请选择要导入的文件');
        return;
      }
      
      // 验证文件类型
      const file = this.selectedFile.raw;
      if (!APP_CONSTANTS.SUPPORTED_FILE_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
        this.$message.error('请选择HTML格式的书签文件');
        return;
      }
      
      // 验证文件大小
      if (file.size > APP_CONSTANTS.MAX_FILE_SIZE) {
        this.$message.error('文件大小不能超过10MB');
        return;
      }
      
      try {
        this.$loading({
          text: '正在解析书签文件...',
          spinner: 'el-icon-loading'
        });
        
        const text = await this.readFileAsText(file);
        
        // 验证文件内容
        if (!text || text.trim().length === 0) {
          throw new Error('文件内容为空');
        }
        
        const { bookmarks, folders } = this.parseBookmarkHTML(text);
        
        if (bookmarks.length === 0 && folders.length === 0) {
          this.$message.warning('未从文件中解析出任何书签或文件夹');
          return;
        }
        
        // 验证书签URL格式并应用安全检查
        const validBookmarks = bookmarks.filter(bookmark => {
          // 使用我们的验证工具
          const validation = BookmarkValidator.validateBookmark(bookmark);
          if (!validation.isValid) {
            console.warn(`无效的书签: ${bookmark.name}`, validation.errors);
            return false;
          }
          
          // 额外的URL验证
          if (!Validator.isValidUrl(bookmark.url)) {
            console.warn(`无效的URL: ${bookmark.url}`);
            return false;
          }
          
          return true;
        });
        
        if (validBookmarks.length !== bookmarks.length) {
          this.$message.warning(`已过滤掉 ${bookmarks.length - validBookmarks.length} 个无效URL的书签`);
        }
        
        // 导入书签
        await this.importBookmarks({ 
          bookmarks: validBookmarks, 
          folders: folders.filter(f => f.id !== 'root') // 过滤掉根文件夹
        });
        
        this.$loading().close();
        this.$message.success(`成功导入 ${validBookmarks.length} 个书签和 ${folders.length} 个文件夹`);
        this.$emit('update:importDialogVisible', false);
      } catch (error) {
        this.$loading().close();
        console.error('导入错误', error);
        this.$message.error('导入失败: ' + (error.message || '未知错误'));
      }
    },
    readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    },
    parseBookmarkHTML(html) {
      try {
        // 创建安全的DOM解析器
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 检查是否解析成功
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          throw new Error('HTML格式无效');
        }
        
        const bookmarks = [];
        const folders = [];
        let folderCounter = 0;
        let bookmarkCounter = 0;
        
        // 递归解析文件夹和书签
        const parseNode = (element, parentId = 'root', depth = 0) => {
          // 防止无限递归
          if (depth > APP_CONSTANTS.MAX_DEPTH.FOLDER_PARSING) {
            console.warn('文件夹层级过深，停止解析');
            return;
          }
          
          const children = Array.from(element.children);
          
          for (const child of children) {
            try {
              if (child.tagName === 'DT') {
                const dtChildren = Array.from(child.children);
                
                for (const dtChild of dtChildren) {
                  if (dtChild.tagName === 'H3') {
                    // 这是一个文件夹
                    const folderName = this.sanitizeText(dtChild.textContent || '未命名文件夹');
                    
                    // 限制文件夹名称长度
                    const truncatedName = folderName.length > APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME ? 
                      folderName.substring(0, APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME) + '...' : folderName;
                    const folderId = `imported_folder_${folderCounter++}`;
                    
                    folders.push({
                      id: folderId,
                      name: truncatedName,
                      parentId
                    });
                    
                    // 查找紧跟着的DL元素（文件夹内容）
                    let nextSibling = dtChild.nextElementSibling;
                    while (nextSibling && nextSibling.tagName !== 'DL') {
                      nextSibling = nextSibling.nextElementSibling;
                    }
                    
                    if (nextSibling && nextSibling.tagName === 'DL') {
                      // 递归解析文件夹内容
                      parseNode(nextSibling, folderId, depth + 1);
                    }
                  } else if (dtChild.tagName === 'A') {
                    // 这是一个书签
                    const url = dtChild.getAttribute('href');
                    if (url && this.isValidUrl(url)) {
                      const name = this.sanitizeText(dtChild.textContent || url);
                      const addDate = dtChild.getAttribute('add_date');
                      
                      // 限制书签名称长度
                      const truncatedName = name.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME ? 
                        name.substring(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) + '...' : name;
                      
                      const createdAt = addDate ? 
                        new Date(parseInt(addDate) * 1000).toISOString() : 
                        new Date().toISOString();
                      
                      bookmarks.push({
                        id: `imported_bookmark_${bookmarkCounter++}`,
                        name: truncatedName,
                        url: url.trim(),
                        folderId: parentId,
                        createdAt
                      });
                    } else {
                      console.warn('跳过无效URL:', url);
                    }
                  }
                }
              } else if (child.tagName === 'DL') {
                // 直接遇到DL标签，递归解析
                parseNode(child, parentId, depth);
              }
            } catch (elementError) {
              console.warn('处理元素时出错:', elementError);
            }
          }
        };
        
        // 从根DL开始解析
        const rootDL = doc.querySelector('dl');
        if (rootDL) {
          parseNode(rootDL, 'root');
        } else {
          console.warn('未找到根DL元素，尝试查找其他书签结构');
          // 尝试查找其他可能的书签结构
          const bookmarkLinks = doc.querySelectorAll('a[href]');
          bookmarkLinks.forEach(link => {
            const url = link.getAttribute('href');
            if (url && this.isValidUrl(url)) {
              const name = this.sanitizeText(link.textContent || url);
              bookmarks.push({
                id: `imported_bookmark_${bookmarkCounter++}`,
                name: name.length > APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME ? 
                  name.substring(0, APP_CONSTANTS.TEXT_LIMITS.BOOKMARK_NAME) + '...' : name,
                url: url.trim(),
                folderId: 'root',
                createdAt: new Date().toISOString()
              });
            }
          });
        }
        
        return { bookmarks, folders };
      } catch (error) {
        console.error('解析HTML时出错:', error);
        throw new Error('解析书签文件失败: ' + error.message);
      }
    },
    
    sanitizeText(text) {
      if (Validator.isEmpty(text)) return '';
      
      // 使用SecurityUtils进行安全清理
      let cleanText = SecurityUtils.stripHtml(text);
      
      // 应用额外的清理规则
      cleanText = cleanText
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      
      // 移除控制字符
      cleanText = cleanText.split('').filter(char => {
        const code = char.charCodeAt(0);
        return code >= 32 && code !== 127;
      }).join('');
      
      return cleanText;
    },
    
    isValidUrl(url) {
      try {
        const urlObj = new URL(url);
        // 只允许安全协议
        return APP_CONSTANTS.SUPPORTED_PROTOCOLS.includes(urlObj.protocol);
      } catch {
        return false;
      }
    },
    handleExportBookmarks() {
      try {
        let bookmarksToExport = [];
        let foldersToExport = [];
        
        if (this.exportAll) {
          // 导出所有书签和文件夹
          bookmarksToExport = this.bookmarks;
          foldersToExport = this.folders;
        } else {
          // 导出选中的文件夹及其子文件夹下的书签
          const selectedFolderIds = this.$refs.folderTree.getCheckedKeys();
          
          if (selectedFolderIds.length === 0) {
            this.$message.warning('请选择至少一个要导出的文件夹');
            return;
          }
          
          // 获取所有选中文件夹的子文件夹
          const allFolderIds = [...selectedFolderIds];
          const getChildFolders = (parentId) => {
            const children = this.getFoldersByParentId(parentId);
            children.forEach(child => {
              allFolderIds.push(child.id);
              getChildFolders(child.id);
            });
          };
          
          selectedFolderIds.forEach(folderId => {
            getChildFolders(folderId);
          });
          
          // 确保选中的文件夹及其所有父文件夹都被导出
          const ensureParentFolders = (folderId) => {
            const folder = this.folders.find(f => f.id === folderId);
            if (folder && folder.parentId && folder.parentId !== 'root') {
              if (!allFolderIds.includes(folder.parentId)) {
                allFolderIds.push(folder.parentId);
                ensureParentFolders(folder.parentId);
              }
            }
          };
          
          // 为每个选中的文件夹确保其父文件夹都被包含
          [...allFolderIds].forEach(folderId => {
            ensureParentFolders(folderId);
          });
          
          // 始终包含根文件夹
          if (!allFolderIds.includes('root')) {
            allFolderIds.push('root');
          }
          
          // 过滤书签和文件夹
          foldersToExport = this.folders.filter(folder => allFolderIds.includes(folder.id));
          bookmarksToExport = this.bookmarks.filter(bookmark => allFolderIds.includes(bookmark.folderId));
        }
        
        if (bookmarksToExport.length === 0 && foldersToExport.length === 0) {
          this.$message.warning('没有可导出的内容');
          return;
        }
        
        // 生成HTML
        const html = this.generateBookmarkHTML(bookmarksToExport, foldersToExport);
        
        // 创建下载链接
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookmarks_${new Date().toISOString().split('T')[0]}.html`;
        
        // 确保元素被添加到DOM中，某些浏览器需要这个
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // 清理资源
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, APP_CONSTANTS.DEBOUNCE_DELAY.RESOURCE_CLEANUP);
        
        this.$emit('update:exportDialogVisible', false);
        this.$message.success(`导出成功：${bookmarksToExport.length} 个书签，${foldersToExport.length} 个文件夹`);
      } catch (error) {
        console.error('导出错误', error);
        this.$message.error('导出失败: ' + (error.message || '未知错误'));
      }
    },
    generateBookmarkHTML(bookmarks, folders) {
      try {
        // 构建文件夹树
        const folderMap = {};
        folders.forEach(folder => {
          folderMap[folder.id] = {
            ...folder,
            children: [],
            bookmarks: []
          };
        });
        
        // 构建文件夹层次结构
        Object.keys(folderMap).forEach(id => {
          const folder = folderMap[id];
          if (folder.parentId !== null && folderMap[folder.parentId]) {
            folderMap[folder.parentId].children.push(folder);
          }
        });
        
        // 将书签放入对应的文件夹
        bookmarks.forEach(bookmark => {
          if (folderMap[bookmark.folderId]) {
            folderMap[bookmark.folderId].bookmarks.push(bookmark);
          }
        });
        
        // 生成HTML
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!--This is an automatically generated file.
    It will be read and overwritten.
    DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
        
        // 递归生成文件夹和书签HTML
        const generateFolderHTML = (folder, indent = 1) => {
          if (indent > APP_CONSTANTS.MAX_DEPTH.HTML_GENERATION) {
            console.warn('文件夹层级过深，停止生成');
            return '';
          }
          
          const spaces = '    '.repeat(indent);
          const escapedName = this.escapeHtml(folder.name);
          let folderHTML = `${spaces}<DT><H3>${escapedName}</H3>\n${spaces}<DL><p>\n`;
          
          // 添加书签
          folder.bookmarks.forEach(bookmark => {
            try {
              const addDate = Math.floor(new Date(bookmark.createdAt).getTime() / 1000);
              const escapedName = this.escapeHtml(bookmark.name);
              const escapedUrl = this.escapeHtml(bookmark.url);
              
              folderHTML += `${spaces}    <DT><A HREF="${escapedUrl}" ADD_DATE="${addDate}">${escapedName}</A>\n`;
            } catch (error) {
              console.warn('生成书签HTML时出错:', error);
            }
          });
          
          // 添加子文件夹
          folder.children.forEach(child => {
            folderHTML += generateFolderHTML(child, indent + 1);
          });
          
          folderHTML += `${spaces}</DL><p>\n`;
          return folderHTML;
        };
        
        // 从根文件夹开始生成
        const rootFolder = folderMap['root'];
        if (rootFolder) {
          rootFolder.children.forEach(child => {
            html += generateFolderHTML(child);
          });
          
          // 添加根文件夹下的书签
          rootFolder.bookmarks.forEach(bookmark => {
            try {
              const addDate = Math.floor(new Date(bookmark.createdAt).getTime() / 1000);
              const escapedName = this.escapeHtml(bookmark.name);
              const escapedUrl = this.escapeHtml(bookmark.url);
              
              html += `    <DT><A HREF="${escapedUrl}" ADD_DATE="${addDate}">${escapedName}</A>\n`;
            } catch (error) {
              console.warn('生成根书签HTML时出错:', error);
            }
          });
        }
        
        html += '</DL><p>';
        return html;
      } catch (error) {
        console.error('生成HTML时出错:', error);
        throw new Error('生成导出文件失败: ' + error.message);
      }
    },
    
    escapeHtml(text) {
      if (!text) return '';
      
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }
};
</script>

<style scoped>
.import-container, .export-container {
  margin-bottom: 20px;
}

.upload-area {
  margin-top: 20px;
}

.folder-select {
  margin-top: 15px;
}

.custom-tree-node {
  display: flex;
  align-items: center;
}

.folder-icon {
  margin-right: 5px;
  color: #e6a23c;
}
</style> 