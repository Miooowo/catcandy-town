import DefaultTheme from 'vitepress/theme'
import GameLayout from '../../components/GameLayout.vue'
import './custom.css' // Optional, but good practice

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('GameLayout', GameLayout)
  }
}

