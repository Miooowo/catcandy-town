<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { LogEntry } from '../core/game';
import SecretModal from './SecretModal.vue';

defineProps<{
  logs: LogEntry[];
}>();

// 输入框状态
const commandInput = ref('');
const showInput = ref(false);

// 秘籍弹窗状态
const showSecretModal = ref(false);

// 秘籍：↑↑↓↓←→←→BABA
const konamiCode = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA', 'KeyB', 'KeyA'
];
let konamiIndex = 0;
let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

// 启用调试模式
const enableDebugMode = (showSecretMessage: boolean = false) => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.setItem('debug_mode', 'true');
    // 触发storage事件，让ControlPanel更新
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'debug_mode',
      newValue: 'true',
      storageArea: localStorage
    }));
    // 直接更新（因为storage事件可能不会在同一窗口触发）
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('debug-mode-enabled');
      window.dispatchEvent(event);
    }
    
    // 如果是通过秘籍启用的，显示弹窗
    if (showSecretMessage) {
      setTimeout(() => {
        showSecretModal.value = true;
      }, 100);
    }
  }
};

// 处理指令输入
const handleCommand = () => {
  const command = commandInput.value.trim().toLowerCase();
  
  if (command === '/debug' || command === 'debug') {
    enableDebugMode();
    commandInput.value = '';
    showInput.value = false;
    return;
  }
  
  if (command === 'help' || command === '?' || command === '/help') {
    // 显示帮助信息（隐藏debug指令）
    console.log('可用指令：');
    console.log('  /help - 显示帮助信息');
    commandInput.value = '';
    showInput.value = false;
    return;
  }
  
  // 未知指令
  commandInput.value = '';
  showInput.value = false;
};

