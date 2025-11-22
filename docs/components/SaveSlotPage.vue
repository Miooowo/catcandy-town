<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { gameInstance } from '../core/game';

const emit = defineEmits<{
  (e: 'select-slot', slot: number): void;
  (e: 'new-game', slot?: number): void;
}>();

// 存档槽位数量
const SLOT_COUNT = 5;
const slots = ref<Array<{ hasSave: boolean; saveTime?: string; townName?: string; days?: number }>>([]);

// 加载存档信息
const loadSlotInfo = () => {
  slots.value = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const saveKey = `happyTownV2_Save_Slot${i}`;
    const saveStr = localStorage.getItem(saveKey);
    
    if (saveStr) {
      try {
        const data = JSON.parse(saveStr);
        slots.value.push({
          hasSave: true,
          saveTime: data.saveTime ? new Date(data.saveTime).toLocaleString('zh-CN') : '未知时间',
          townName: data.townName || '未知城镇',
          days: data.totalDaysPassed || 0
        });
      } catch (e) {
        slots.value.push({ hasSave: false });
      }
    } else {
      slots.value.push({ hasSave: false });
    }
  }
};

// 选择存档槽位
const selectSlot = (slot: number) => {
  emit('select-slot', slot);
};

// 新建游戏（可以选择槽位）
const newGame = (slot?: number) => {
  emit('new-game', slot);
};

onMounted(() => {
  loadSlotInfo();
});
</script>

<template>
  <div class="save-slot-page">
    <div class="save-slot-content">
      <div class="save-slot-header">
        <h1 class="page-title">🐱 猫果镇物语</h1>
        <p class="page-subtitle">选择存档槽位或开始新游戏</p>
      </div>
      
      <div class="slots-grid">
        <div 
          v-for="(slot, index) in slots" 
          :key="index"
          class="slot-card"
          :class="{ 'has-save': slot.hasSave, 'empty': !slot.hasSave }"
          @click="selectSlot(index + 1)"
        >
          <div class="slot-number">存档槽位 {{ index + 1 }}</div>
          <div v-if="slot.hasSave" class="slot-info">
            <div class="slot-town-name">🏘️ {{ slot.townName }}</div>
            <div class="slot-days">📅 游戏日: {{ slot.days }}</div>
            <div class="slot-time">{{ slot.saveTime }}</div>
          </div>
          <div v-else class="slot-empty">
            <div class="empty-icon">📭</div>
            <div class="empty-text">空存档</div>
          </div>
        </div>
      </div>
      
      <div class="save-slot-footer">
        <button @click="newGame" class="btn-new-game">
          🎮 新建游戏
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.save-slot-page {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  padding: 20px;
  overflow-y: auto;
}

:global(.dark-mode) .save-slot-page {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.save-slot-content {
  background: white;
  border-radius: 20px;
  padding: 30px;
  max-width: 1000px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.4s ease;
}

@media (min-width: 768px) {
  .save-slot-content {
    padding: 40px;
  }
}

:global(.dark-mode) .save-slot-content {
  background: #2d2d2d;
  color: #e5e5e5;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.save-slot-header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 3px solid #4a90e2;
}

.page-title {
  font-size: 2rem;
  margin: 0 0 10px 0;
  color: #333;
  font-weight: bold;
}

@media (min-width: 768px) {
  .page-title {
    font-size: 2.5rem;
  }
}

:global(.dark-mode) .page-title {
  color: #e5e5e5;
}

.page-subtitle {
  font-size: 0.9rem;
  color: #666;
  margin: 0;
}

@media (min-width: 768px) {
  .page-subtitle {
    font-size: 1rem;
  }
}

:global(.dark-mode) .page-subtitle {
  color: #bbb;
}

.slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

@media (min-width: 768px) {
  .slots-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.slot-card {
  background: #f8f9fa;
  border: 2px solid #ddd;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.slot-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  border-color: #4a90e2;
}

.slot-card.has-save {
  background: #e8f4f8;
  border-color: #4a90e2;
}

.slot-card.empty {
  background: #f5f5f5;
  border-color: #ccc;
}

:global(.dark-mode) .slot-card {
  background: #1a1a1a;
  border-color: #555;
}

:global(.dark-mode) .slot-card.has-save {
  background: #1a2332;
  border-color: #5a9ae2;
}

:global(.dark-mode) .slot-card.empty {
  background: #1a1a1a;
  border-color: #404040;
}

.slot-number {
  font-size: 1rem;
  font-weight: bold;
  color: #4a90e2;
  margin-bottom: 10px;
}

:global(.dark-mode) .slot-number {
  color: #5a9ae2;
}

.slot-info {
  width: 100%;
  text-align: center;
}

.slot-town-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

:global(.dark-mode) .slot-town-name {
  color: #e5e5e5;
}

.slot-days {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 5px;
}

:global(.dark-mode) .slot-days {
  color: #bbb;
}

.slot-time {
  font-size: 0.75rem;
  color: #999;
}

:global(.dark-mode) .slot-time {
  color: #888;
}

.slot-empty {
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 10px;
  opacity: 0.5;
}

.empty-text {
  font-size: 0.9rem;
  color: #999;
}

:global(.dark-mode) .empty-text {
  color: #666;
}

.save-slot-footer {
  text-align: center;
  padding-top: 20px;
  border-top: 2px solid #eee;
}

:global(.dark-mode) .save-slot-footer {
  border-top-color: #444;
}

.btn-new-game {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 15px 50px;
  border-radius: 12px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-new-game:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.btn-new-game:active {
  transform: translateY(-1px);
}

@media (min-width: 768px) {
  .btn-new-game {
    padding: 18px 60px;
    font-size: 1.4rem;
  }
}
</style>

