<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>收藏夹</h2>
    </div>
    <div class="sidebar-content">
      <el-tree
        ref="folderTree"
        :key="treeKey"
        :data="folderTreeData"
        :props="defaultProps"
        node-key="id"
        :default-expanded-keys="defaultExpandedKeys"
        :expand-on-click-node="false"
        :highlight-current="true"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        :allow-drop="allowDrop"
        :allow-drag="allowDrag"
        draggable
        @node-drag-start="handleDragStart"
        @node-drag-enter="handleDragEnter"
        @node-drag-leave="handleDragLeave"
        @node-drag-over="handleDragOver"
        @node-drag-end="handleDragEnd"
        @node-drop="handleDrop"
      >
        <span 
          class="custom-tree-node" 
          slot-scope="{ node, data }"
          @dragover="handleFolderDragOver($event)"
          @dragenter="handleFolderDragEnter($event)"
          @dragleave="handleFolderDragLeave($event)"
          @drop="handleFolderDrop($event, data)"
        >
          <span>
            <i :class="['folder-icon', data.isExpanded ? 'el-icon-folder-opened' : 'el-icon-folder']"></i>
            <span v-html="node.label"></span>
          </span>
          <span class="actions">
            <el-dropdown trigger="click" @command="(command) => handleCommand(command, data)" @click.stop>
              <i class="el-icon-more"></i>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                <el-dropdown-item command="addBookmark">添加书签</el-dropdown-item>
                <el-dropdown-item command="addFolder">添加子文件夹</el-dropdown-item>
                <el-dropdown-item divided command="sortByName">按名称排序</el-dropdown-item>
                <el-dropdown-item command="customSort">自定义排序</el-dropdown-item>
                <el-dropdown-item divided command="delete" v-if="data.id !== 'root'">删除</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </span>
        </span>
      </el-tree>
    </div>
    <div class="sidebar-footer">
      <div class="special-folders">
        <div class="special-folder" @click="showInvalidBookmarks">
          <i class="el-icon-warning-outline"></i>
          <span>失效书签</span>
        </div>
        <div class="special-folder" @click="showDuplicateBookmarks">
          <i class="el-icon-copy-document"></i>
          <span>重复书签</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import { APP_CONSTANTS } from '@/constants';
import { Validator, SecurityUtils, ErrorHandler } from '@/utils/validation';
import { DevTools } from '@/utils/devTools';

