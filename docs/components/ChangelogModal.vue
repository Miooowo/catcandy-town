<script setup lang="ts">
import { computed } from 'vue';
import { CHANGELOG, GAME_VERSION } from '../data/changelog';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

// 格式化日期显示（支持带时间的格式）
const formatDate = (dateStr: string) => {
  // 支持多种日期格式
  // 格式1: 2025/11/21 21:00
  // 格式2: 2025-11-21 20:52
  // 格式3: 2025-11-21
  
  // 如果包含时间（有空格和冒号）
  if (dateStr.includes(' ') && dateStr.includes(':')) {
    // 直接返回，已经是友好格式
    return dateStr.replace(/-/g, '/');
  }
  
  // 尝试解析标准日期格式
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }
  
  // 如果无法解析，直接返回原字符串
  return dateStr;
};

// 按版本号倒序排列（最新的在前）
const sortedChangelog = computed(() => {
  return [...CHANGELOG].reverse();
});
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="changelog-modal-content">
      <div class="changelog-header">
        <h3>📋 更新日志</h3>
        <div class="version-badge">v{{ GAME_VERSION }}</div>
        <button class="modal-close" @click="close">×</button>
      </div>
      
      <div class="changelog-content">
        <div 
          v-for="entry in sortedChangelog" 
          :key="entry.version" 
          class="changelog-entry"
        >
          <div class="entry-header">
            <span class="entry-version">v{{ entry.version }}</span>
            <span class="entry-date">{{ formatDate(entry.date) }}</span>
          </div>
          
          <div v-if="entry.added && entry.added.length > 0" class="entry-section">
            <div class="section-title added">✨ 新增</div>
            <ul class="section-list">
              <li v-for="(item, index) in entry.added" :key="index">{{ item }}</li>
            </ul>
          </div>
          
          <div v-if="entry.changed && entry.changed.length > 0" class="entry-section">
            <div class="section-title changed">🔄 变更</div>
            <ul class="section-list">
              <li v-for="(item, index) in entry.changed" :key="index">{{ item }}</li>
            </ul>
          </div>
          
          <div v-if="entry.fixed && entry.fixed.length > 0" class="entry-section">
            <div class="section-title fixed">🐛 修复</div>
            <ul class="section-list">
              <li v-for="(item, index) in entry.fixed" :key="index">{{ item }}</li>
            </ul>
          </div>
          
          <div v-if="entry.removed && entry.removed.length > 0" class="entry-section">
            <div class="section-title removed">🗑️ 移除</div>
            <ul class="section-list">
              <li v-for="(item, index) in entry.removed" :key="index">{{ item }}</li>
            </ul>
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
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.2s ease;
  padding: 10px;
}

@media (min-width: 768px) {
  .modal-overlay {
    padding: 0;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.changelog-modal-content {
  background: white;
  padding: 16px;
  border-radius: 12px;
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  transition: background-color 0.3s ease;
}

@media (min-width: 768px) {
  .changelog-modal-content {
    padding: 30px;
    width: 90%;
    max-height: 85vh;
  }
}

:global(.dark-mode) .changelog-modal-content {
  background: #2d2d2d;
  color: #e5e5e5;
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

.changelog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 3px solid #4a90e2;
  gap: 12px;
  flex-wrap: wrap;
}

.changelog-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
  transition: color 0.3s ease;
  flex: 1;
}

@media (min-width: 768px) {
  .changelog-header h3 {
    font-size: 1.5rem;
  }
}

:global(.dark-mode) .changelog-header h3 {
  color: #e5e5e5;
}

:global(.dark-mode) .changelog-header {
  border-bottom-color: #5a9ae2;
}

.version-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
}

@media (min-width: 768px) {
  .version-badge {
    font-size: 14px;
    padding: 6px 16px;
  }
}

.modal-close {
  cursor: pointer;
  font-size: 1.5rem;
  color: #999;
  background: none;
  border: none;
  padding: 0;
  width: 32px;
  height: 32px;
  transition: color 0.2s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #333;
}

:global(.dark-mode) .modal-close {
  color: #999;
}

:global(.dark-mode) .modal-close:hover {
  background: #404040;
  color: #e5e5e5;
}

.changelog-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.changelog-entry {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #4a90e2;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

@media (min-width: 768px) {
  .changelog-entry {
    padding: 20px;
  }
}

:global(.dark-mode) .changelog-entry {
  background: #1a1a1a;
  border-left-color: #5a9ae2;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.entry-version {
  font-size: 1.1rem;
  font-weight: bold;
  color: #4a90e2;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .entry-version {
    font-size: 1.3rem;
  }
}

:global(.dark-mode) .entry-version {
  color: #5a9ae2;
}

.entry-date {
  font-size: 0.9rem;
  color: #6b7280;
  transition: color 0.3s ease;
}

:global(.dark-mode) .entry-date {
  color: #b0b0b0;
}

.entry-section {
  margin-bottom: 16px;
}

.entry-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 0.95rem;
  font-weight: bold;
  margin-bottom: 8px;
  padding: 4px 0;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .section-title {
    font-size: 1.1rem;
  }
}

.section-title.added {
  color: #27ae60;
}

.section-title.changed {
  color: #3498db;
}

.section-title.fixed {
  color: #f39c12;
}

.section-title.removed {
  color: #e74c3c;
}

:global(.dark-mode) .section-title.added {
  color: #58d68d;
}

:global(.dark-mode) .section-title.changed {
  color: #5dade2;
}

:global(.dark-mode) .section-title.fixed {
  color: #f7dc6f;
}

:global(.dark-mode) .section-title.removed {
  color: #ec7063;
}

.section-list {
  margin: 0;
  padding-left: 20px;
  list-style-type: disc;
}

.section-list li {
  margin-bottom: 6px;
  line-height: 1.6;
  color: #333;
  font-size: 0.9rem;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .section-list li {
    font-size: 1rem;
  }
}

:global(.dark-mode) .section-list li {
  color: #e5e5e5;
}

.section-list li:last-child {
  margin-bottom: 0;
}
</style>

