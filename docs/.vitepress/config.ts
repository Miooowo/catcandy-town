import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "猫果镇物语",
  description: "一款挂机放置类模拟游戏，以旁观者视角观察小镇居民的日常生活",
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