export default {
  name: 'SidebarComponent',
  data() {
    return {
      defaultProps: {
        children: 'children',
        label: 'name'
      },
      draggingNode: null,
      dropNode: null,
      treeKey: 0, // 用于强制重新渲染树组件
      expandTimer: null // 展开状态同步的防抖定时器
    };
  },
  watch: {
    // 监听文件夹状态变化，使用更精确的更新策略而非强制重渲染
    folders: {
      handler(newFolders, oldFolders) {
        return ErrorHandler.safeExecute(() => {
          // 验证文件夹数据
          if (!Validator.isValidArray(newFolders)) {
            DevTools.warn('接收到无效的文件夹数据');
            return;
          }
          
          // 只有在根本性重置时才重新渲染（比如清空所有文件夹）
          if (oldFolders && newFolders.length === 1 && oldFolders.length > 5) {
            // 使用更温和的方式：延迟更新而非立即强制重渲染
            this.$nextTick(() => {
              if (this.$refs.folderTree) {
                this.$refs.folderTree.setCurrentKey('root');
                // 只有在必要时才增加treeKey
                if (this.needsCompleteRefresh(newFolders, oldFolders)) {
                  this.treeKey += 1;
                }
              }
            });
          }
        }, '文件夹状态更新失败');
      },
      deep: true
    },
    // 优化展开状态同步，减少不必要的操作
    defaultExpandedKeys(newKeys, oldKeys) {
      return ErrorHandler.safeExecute(() => {
        // 验证展开键数组
        if (!Validator.isValidArray(newKeys) || !Validator.isValidArray(oldKeys)) {
          return;
        }
        
        // 防抖处理，避免频繁更新
        if (this.expandTimer) {
          clearTimeout(this.expandTimer);
        }
        
        this.expandTimer = setTimeout(() => {
          this.$nextTick(() => {
            if (this.$refs.folderTree) {
              // 只处理真正变化的节点
              const added = newKeys.filter(key => !oldKeys.includes(key));
              const removed = oldKeys.filter(key => !newKeys.includes(key));
              
              added.forEach(key => {
                if (Validator.isValidId(key)) {
                  this.$refs.folderTree.setExpanded(key, true);
                }
              });
              removed.forEach(key => {
                if (Validator.isValidId(key)) {
                  this.$refs.folderTree.setExpanded(key, false);
                }
              });
            }
          });
        }, APP_CONSTANTS.DEBOUNCE_DELAY.TREE_EXPAND);
      }, '展开状态同步失败');
    }
  },
  computed: {
    ...mapState({
      folders: state => state.bookmarks.folders
    }),
    ...mapGetters('bookmarks', [
      'getFoldersByParentId',
      'getAllChildFolders'
    ]),
    folderTreeData() {
      return ErrorHandler.safeExecute(() => {
        // 验证文件夹数据
        if (!Validator.isValidArray(this.folders)) {
          return [];
        }
        
        // 构建文件夹树结构，确保正确处理多级目录
        const buildTree = (parentId) => {
          if (!Validator.isValidId(parentId)) {
            return [];
          }
          
          // 获取直接子文件夹
          const children = this.getFoldersByParentId(parentId);
          if (!Validator.isValidArray(children)) return [];
          
          // 对于每个子文件夹，递归构建其子树
          return children.map(folder => {
            // 验证文件夹数据
            if (!this.isValidFolderData(folder)) {
              return null;
            }
            
            const childFolders = buildTree(folder.id);
            return {
              ...folder,
              // 安全化文件夹名称
              name: SecurityUtils.escapeHtml(folder.name || '未命名文件夹'),
              children: childFolders // 即使childFolders为空数组，也保留结构一致性
            };
          }).filter(Boolean); // 过滤掉无效项
        };
        
        // 获取根文件夹及其所有子节点
        const rootFolder = this.folders.find(f => f.id === 'root');
        if (!rootFolder || !this.isValidFolderData(rootFolder)) {
          return [];
        }
        
        // 创建根文件夹的完整树结构
        return [{
          ...rootFolder,
          name: SecurityUtils.escapeHtml(rootFolder.name || '收藏夹根目录'),
          children: buildTree('root')
        }];
      }, '构建文件夹树失败', []);
    },
    // 计算默认展开的节点
    defaultExpandedKeys() {
      return ErrorHandler.safeExecute(() => {
        const expandedKeys = [];
        
        // 总是展开根节点
        expandedKeys.push('root');
        
        // 验证文件夹数据并添加所有已展开的文件夹
        if (Validator.isValidArray(this.folders)) {
          this.folders.forEach(folder => {
            if (this.isValidFolderData(folder) && 
                folder.isExpanded && 
                folder.id !== 'root') {
              expandedKeys.push(folder.id);
            }
          });
        }
        
        return expandedKeys;
      }, '计算展开节点失败', ['root']);
    }
  },
  methods: {
    ...mapActions('bookmarks', [
      'sortFoldersByName',
      'deleteFolder',
      'addFolder',
      'updateFolder',
      'moveItems'
    ]),
    
    // 验证文件夹数据
    isValidFolderData(folder) {
      return folder && 
             typeof folder === 'object' &&
             Validator.isValidId(folder.id) &&
             typeof folder.name === 'string' &&
             folder.name.length <= APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME;
    },
    
    // 验证和清理文件夹名称
    validateAndSanitizeFolderName(name) {
      if (Validator.isEmpty(name)) {
        this.$message.warning('文件夹名称不能为空');
        return null;
      }
      
      if (name.length > APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME) {
        this.$message.warning(`文件夹名称不能超过${APP_CONSTANTS.TEXT_LIMITS.FOLDER_NAME}个字符`);
        return null;
      }
      
      // 清理和转义名称
      return SecurityUtils.sanitizeInput(name.trim());
    },
    
    handleNodeClick(data) {
      return ErrorHandler.safeExecute(() => {
        // 验证节点数据
        if (!this.isValidFolderData(data)) {
          this.$message.error('无效的文件夹数据');
          return;
        }
        
        // 只发送选中事件，不再手动切换展开状态
        this.$emit('folder-selected', data.id);
      }, '文件夹选择失败');
    },
    
    // 当节点展开时更新状态
    handleNodeExpand(data) {
      return ErrorHandler.safeExecute(() => {
        // 验证数据
        if (!this.isValidFolderData(data) || data.id === 'root') {
          return;
        }
        
        // 更新 Vuex 中的展开状态
        this.updateFolder({
          id: data.id,
          updates: { isExpanded: true }
        });
      }, '文件夹展开失败');
    },
    
    // 当节点折叠时更新状态
    handleNodeCollapse(data) {
      return ErrorHandler.safeExecute(() => {
        // 验证数据
        if (!this.isValidFolderData(data) || data.id === 'root') {
          return;
        }
        
        // 更新 Vuex 中的展开状态
        this.updateFolder({
          id: data.id,
          updates: { isExpanded: false }
        });
      }, '文件夹折叠失败');
    },
    
    handleCommand(command, data) {
      return ErrorHandler.safeExecute(() => {
        // 验证命令和数据
        if (!this.isValidCommand(command) || !this.isValidFolderData(data)) {
          this.$message.error('无效的操作命令或文件夹数据');
          return;
        }
        
        switch (command) {
          case 'rename':
            this.$prompt('请输入新文件夹名称', '重命名', {
              confirmButtonText: '确定',
              cancelButtonText: '取消',
              inputValue: data.name,
              inputValidator: (value) => {
                const cleanName = this.validateAndSanitizeFolderName(value);
                return cleanName !== null;
              },
              inputErrorMessage: '请输入有效的文件夹名称'
            }).then(({ value }) => {
              const cleanName = this.validateAndSanitizeFolderName(value);
              if (cleanName) {
                this.updateFolder({
                  id: data.id,
                  updates: { name: cleanName }
                });
              }
            }).catch(() => {});
            break;
            
          case 'addBookmark':
            this.$emit('add-bookmark', data.id);
            break;
            
          case 'addFolder':
            this.$prompt('请输入文件夹名称', '新建文件夹', {
              confirmButtonText: '确定',
              cancelButtonText: '取消',
              inputValidator: (value) => {
                const cleanName = this.validateAndSanitizeFolderName(value);
                return cleanName !== null;
              },
              inputErrorMessage: '请输入有效的文件夹名称'
            }).then(({ value }) => {
              const cleanName = this.validateAndSanitizeFolderName(value);
              if (cleanName) {
                this.addFolder({
                  name: cleanName,
                  parentId: data.id
                });
              }
            }).catch(() => {});
            break;
            
          case 'sortByName':
            this.sortFoldersByName(data.id);
            break;
            
          case 'customSort':
            this.$emit('custom-sort-folder', data.id);
            break;
            
          case 'delete':
            if (data.id === 'root') {
              this.$message.warning('不能删除根文件夹');
              return;
            }
            
            this.$confirm('此操作将永久删除该文件夹及其所有内容, 是否继续?', '提示', {
              confirmButtonText: '确定',
              cancelButtonText: '取消',
              type: 'warning'
            }).then(() => {
              this.deleteFolder(data.id);
              this.$emit('folder-selected', 'root');
            }).catch(() => {});
            break;
        }
      }, '文件夹操作失败');
    },
    
    // 验证命令是否合法
    isValidCommand(command) {
      const validCommands = [
        'rename', 'addBookmark', 'addFolder', 
        'sortByName', 'customSort', 'delete'
      ];
      return validCommands.includes(command);
    },
    
    showInvalidBookmarks() {
      return ErrorHandler.safeExecute(() => {
        this.$emit('show-special-folder', 'invalid');
      }, '显示失效书签失败');
    },
    
    showDuplicateBookmarks() {
      return ErrorHandler.safeExecute(() => {
        this.$emit('show-special-folder', 'duplicate');
      }, '显示重复书签失败');
    },
    
    // 拖拽相关方法
    allowDrop(draggingNode, dropNode) {
      return ErrorHandler.safeExecute(() => {
        // 验证节点数据
        if (!draggingNode || !dropNode || 
            !this.isValidFolderData(draggingNode.data) || 
            !this.isValidFolderData(dropNode.data)) {
          return false;
        }
        
        // 不允许将文件夹拖拽到自己内部（避免循环引用）
        if (draggingNode.data.id === dropNode.data.id) {
          return false;
        }
        
        // 检查是否会形成循环引用
        let parent = dropNode.parent;
        while (parent) {
          if (parent.data && parent.data.id === draggingNode.data.id) {
            return false;
          }
          parent = parent.parent;
        }
        
        // 只允许将文件夹拖拽到其他文件夹内部或前后
        return true;
      }, '拖拽验证失败', false);
    },
    
    allowDrag(node) {
      return ErrorHandler.safeExecute(() => {
        // 验证节点数据
        if (!node || !this.isValidFolderData(node.data)) {
          return false;
        }
        
        // 不允许拖拽根文件夹
        return node.data.id !== 'root';
      }, '拖拽检查失败', false);
    },
    
    handleDragStart(node) {
      return ErrorHandler.safeExecute(() => {
        if (node && this.isValidFolderData(node.data)) {
          this.draggingNode = node;
        }
      }, '开始拖拽失败');
    },
    
    handleDragEnter() {
      // 拖拽进入时的逻辑，如需使用可以添加代码
    },
    
    handleDragLeave(event) {
      return ErrorHandler.safeExecute(() => {
        // 移除拖拽样式
        if (event && event.currentTarget) {
          event.currentTarget.classList.remove('dragover');
        }
        // 移除所有可能添加的dragover样式
        document.querySelectorAll('.dragover').forEach(el => {
          el.classList.remove('dragover');
        });
      }, '拖拽离开处理失败');
    },
    
    handleDragOver() {
      // 可以添加拖拽悬停效果
    },
    
    handleDragEnd() {
      return ErrorHandler.safeExecute(() => {
        this.draggingNode = null;
        this.dropNode = null;
        // 移除所有可能添加的dragover样式
        document.querySelectorAll('.dragover').forEach(el => {
          el.classList.remove('dragover');
        });
      }, '拖拽结束处理失败');
    },
    
    handleDrop(draggingNode, dropNode, dropType) {
      return ErrorHandler.safeExecute(() => {
        // 验证拖拽数据
        if (!draggingNode || !dropNode || 
            !this.isValidFolderData(draggingNode.data) || 
            !this.isValidFolderData(dropNode.data)) {
          this.$message.error('拖拽数据无效');
          return;
        }
        
        // 处理文件夹拖拽
        if (dropType === 'inner') {
          // 拖动文件夹到另一个文件夹内部
          this.moveItems({
            itemIds: [draggingNode.data.id],
            targetFolderId: dropNode.data.id,
            itemType: 'folder'
          });
        } else {
          // 拖动文件夹到另一个文件夹前面或后面
          // 这种情况下，应该和dropNode有相同的父文件夹
          const parentId = dropNode.data.parentId;
          if (Validator.isValidId(parentId)) {
            this.moveItems({
              itemIds: [draggingNode.data.id],
              targetFolderId: parentId,
              itemType: 'folder'
            });
          }
        }
      }, '文件夹拖拽失败');
    },
    
    handleFolderDragEnter(event) {
      return ErrorHandler.safeExecute(() => {
        // 清除所有现有的高亮
        document.querySelectorAll('.dragover').forEach(el => {
          el.classList.remove('dragover');
        });
      }, '拖拽进入处理失败');
    },
    
    handleFolderDragLeave(event) {
      return ErrorHandler.safeExecute(() => {
        if (!event || !event.currentTarget) return;
        
        // 检查是否真的离开了该元素（避免子元素触发的误判）
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX;
        const y = event.clientY;
        
        // 如果鼠标位置不在当前元素范围内，则移除高亮
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          event.currentTarget.classList.remove('dragover');
        }
      }, '拖拽离开处理失败');
    },
    
    handleFolderDragOver(event) {
      return ErrorHandler.safeExecute(() => {
        if (!event) return;
        
        // 阻止默认行为以允许放置
        event.preventDefault();
        // 设置放置效果为"移动"
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        
        // 清除所有现有的高亮（确保只有当前悬停的文件夹高亮）
        document.querySelectorAll('.dragover').forEach(el => {
          if (el !== event.currentTarget) {
            el.classList.remove('dragover');
          }
        });
        
        // 添加样式以指示可放置区域
        if (event.currentTarget) {
          event.currentTarget.classList.add('dragover');
        }
      }, '拖拽悬停处理失败');
    },
    
    handleFolderDrop(event, data) {
      return ErrorHandler.safeExecute(() => {
        if (!event || !this.isValidFolderData(data)) {
          return;
        }
        
        // 阻止默认行为
        event.preventDefault();
        
        // 移除所有可能添加的样式
        document.querySelectorAll('.dragover').forEach(el => {
          el.classList.remove('dragover');
        });
        
        if (!event.dataTransfer) {
          return;
        }
        
        try {
          // 获取拖拽的数据
          const dragDataStr = event.dataTransfer.getData('application/json');
          if (!dragDataStr) return;
          
          const dragData = JSON.parse(dragDataStr);
          
          // 验证拖拽数据
          if (!dragData || typeof dragData !== 'object') {
            return;
          }
          
          // 如果是书签，则将其移动到当前文件夹
          if (dragData.type === 'bookmark' && Validator.isValidId(dragData.id)) {
            this.moveItems({
              itemIds: [dragData.id],
              targetFolderId: data.id,
              itemType: 'bookmark'
            });
            
            // 显示成功消息（使用安全化的名称）
            const safeName = SecurityUtils.escapeHtml(dragData.name || '未命名书签');
            const safeFolderName = SecurityUtils.escapeHtml(data.name || '未命名文件夹');
            this.$message({
              type: 'success',
              message: `已将书签"${safeName}"移动到"${safeFolderName}"文件夹`
            });
          }
        } catch (error) {
          DevTools.error('拖放数据处理错误:', error);
          this.$message.error('拖放操作失败');
        }
      }, '文件夹拖放处理失败');
    },
    
    // 判断是否需要完全刷新组件
    needsCompleteRefresh(newFolders, oldFolders) {
      return ErrorHandler.safeExecute(() => {
        if (!Validator.isValidArray(newFolders) || !Validator.isValidArray(oldFolders)) {
          return false;
        }
        
        // 只有在文件夹数量大幅变化时才需要完全刷新
        const sizeDiff = Math.abs(newFolders.length - oldFolders.length);
        const ratioChange = oldFolders.length > 0 ? sizeDiff / oldFolders.length : 0;
        return ratioChange > APP_CONSTANTS.LAYOUT.CHANGE_THRESHOLD; // 超过阈值才强制重渲染
      }, '刷新检查失败', false);
    },
    
    // 安全清理方法
    safeCleanup() {
      if (this.expandTimer) {
        clearTimeout(this.expandTimer);
        this.expandTimer = null;
      }
      this.draggingNode = null;
      this.dropNode = null;
    }
  },
  
  // 添加生命周期钩子清理定时器
  beforeDestroy() {
    this.safeCleanup();
  }
};
</script>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #dcdfe6;
  background-color: #ffffff;
}

.sidebar-header {
  padding: 10px 15px;
  border-bottom: 1px solid #dcdfe6;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  padding-right: 8px;
}

.folder-icon {
  margin-right: 5px;
  color: #e6a23c;
}

.actions {
  display: none;
  color: #909399;
}

.custom-tree-node:hover .actions {
  display: inline-block;
}

.sidebar-footer {
  padding: 10px;
  border-top: 1px solid #dcdfe6;
}

.special-folders {
  display: flex;
  justify-content: space-around;
}

.special-folder {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 4px;
}

.special-folder:hover {
  background-color: #f5f7fa;
}

.special-folder i {
  margin-right: 5px;
}

.dragover {
  background-color: #f0f9eb;
  border-radius: 4px;
  box-shadow: 0 0 0 2px #67c23a;
}
</style> 