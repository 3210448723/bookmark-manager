<template>
  <el-dialog
    title="添加书签"
    :visible="visible"
    width="500px"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="form" label-width="80px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name"></el-input>
      </el-form-item>
      <el-form-item label="URL" prop="url">
        <el-input v-model="form.url"></el-input>
      </el-form-item>
      <el-form-item label="描述">
        <el-input type="textarea" v-model="form.description"></el-input>
      </el-form-item>
      <el-form-item label="文件夹">
        <el-select v-model="form.folderId" placeholder="请选择文件夹">
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
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit">确定</el-button>
    </span>
  </el-dialog>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';

export default {
  name: 'AddBookmarkDialog',
  props: {
    visible: {
      type: Boolean,
      required: true
    },
    initialFolderId: {
      type: String,
      default: 'root'
    }
  },
  data() {
    return {
      form: {
        name: '',
        url: '',
        description: '',
        folderId: this.initialFolderId
      },
      rules: {
        name: [
          { required: true, message: '请输入书签名称', trigger: 'blur' }
        ],
        url: [
          { required: true, message: '请输入URL', trigger: 'blur' },
          { type: 'url', message: '请输入正确的URL格式', trigger: 'blur' }
        ]
      }
    };
  },
  computed: {
    ...mapState({
      folders: state => state.bookmarks.folders
    }),
    ...mapGetters('bookmarks', [
      'getFolderPath'
    ]),
    folderOptions() {
      // 构建所有文件夹的扁平列表，包含路径信息
      const result = [];
      
      const traverse = (folder) => {
        // 获取当前文件夹的路径
        const path = this.getFolderPath(folder.id);
        const label = path.map(f => f.name).join(' / ');
        
        result.push({
          id: folder.id,
          label
        });
        
        // 递归处理子文件夹
        const children = this.folders.filter(f => f.parentId === folder.id);
        children.forEach(traverse);
      };
      
      // 从根文件夹开始遍历
      const rootFolder = this.folders.find(f => f.id === 'root');
      if (rootFolder) {
        traverse(rootFolder);
      }
      
      return result;
    }
  },
  watch: {
    initialFolderId(val) {
      this.form.folderId = val;
    },
    visible(val) {
      if (val) {
        // 重置表单
        this.form = {
          name: '',
          url: '',
          description: '',
          folderId: this.initialFolderId
        };
        // 自动填充当前页面的标题和URL（可以由父组件传入或在浏览器插件中获取）
        this.tryGetCurrentPage();
      }
    }
  },
  methods: {
    ...mapActions('bookmarks', [
      'addBookmark'
    ]),
    handleClose() {
      this.$emit('update:visible', false);
    },
    handleSubmit() {
      this.$refs.form.validate((valid) => {
        if (valid) {
          // 添加书签
          this.addBookmark(this.form);
          
          // 关闭对话框
          this.$emit('update:visible', false);
          
          // 显示成功消息
          this.$message({
            type: 'success',
            message: '添加书签成功!'
          });
        } else {
          return false;
        }
      });
    },
    tryGetCurrentPage() {
      // 在浏览器插件中，可以获取当前页面的信息
      // 在独立Web应用中，此功能无效
      try {
        if (window.chrome && window.chrome.tabs) {
          window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
              this.form.name = tabs[0].title || '';
              this.form.url = tabs[0].url || '';
            }
          });
        }
      } catch (e) {
        console.log('Not in a browser extension context');
      }
    }
  }
};
</script> 