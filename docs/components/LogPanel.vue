<script setup lang="ts">
import { computed } from 'vue';
import type { LogEntry } from '../core/game';

defineProps<{
  logs: LogEntry[];
}>();

// 根据日志类型获取样式类
const getLogClass = (type: string) => {
  if (!type) return 'log-default';
  return `log-${type}`;
};
</script>

<template>
  <div class="log-panel">
    <h3 class="log-title">📜 游戏日志</h3>
    <div class="log-list">
      <div v-for="log in logs" :key="log.id" class="log-item" :class="getLogClass(log.type)">
        <span class="time">[{{ log.time }}]</span>
        <span class="msg">{{ log.message }}</span>
      </div>
    </div>
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

.log-title {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 6px;
  color: #74b9ff;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .log-title {
    font-size: 14px;
    margin-bottom: 8px;
  }
}

:global(.dark-mode) .log-title {
  color: #74b9ff;
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
