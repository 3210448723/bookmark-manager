module.exports = {
  presets: [
    [
      '@vue/cli-plugin-babel/preset',
      {
        // 自动检测和引入polyfills
        useBuiltIns: 'usage',
        corejs: 3,
        // 目标浏览器
        targets: {
          browsers: ['> 1%', 'last 2 versions', 'not dead']
        }
      }
    ]
  ],
  plugins: [
    // 按需引入Element UI
    [
      'component',
      {
        libraryName: 'element-ui',
        styleLibraryName: 'theme-chalk'
      }
    ]
  ],
  // 环境特定配置
  env: {
    development: {
      // 开发环境保留函数名，便于调试
      compact: false,
      sourceMaps: true
    },
    production: {
      // 生产环境优化
      compact: true,
      sourceMaps: false,
      // 移除console
      plugins: [
        [
          'transform-remove-console',
          {
            exclude: ['error', 'warn']
          }
        ]
      ]
    }
  }
}
