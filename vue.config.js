const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  
  // 动态配置publicPath
  // 本地开发: '/' (http://localhost:8080)
  // GitHub Pages: 自动从仓库名获取 (如 /bookmark-manager/)
  // 其他部署环境: 可通过环境变量 PUBLIC_PATH 自定义
  publicPath: process.env.NODE_ENV === 'production' 
    ? (process.env.PUBLIC_PATH || `/${process.env.GITHUB_REPOSITORY?.split('/')[1] || 'bookmark-manager'}/`)
    : '/',
  
  // 性能优化配置
  configureWebpack: config => {
    // 生产环境优化
    if (process.env.NODE_ENV === 'production') {
      // 代码分割优化
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              priority: 10,
              chunks: 'all',
            },
            elementUI: {
              test: /[\\/]node_modules[\\/]element-ui[\\/]/,
              name: 'element-ui',
              priority: 20,
              chunks: 'all',
            },
            common: {
              name: 'common',
              minChunks: 2,
              priority: 5,
              chunks: 'all',
              enforce: true
            }
          }
        }
      }
    }
  },
  
  // 开发服务器配置
  devServer: {
    port: 8080,
    hot: true,
    compress: true,
    // 性能优化
    client: {
      overlay: {
        warnings: false,
        errors: true
      }
    }
  },
  
  // CSS配置
  css: {
    // 生产环境提取CSS
    extract: process.env.NODE_ENV === 'production',
    // 启用CSS source map
    sourceMap: process.env.NODE_ENV !== 'production'
  },
  
  // 生产环境优化
  productionSourceMap: false,
  
  // PWA配置（如果需要）
  pwa: {
    name: 'Vue2 Bookmark Manager',
    themeColor: '#409EFF',
    msTileColor: '#000000',
    appleMobileWebAppCapable: 'yes',
    appleMobileWebAppStatusBarStyle: 'black',
    
    // 配置workbox插件
    workboxPluginMode: 'InjectManifest',
    workboxOptions: {
      swSrc: 'src/sw.js',
    }
  }
})
