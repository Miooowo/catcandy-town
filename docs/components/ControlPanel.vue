<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { gameInstance } from '../core/game';
import { BUILDINGS_BLUEPRINT } from '../data/blueprints';
import { GAME_VERSION } from '../data/changelog';

// Update to use state.townMoney (原始游戏使用 townMoney 而不是 resources)
const townMoney = computed(() => gameInstance.state.townMoney);
const timeSpeed = computed(() => gameInstance.state.timeSpeed);

// 时间速度相关
const speedDisplay = computed(() => `${timeSpeed.value}x`);
const customSpeedInput = ref(timeSpeed.value.toString());

const updateTimeSpeed = (value: number) => {
  gameInstance.updateTimeSpeed(value);
  customSpeedInput.value = value.toString();
};

const updateTimeSpeedCustom = () => {
  const speed = parseFloat(customSpeedInput.value);
  if (!isNaN(speed)) {
    updateTimeSpeed(speed);
  }
};

// 存档相关
const importFileInput = ref<HTMLInputElement | null>(null);

const handleExportSave = () => {
  gameInstance.exportSave();
};

const handleImportSave = () => {
  importFileInput.value?.click();
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    gameInstance.importSave(file);
    // 清空文件输入，以便可以重复选择同一文件
    target.value = '';
  }
};

const handleReset = () => {
  gameInstance.resetData();
};

const handleCreateCharacter = () => {
  gameInstance.createNewCharacter();
};

// 关系谱相关
const emit = defineEmits<{
  (e: 'show-relationship-tree'): void;
  (e: 'show-changelog'): void;
  (e: 'show-customization'): void;
}>();

const handleShowRelationshipTree = () => {
  emit('show-relationship-tree');
};

const handleShowChangelog = () => {
  emit('show-changelog');
};

const handleShowCustomization = () => {
  emit('show-customization');
};

const build = (id: string) => {
  // 原始游戏不需要位置参数，只需要建筑ID
  // TODO: 实现建筑建设逻辑
  gameInstance.log(`尝试建设 ${id}...`, 'build');
};

// 从父组件获取暗色模式状态
const isDarkMode = inject<{ value: boolean }>('isDarkMode', ref({ value: false }));
const toggleDarkMode = inject<() => void>('toggleDarkMode', () => {});
</script>

<template>
  <div class="control-panel">
    <div class="resources">
      <div class="res-item town-name-item" @click="handleShowCustomization" title="点击自定义城镇名称">
        <span class="res-name">🏘️ 城镇:</span>
        <span class="res-value">{{ gameInstance.state.townName || '猫果镇' }}</span>
      </div>
      <div class="res-item">
        <span class="res-name">💰 镇库:</span>
        <span class="res-value">{{ townMoney }}</span>
      </div>
      <div class="res-item">
        <span class="res-name">📅 游戏日:</span>
        <span class="res-value">{{ gameInstance.state.totalDaysPassed }}</span>
      </div>
      <div class="res-item">
        <span class="res-name">🕒 时间:</span>
        <span class="res-value">{{ gameInstance.formatTime(gameInstance.state.gameTime) }}</span>
      </div>
      <div class="res-item version-item" @click="handleShowChangelog" title="查看更新日志">
        <span class="res-name">版本:</span>
        <span class="res-value version-value">v{{ GAME_VERSION }}</span>
      </div>
    </div>
    <div class="actions">
      <div class="time-speed-control">
        <label class="speed-label">⏱️ 时间速度:</label>
        <input 
          type="range" 
          :min="0.5" 
          :max="20" 
          :step="0.5" 
          :value="timeSpeed"
          @input="updateTimeSpeed(parseFloat(($event.target as HTMLInputElement).value))"
          class="speed-slider"
        />
        <span class="speed-display">{{ speedDisplay }}</span>
        <input 
          type="number" 
          :min="0.1" 
          :max="1000" 
          :step="0.1" 
          v-model="customSpeedInput"
          @change="updateTimeSpeedCustom"
          @blur="updateTimeSpeedCustom"
          class="speed-custom"
          placeholder="自定义"
        />
      </div>
      
      <div class="button-group">
        <button @click="toggleDarkMode" class="theme-toggle" :title="isDarkMode.value ? '切换到亮色模式' : '切换到暗色模式'">
          {{ isDarkMode.value ? '🌙' : '☀️' }}
        </button>
        <button @click="gameInstance.start()" v-if="!gameInstance.state.isPlaying" class="btn-start">▶ 开始</button>
        <button @click="gameInstance.stop()" v-else class="btn-pause">⏸ 暂停</button>
        <button @click="gameInstance.manualSave()" class="btn-save">💾 存档</button>
        <button @click="handleExportSave" class="btn-export">📥 导出</button>
        <button @click="handleImportSave" class="btn-import">📤 导入</button>
        <button @click="handleCreateCharacter" class="btn-add-char" title="添加新角色">➕ 添加角色</button>
        <button @click="handleShowRelationshipTree" class="btn-relationship" title="查看关系谱">👥 关系谱</button>
        <button @click="handleShowChangelog" class="btn-changelog" title="查看更新日志">📋 更新日志</button>
        <button @click="handleShowCustomization" class="btn-customization" title="自定义城镇和居民">⚙️ 自定义</button>
        <button @click="handleReset" class="btn-reset" title="重置游戏到初始状态">🗑 重置</button>
        <input 
          ref="importFileInput"
          type="file" 
          accept=".json" 
          @change="handleFileChange"
          style="display: none;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  padding: 8px;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

