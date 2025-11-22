<script setup lang="ts">
import { ref } from 'vue';
import { gameInstance } from '../core/game';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

// 跳天数选项
const jumpDaysOptions = [5, 10, 14, 30, 60, 90, 180, 360];

const jumpDays = (days: number) => {
  if (confirm(`确定要跳过 ${days} 天吗？这将快速推进游戏时间。`)) {
    gameInstance.jumpDays(days);
  }
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="debug-panel">
      <div class="debug-header">
        <h2>🔧 调试面板</h2>
        <button class="modal-close" @click="close">×</button>
      </div>
      
      <div class="debug-content">
        <div class="debug-section">
          <h3>⏰ 快速跳天数</h3>
          <p class="debug-hint">快速推进游戏时间，跳过指定天数</p>
          <div class="jump-days-grid">
            <button
              v-for="days in jumpDaysOptions"
              :key="days"
              @click="jumpDays(days)"
              class="jump-days-btn"
            >
              +{{ days }}天
            </button>
          </div>
        </div>
        
        <div class="debug-section">
          <h3>📊 当前状态</h3>
          <div class="debug-info">
            <div class="info-item">
              <span class="info-label">游戏日:</span>
              <span class="info-value">{{ gameInstance.state.totalDaysPassed }} 天</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前时间:</span>
              <span class="info-value">{{ gameInstance.formatTime(gameInstance.state.gameTime) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">星期:</span>
              <span class="info-value">{{ ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][gameInstance.state.gameDay] }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">居民数:</span>
              <span class="info-value">{{ gameInstance.state.chars.length }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.debug-panel {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

:global(.dark-mode) .debug-panel {
  background: #2d2d2d;
  color: #e5e5e5;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
}

:global(.dark-mode) .debug-header {
  border-bottom-color: #404040;
}

.debug-header h2 {
  margin: 0;
  font-size: 20px;
  color: #1f2937;
}

:global(.dark-mode) .debug-header h2 {
  color: #e5e5e5;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.modal-close:hover {
  background: #f0f0f0;
}

:global(.dark-mode) .modal-close {
  color: #ccc;
}

:global(.dark-mode) .modal-close:hover {
  background: #3d3d3d;
}

.debug-content {
  padding: 20px;
}

.debug-section {
  margin-bottom: 24px;
}

.debug-section:last-child {
  margin-bottom: 0;
}

.debug-section h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #1f2937;
}

:global(.dark-mode) .debug-section h3 {
  color: #e5e5e5;
}

.debug-hint {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: #6b7280;
}

:global(.dark-mode) .debug-hint {
  color: #9ca3af;
}

.jump-days-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.jump-days-btn {
  padding: 12px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.jump-days-btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.jump-days-btn:active {
  transform: translateY(0);
}

:global(.dark-mode) .jump-days-btn {
  background: #60a5fa;
}

:global(.dark-mode) .jump-days-btn:hover {
  background: #3b82f6;
}

.debug-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
}

:global(.dark-mode) .info-item {
  background: #404040;
}

.info-label {
  font-weight: 500;
  color: #6b7280;
}

:global(.dark-mode) .info-label {
  color: #9ca3af;
}

.info-value {
  font-weight: 600;
  color: #1f2937;
}

:global(.dark-mode) .info-value {
  color: #e5e5e5;
}

@media (max-width: 640px) {
  .jump-days-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

