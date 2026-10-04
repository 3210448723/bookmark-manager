# Bookmark Manager 完成清单

- [x] 大量书签列表采用分页 + `VirtualList`，并对 favicon 使用 `IntersectionObserver` 懒加载。
- [x] 搜索结果使用安全的 Vue 表格展示；点击“定位”会切换到所属文件夹、翻到目标页并滚动到目标书签。
- [x] 自定义排序支持函数体/箭头函数，保存可序列化的排序函数历史，并用前后顺序快照支持撤销/重做和刷新恢复。
- [x] 分页根据视口宽度切换布局，分页区域可换行且不会贴出内容区边缘。
- [x] 每次导入创建独立根分组，导入文件夹和书签均重新生成唯一 ID，不按同名文件夹或 URL 合并。
- [x] 面包屑支持点击跳转、后退/前进和最近访问路径快捷跳转。
- [x] 核心状态、导入批次、排序函数和虚拟列表补充中文注释、JSDoc 与可执行类型检查。
- [x] `npm test`、`npm run typecheck`、`npm run lint` 和 `npm run build` 均通过。
- [x] 深色模式切换与持久化主题偏好。
- [x] 选定书签健康度探测，保存 HTTP 状态/错误并对不可达书签标红。
- [x] 批量移动、添加标签、导出选中书签。
- [x] Chrome/Edge/Firefox HTML 与 JSON 书签格式双向转换。

## 验证入口

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
