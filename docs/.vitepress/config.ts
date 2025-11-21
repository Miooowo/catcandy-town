import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "猫果镇物语",
  description: "一款挂机放置类模拟游戏，以旁观者视角观察小镇居民的日常生活",
  head: [
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes' }],
    ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }]
  ],
  vite: {
    css: {
      postcss: {}
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '开始游戏', link: '/play' },
      { text: '小镇榜单', link: '/rankings' },
      { text: '游戏指南', link: '/guide/intro' }
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '游戏介绍', link: '/guide/intro' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})