// 处理键盘事件
const handleKeyPress = (e: KeyboardEvent) => {
  // 如果输入框显示，不处理秘籍
  if (showInput.value) {
    return;
  }
  
  // 检测秘籍输入
  if (e.code === konamiCode[konamiIndex]) {
    konamiIndex++;
    
    if (konamiIndex === konamiCode.length) {
      enableDebugMode(true); // 通过秘籍启用，显示弹窗
      konamiIndex = 0;
      console.log('🎮 秘籍已激活！调试模式已启用');
    }
  } else {
    konamiIndex = 0;
    if (e.code === konamiCode[0]) {
      konamiIndex = 1;
    }
  }
  
  // 检测是否按下 / 键来显示输入框
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    showInput.value = true;
    // 下一帧聚焦输入框
    setTimeout(() => {
      const input = document.querySelector('.command-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 0);
  }
};

// 根据日志类型获取样式类
const getLogClass = (type: string) => {
  if (!type) return 'log-default';
  return `log-${type}`;
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    handleKeyDown = handleKeyPress;
    window.addEventListener('keydown', handleKeyDown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined' && handleKeyDown !== null) {
    window.removeEventListener('keydown', handleKeyDown);
  }
});
</script>

<template>
  <div class="log-panel">
    <div class="log-header">
      <h3 class="log-title">📜 游戏日志</h3>
      <button 
        v-if="!showInput" 
        @click="showInput = true" 
        class="command-toggle"
        title="输入指令 (按 / 键)"
      >
        💬
      </button>
    </div>
    
    <div v-if="showInput" class="command-input-wrapper">
      <input
        v-model="commandInput"
        @keydown.enter="handleCommand"
        @keydown.esc="showInput = false; commandInput = ''"
        @blur="showInput = false; commandInput = ''"
        class="command-input"
        placeholder="输入指令 或按 ESC 取消"
        autofocus
      />
    </div>
    
    <div class="log-list">
      <div v-for="log in logs" :key="log.id" class="log-item" :class="getLogClass(log.type)">
        <span class="time">[{{ log.time }}]</span>
        <span class="msg">{{ log.message }}</span>
      </div>
    </div>
    
    <!-- 秘籍弹窗 -->
    <SecretModal 
      :visible="showSecretModal"
      @close="showSecretModal = false"
    />
  </div>
</template>

<style scoped>
.log-panel {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  font-family: monospace;
  padding: 8px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  transition: background-color 0.3s ease;
}

@media (min-width: 768px) {
  .log-panel {
    padding: 10px;
  }
}

:global(.dark-mode) .log-panel {
  background: rgba(0, 0, 0, 0.9);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

@media (min-width: 768px) {
  .log-header {
    margin-bottom: 8px;
  }
}

.log-title {
  font-size: 12px;
  font-weight: bold;
  margin: 0;
  color: #74b9ff;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .log-title {
    font-size: 14px;
  }
}

:global(.dark-mode) .log-title {
  color: #74b9ff;
}

.command-toggle {
  background: rgba(116, 185, 255, 0.2);
  border: 1px solid rgba(116, 185, 255, 0.4);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #74b9ff;
  transition: all 0.2s ease;
}

.command-toggle:hover {
  background: rgba(116, 185, 255, 0.3);
  border-color: rgba(116, 185, 255, 0.6);
}

.command-input-wrapper {
  margin-bottom: 8px;
}

.command-input {
  width: 100%;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(116, 185, 255, 0.4);
  border-radius: 4px;
  color: #dfe6e9;
  font-family: monospace;
  font-size: 11px;
  outline: none;
  transition: all 0.2s ease;
}

.command-input:focus {
  background: rgba(255, 255, 255, 0.15);
  border-color: #74b9ff;
}

.command-input::placeholder {
  color: rgba(223, 230, 233, 0.5);
}

:global(.dark-mode) .command-input {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(116, 185, 255, 0.5);
  color: #e0e0e0;
}

:global(.dark-mode) .command-input:focus {
  background: rgba(0, 0, 0, 0.4);
  border-color: #74b9ff;
}

.log-list {
  overflow-y: auto;
  flex: 1;
}

.log-item {
  font-size: 10px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
  line-height: 1.4;
  transition: border-color 0.3s ease;
  word-break: break-word;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (min-width: 768px) {
  .log-item {
    font-size: 12px;
    display: block;
  }
}

:global(.dark-mode) .log-item {
  border-bottom-color: rgba(255, 255, 255, 0.15);
}

.time {
  color: #74b9ff;
  opacity: 0.8;
  margin-right: 6px;
  transition: color 0.3s ease, opacity 0.3s ease;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .time {
    margin-right: 8px;
  }
}

:global(.dark-mode) .time {
  color: #74b9ff;
  opacity: 0.9;
}

/* 默认日志样式 */
.msg {
  color: #dfe6e9;
  transition: color 0.3s ease;
  flex: 1;
  min-width: 0;
}

:global(.dark-mode) .msg {
  color: #e0e0e0;
}

/* 不同类型的日志颜色 */
.log-item.log-build .msg {
  color: #00b894;
  font-weight: 500;
}

:global(.dark-mode) .log-item.log-build .msg {
  color: #00d4aa;
}

.log-item.log-reject .msg {
  color: #a29bfe;
  font-weight: bold;
}

:global(.dark-mode) .log-item.log-reject .msg {
  color: #b8b0ff;
}

.log-item.log-drama .msg {
  color: #fdcb6e;
  font-weight: bold;
}

:global(.dark-mode) .log-item.log-drama .msg {
  color: #ffd93d;
}

.log-item.log-venue .msg {
  color: #81ecec;
  font-style: italic;
}

:global(.dark-mode) .log-item.log-venue .msg {
  color: #a0f0f0;
}

.log-item.log-love .msg {
  color: #ff7675;
}

:global(.dark-mode) .log-item.log-love .msg {
  color: #ff8e8d;
}

.log-item.log-info .msg {
  color: #74b9ff;
}

:global(.dark-mode) .log-item.log-info .msg {
  color: #8bc5ff;
}

.log-item.log-event .msg {
  color: #55efc4;
}

:global(.dark-mode) .log-item.log-event .msg {
  color: #6dffd4;
}

.log-item.log-system .msg {
  color: #a29bfe;
  font-weight: 500;
}

:global(.dark-mode) .log-item.log-system .msg {
  color: #b8b0ff;
}

.log-item.log-error .msg {
  color: #ff7675;
  font-weight: bold;
}

:global(.dark-mode) .log-item.log-error .msg {
  color: #ff8e8d;
}

/* 默认类型（无type或空type） */
.log-item.log-default .msg {
  color: #dfe6e9;
}

:global(.dark-mode) .log-item.log-default .msg {
  color: #e0e0e0;
}
</style>
