<script setup lang="ts">
import { computed } from 'vue';
import { Building } from '../core/building';
import { gameInstance } from '../core/game';

const props = defineProps<{
  build: Building;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const handleClick = () => {
  emit('click');
};

const progressPercent = computed(() => {
  if (props.build.isBuilt) return 100;
  return Math.floor((props.build.currentProgress / props.build.totalCost) * 100);
});

const cardClass = computed(() => {
  if (props.build.isBuilt) return 'built';
  if (props.build.currentProgress > 0) return 'building';
  return '';
});

// 计算升级费用
const upgradeCost = computed(() => {
  if (!props.build.isBuilt) return 0;
  return Math.floor((props.build.totalCost || 0) * 0.5 * (props.build.level || 1));
});

// 计算升级进度百分比
const upgradeProgressPercent = computed(() => {
  if (!props.build.isBuilt || upgradeCost.value === 0) return 0;
  const companyFunds = props.build.companyFunds || 0;
  const progress = Math.min(100, Math.floor((companyFunds / upgradeCost.value) * 100));
  return progress;
});

// 格式化营业时间
const operatingHours = computed(() => {
  if (!props.build) return '';
  const open = props.build.open || 0;
  const close = props.build.close || 24;
  
  if (open === 0 && close === 24) {
    return '24小时营业';
  }
  
  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };
  
  if (close < open) {
    // 跨夜营业，如 18:00-2:00
    return `${formatHour(open)} - ${formatHour(close)} (次日)`;
  }
  
  return `${formatHour(open)} - ${formatHour(close)}`;
});

// 判断建筑是否在营业
const isOperating = computed(() => {
  if (!props.build.isBuilt) return false;
  const currentHour = Math.floor(gameInstance.state.gameTime / 60);
  const currentDay = gameInstance.state.gameDay;
  return props.build.isOpen(currentHour, currentDay);
});

// 获取营业状态文本
const operatingStatus = computed(() => {
  if (!props.build.isBuilt) return '';
  if (isOperating.value) {
    return '🟢 营业中';
  } else {
    return '🔴 休息中';
  }
});
</script>

<template>
  <div class="building-card" :class="cardClass" @click="handleClick">
    <div class="building-icon">{{ build.name.split(' ')[0] }}</div>
    <div class="building-info">
      <div class="building-name">{{ build.name }}</div>
      <div class="building-desc">{{ build.desc }}</div>
      <div v-if="build.isBuilt" class="building-hours">
        🕒 {{ operatingHours }}
      </div>
      <div v-if="!build.isBuilt" class="build-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-text">{{ progressPercent }}% ({{ build.currentProgress }}/{{ build.totalCost }})</div>
      </div>
      <div v-else class="building-status" :class="{ 'status-open': isOperating, 'status-closed': !isOperating }">
        {{ operatingStatus }}
      </div>
      <div v-if="build.isBuilt" class="building-level-info">
        <div class="level-header">
          <span class="level-badge">⭐ {{ build.level || 1 }} 级</span>
          <span v-if="build.staff.length > 0" class="company-funds">💰{{ build.companyFunds || 0 }}</span>
        </div>
        <div v-if="build.staff.length > 0" class="upgrade-progress">
          <div class="upgrade-progress-bar">
            <div class="upgrade-progress-fill" :style="{ width: upgradeProgressPercent + '%' }"></div>
          </div>
          <div class="upgrade-progress-text">
            {{ upgradeProgressPercent }}% ({{ build.companyFunds || 0 }}/{{ upgradeCost }})
          </div>
        </div>
      </div>
      <div v-if="build.jobs.length > 0" class="building-jobs">
        岗位: {{ build.jobs.join(', ') }} ({{ build.staff.length }}/{{ build.jobs.length }})
      </div>
    </div>
  </div>
</template>

<style scoped>
.building-card {
  background: white;
  border: 1px dashed #ccc;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  opacity: 0.6;
  filter: grayscale(1);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

@media (min-width: 768px) {
  .building-card {
    padding: 12px;
    gap: 12px;
  }
}

:global(.dark-mode) .building-card {
  background: #2d2d2d;
  border-color: #555;
}

.building-card.built {
  opacity: 1;
  filter: grayscale(0);
  border: 1px solid #27ae60;
  background: #f0fff4;
}

:global(.dark-mode) .building-card.built {
  background: #1a3a2a;
}

.building-card.building {
  opacity: 0.9;
  filter: grayscale(0.5);
  border: 1px solid #e67e22;
}

.building-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.building-card:active {
  transform: translateY(0);
}

.building-icon {
  font-size: 24px;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .building-icon {
    font-size: 32px;
  }
}

.building-info {
  flex: 1;
  min-width: 0;
}

.building-name {
  font-weight: bold;
  color: #1f2937;
  font-size: 12px;
  margin-bottom: 4px;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .building-name {
    font-size: 14px;
  }
}

:global(.dark-mode) .building-name {
  color: #e5e5e5;
}

.building-desc {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  transition: color 0.3s ease;
}

:global(.dark-mode) .building-desc {
  color: #b0b0b0;
}

.building-hours {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
  transition: color 0.3s ease;
}

:global(.dark-mode) .building-hours {
  color: #b0b0b0;
}

.build-progress {
  margin-top: 8px;
}

.progress-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .progress-bar {
  background: #404040;
}

.progress-fill {
  height: 100%;
  background: #27ae60;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #6b7280;
  transition: color 0.3s ease;
}

:global(.dark-mode) .progress-text {
  color: #b0b0b0;
}

.building-status {
  font-size: 11px;
  font-weight: bold;
  margin-top: 4px;
  transition: color 0.3s ease;
}

.building-status.status-open {
  color: #27ae60;
}

.building-status.status-closed {
  color: #e74c3c;
}

:global(.dark-mode) .building-status.status-open {
  color: #58d68d;
}

:global(.dark-mode) .building-status.status-closed {
  color: #ec7063;
}

.building-jobs {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
  transition: color 0.3s ease;
}

:global(.dark-mode) .building-jobs {
  color: #888;
}

.building-level-info {
  margin-top: 8px;
}

.level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.level-badge {
  font-size: 12px;
  font-weight: bold;
  color: #3498db;
  background: rgba(52, 152, 219, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

:global(.dark-mode) .level-badge {
  color: #5dade2;
  background: rgba(52, 152, 219, 0.2);
}

.company-funds {
  font-size: 11px;
  color: #27ae60;
  font-weight: 600;
  transition: color 0.3s ease;
}

:global(.dark-mode) .company-funds {
  color: #58d68d;
}

.upgrade-progress {
  margin-top: 4px;
}

.upgrade-progress-bar {
  height: 5px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 3px;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .upgrade-progress-bar {
  background: #404040;
}

.upgrade-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db 0%, #2980b9 100%);
  transition: width 0.3s ease;
  border-radius: 3px;
}

.upgrade-progress-text {
  font-size: 10px;
  color: #6b7280;
  transition: color 0.3s ease;
}

:global(.dark-mode) .upgrade-progress-text {
  color: #b0b0b0;
}
</style>
