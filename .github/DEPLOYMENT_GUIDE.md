# GitHub Pages 部署指南

## 🌐 访问URL（自动生成）

### 本地开发环境
```bash
npm run serve
# 访问: http://localhost:8080
```

### 生产环境（GitHub Pages）
- **部署条件**: 仅在创建Release时部署
- **主要URL**: GitHub会自动生成并在工作流日志中显示
- **备用URL**: https://3210448723.github.io/bookmark-manager/

## 🔧 publicPath 自动配置

项目现在支持多种部署环境：

1. **本地开发**: `publicPath: '/'` → `http://localhost:8080`
2. **GitHub Pages**: `publicPath: '/仓库名/'` → 自动从 `GITHUB_REPOSITORY` 获取
3. **自定义部署**: 通过环境变量 `PUBLIC_PATH` 自定义

```javascript
// vue.config.js 中的智能配置
publicPath: process.env.NODE_ENV === 'production' 
  ? (process.env.PUBLIC_PATH || `/${process.env.GITHUB_REPOSITORY?.split('/')[1] || 'bookmark-manager'}/`)
  : '/'
```

## 🤖 GitHub Actions 用户信息说明

### 为什么移除了 user_name 和 user_email？

1. **peaceiris/actions-gh-pages** action 会自动使用合适的用户信息
2. **默认行为**: 如果不指定，会使用推送代码的用户信息
3. **更简洁**: 减少硬编码，让 GitHub 自动处理

### 之前的配置解释
```yaml
user_name: github-actions[bot]
user_email: 41898282+github-actions[bot]@users.noreply.github.com
```

- `github-actions[bot]`: GitHub官方机器人账号名称
- `41898282`: GitHub Actions 机器人的用户ID
- `@users.noreply.github.com`: GitHub的无回复邮箱域名

### 现在的优化
- 让 action 自动处理用户信息
- 支持使用实际推送者的身份
- 减少配置复杂性

## 🚀 部署方式（仅Release时部署）

### ⭐ Release部署（唯一部署方式）
1. **创建Release**:
   ```bash
   # 方式1: 通过GitHub网页
   # 访问: https://github.com/3210448723/bookmark-manager/releases
   # 点击 "Create a new release"
   
   # 方式2: 通过git标签
   git tag v1.0.0
   git push origin v1.0.0
   # 然后在GitHub上基于这个标签创建Release
   ```

2. **填写Release信息**:
   - **Tag version**: v1.0.0 (或其他版本号)
   - **Release title**: Release v1.0.0
   - **Description**: 描述此次发布的更新内容

3. **发布Release**:
   - 点击 "Publish release"
   - GitHub Actions会自动触发构建和部署流程

### 📋 部署流程说明

1. **触发条件**: 只有创建并发布Release时才会部署
2. **构建流程**: lint → build → release → deploy
3. **部署目标**: GitHub Pages (gh-pages分支)

### 🔄 日常开发流程

```bash
# 日常开发 - 只会触发lint和build，不会部署
git add .
git commit -m "feat: 添加新功能"
git push origin master

# 准备发布 - 创建Release才会部署到GitHub Pages
git tag v1.0.1
git push origin v1.0.1
# 然后在GitHub创建Release
```

## 📊 查看部署URL

部署完成后，在GitHub Actions日志中查看：
- `🚀 Deployment successful!`
- `📄 Site URL: [GitHub生成的实际URL]`
- `📄 Alternative URL: [备用URL]`

## 🔍 故障排除

1. **404错误**: 等待GitHub Pages缓存更新（通常1-5分钟）
2. **路径问题**: 检查 `publicPath` 配置是否正确
3. **权限问题**: 确保仓库启用了GitHub Pages
4. **未部署**: 确认是否创建了Release（普通push不会触发部署）

## ⚠️ 重要提醒

- **部署触发**: 只有创建Release时才会部署到GitHub Pages
- **日常开发**: 推送到master分支只会运行lint、build和CodeQL，不会部署
- **版本管理**: 建议使用语义化版本号 (如 v1.0.0, v1.1.0, v2.0.0)

## 🌍 多环境支持

### 本地开发
```bash
npm run serve
# 自动使用 http://localhost:8080
```

### 预览构建
```bash
npm run build
npx serve dist
# 本地预览生产版本
```

### 自定义部署
```bash
PUBLIC_PATH=/my-custom-path/ npm run build
# 自定义公共路径
```