@media (min-width: 768px) {
  .control-panel {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    gap: 15px;
  }
}

:global(.dark-mode) .control-panel {
  background: #2d2d2d;
  border-bottom-color: #404040;
  color: #e5e5e5;
}

.resources {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

@media (min-width: 768px) {
  .resources {
    gap: 15px;
  }
}

.res-item {
  font-weight: bold;
  color: #1a1a1a;
  transition: color 0.3s ease;
  font-size: 12px;
}

@media (min-width: 768px) {
  .res-item {
    font-size: 14px;
  }
}

.res-name {
  color: #333;
  font-weight: 600;
}

.res-value {
  color: #000;
  font-weight: 700;
}

:global(.dark-mode) .res-item {
  color: #e5e5e5;
}

:global(.dark-mode) .res-name {
  color: #d1d5db;
}

:global(.dark-mode) .res-value {
  color: #ffffff;
}

.version-item,
.town-name-item {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.version-item:hover,
.town-name-item:hover {
  opacity: 0.8;
}

.version-value {
  color: #667eea !important;
  font-weight: 700;
  transition: color 0.3s ease;
}

:global(.dark-mode) .version-value {
  color: #8b7ef0 !important;
}

.actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .actions {
    gap: 15px;
  }
}

.time-speed-control {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .time-speed-control {
    gap: 8px;
    font-size: 0.85rem;
    flex-wrap: nowrap;
  }
}

.speed-label {
  white-space: nowrap;
  color: #666;
  transition: color 0.3s ease;
  font-size: 11px;
}

@media (min-width: 768px) {
  .speed-label {
    font-size: 0.85rem;
  }
}

:global(.dark-mode) .speed-label {
  color: #b0b0b0;
}

.speed-slider {
  width: 60px;
  cursor: pointer;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .speed-slider {
    width: 100px;
  }
}

.speed-display {
  min-width: 30px;
  font-weight: bold;
  color: #4a90e2;
  transition: color 0.3s ease;
  font-size: 11px;
}

@media (min-width: 768px) {
  .speed-display {
    min-width: 35px;
    font-size: 0.85rem;
  }
}

:global(.dark-mode) .speed-display {
  color: #5a9ae2;
}

.speed-custom {
  width: 50px;
  padding: 2px 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.75rem;
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

@media (min-width: 768px) {
  .speed-custom {
    width: 60px;
    font-size: 0.85rem;
  }
}

:global(.dark-mode) .speed-custom {
  background: #404040;
  border-color: #555;
  color: #e5e5e5;
}

.button-group {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .button-group {
    gap: 8px;
  }
}

button {
  padding: 6px 8px;
  cursor: pointer;
  border: 1px solid #ddd;
  background: #f5f5f5;
  border-radius: 4px;
  transition: all 0.2s ease;
  font-size: 11px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  min-height: 32px;
}

@media (min-width: 768px) {
  button {
    padding: 5px 10px;
    font-size: 14px;
    min-height: auto;
  }
}

button:hover {
  background: #e5e5e5;
}

button:active {
  transform: scale(0.95);
}

.theme-toggle {
  font-size: 16px;
  padding: 4px 6px;
  min-width: 32px;
}

@media (min-width: 768px) {
  .theme-toggle {
    font-size: 18px;
    padding: 4px 8px;
    min-width: 36px;
  }
}

:global(.dark-mode) button {
  background: #404040;
  border-color: #555;
  color: #e5e5e5;
}

:global(.dark-mode) button:hover {
  background: #505050;
}

.btn-export {
  background: #3498db !important;
  color: white !important;
  border-color: #2980b9 !important;
}

.btn-export:hover {
  background: #2980b9 !important;
}

.btn-import {
  background: #9b59b6 !important;
  color: white !important;
  border-color: #8e44ad !important;
}

.btn-import:hover {
  background: #8e44ad !important;
}

.btn-start {
  background: #27ae60 !important;
  color: white !important;
  border-color: #229954 !important;
}

.btn-start:hover {
  background: #229954 !important;
}

.btn-pause {
  background: #f39c12 !important;
  color: white !important;
  border-color: #e67e22 !important;
}

.btn-pause:hover {
  background: #e67e22 !important;
}

.btn-save {
  background: #27ae60 !important;
  color: white !important;
  border-color: #229954 !important;
}

.btn-save:hover {
  background: #229954 !important;
}

.btn-reset {
  background: #e74c3c !important;
  color: white !important;
  border-color: #c0392b !important;
}

.btn-reset:hover {
  background: #c0392b !important;
}

.btn-add-char {
  background: #16a085 !important;
  color: white !important;
  border-color: #138d75 !important;
}

.btn-add-char:hover {
  background: #138d75 !important;
}

.btn-relationship {
  background: #8e44ad !important;
  color: white !important;
  border-color: #7d3c98 !important;
}

.btn-relationship:hover {
  background: #7d3c98 !important;
}

.btn-changelog {
  background: #667eea !important;
  color: white !important;
  border-color: #5568d3 !important;
}

.btn-changelog:hover {
  background: #5568d3 !important;
}

.btn-customization {
  background: #16a085 !important;
  color: white !important;
  border-color: #138d75 !important;
}

.btn-customization:hover {
  background: #138d75 !important;
}
</style>
