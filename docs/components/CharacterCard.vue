<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Character } from '../core/character';
import { gameInstance } from '../core/game';

const props = defineProps<{
  char: Character;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

// 计算样式
const cardClass = computed(() => {
  if (props.char.currentAction.includes('工作')) return 'border-l-yellow';
  if (props.char.currentAction.includes('睡觉')) return 'border-l-gray';
  return 'border-l-red';
});

// 计算进度条宽度
const hpWidth = computed(() => `${props.char.happiness}%`);
const sexualDesireWidth = computed(() => `${props.char.sexualDesire || 0}%`);

// 获取工作信息
const jobInfo = computed(() => {
  if (props.char.prostitute) {
    const building = gameInstance.state.buildings.find(b => b.id === props.char.prostitute!.buildingId);
    return { text: `💋 卖银者`, building: building?.name || '未知', hasJob: true };
  }
  if (props.char.job) {
    const building = gameInstance.state.buildings.find(b => b.id === props.char.job!.buildingId);
    return { text: props.char.job.role, building: building?.name || '未知', hasJob: true };
  }
  return { text: '无业', building: '', hasJob: false };
});

const handleClick = () => {
  emit('click');
};

// 城镇名称缓存
const townNamesCache = ref<Record<string, string>>({});
const currentTownName = ref<string>('');

// 获取城镇名称（多人模式）
const getTownName = (townId: string): string => {
  if (townNamesCache.value[townId]) {
    return townNamesCache.value[townId];
  }
  
  // 如果是当前城镇，使用游戏状态中的城镇名称
  if (townId && typeof window !== 'undefined') {
    import('../core/network').then(({ networkManager }) => {
      const currentTownId = networkManager.getCurrentTownId();
      if (townId === currentTownId) {
        townNamesCache.value[townId] = gameInstance.state.townName;
        currentTownName.value = gameInstance.state.townName;
        return;
      }
      
      // 从网络管理器获取其他城镇名称
      const towns = networkManager.getTowns();
      const town = towns.find(t => t.townId === townId);
      if (town) {
        townNamesCache.value[townId] = town.townName;
      }
    }).catch(() => {});
  }
  
  return townNamesCache.value[townId] || townId;
};

// 监听角色当前城镇变化
watch(() => props.char.currentTown, (newTownId) => {
  if (newTownId) {
    getTownName(newTownId);
  }
}, { immediate: true });

let townNameUpdateInterval: number | null = null;

onMounted(() => {
  // 定期更新城镇名称缓存
  if (typeof window !== 'undefined' && props.char.currentTown) {
    townNameUpdateInterval = window.setInterval(() => {
      getTownName(props.char.currentTown!);
    }, 5000);
  }
});

onUnmounted(() => {
  if (townNameUpdateInterval) {
    clearInterval(townNameUpdateInterval);
    townNameUpdateInterval = null;
  }
});
</script>

<template>
  <div class="char-card" :class="cardClass" @click="handleClick">
    <div class="char-header">
      <div class="char-name-section">
        <strong class="char-name">{{ char.name }}</strong>
        <span class="personality-badge">
          {{ char.personality.name }}
        </span>
      </div>
      <div class="char-money">💰{{ char.money }}</div>
    </div>

    <div v-if="char.traits && char.traits.length > 0" class="traits-section">
      <span 
        v-for="trait in char.traits" 
        :key="trait.id" 
        class="trait-badge"
        :title="trait.desc"
      >
        {{ trait.name }}
      </span>
    </div>

    <div v-if="jobInfo.hasJob" class="job-info">
      <span class="job-text">💼 {{ jobInfo.text }}</span>
      <span class="job-building">{{ jobInfo.building }}</span>
    </div>
    <div v-else class="job-info no-job">
      <span class="job-text">💼 {{ jobInfo.text }}</span>
    </div>

    <div class="hp-bar-container">
      <div class="hp-bar-fill" :style="{ width: hpWidth }"></div>
    </div>

    <div v-if="char.hasTrait('promiscuous')" class="sexual-desire-bar-container">
      <div class="sexual-desire-bar-fill" :style="{ width: sexualDesireWidth }"></div>
      <span class="sexual-desire-label">🔞 {{ char.sexualDesire || 0 }}</span>
    </div>

    <div class="char-action">{{ char.currentAction }}</div>
    <div v-if="char.currentTown && char.homeTown && char.currentTown !== char.homeTown" class="travel-info">
      🚶 在 {{ getTownName(char.currentTown) }} 旅行
    </div>
  </div>
</template>

<style scoped>
.char-card {
  padding: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-left: 4px solid;
  transition: all 0.2s ease;
  min-width: 0;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

@media (min-width: 768px) {
  .char-card {
    padding: 12px;
  }
}

:global(.dark-mode) .char-card {
  background: #2d2d2d;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.char-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.char-card:active {
  transform: translateY(-2px);
}

.border-l-yellow {
  border-left-color: #fbbf24;
}

.border-l-gray {
  border-left-color: #d1d5db;
}

.border-l-red {
  border-left-color: #f87171;
}

.char-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.char-name-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.char-name {
  color: #1f2937;
  font-size: 12px;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .char-name {
    font-size: 14px;
  }
}

:global(.dark-mode) .char-name {
  color: #e5e5e5;
}

.personality-badge {
  font-size: 9px;
  background: #f3f4f6;
  padding: 2px 4px;
  border-radius: 4px;
  color: #6b7280;
  transition: background-color 0.3s ease, color 0.3s ease;
}

@media (min-width: 768px) {
  .personality-badge {
    font-size: 10px;
    padding: 2px 6px;
  }
}

:global(.dark-mode) .personality-badge {
  background: #404040;
  color: #b0b0b0;
}

.traits-section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  margin-bottom: 6px;
}

.trait-badge {
  font-size: 9px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  cursor: help;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.trait-badge:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.4);
}

:global(.dark-mode) .trait-badge {
  background: linear-gradient(135deg, #7c8ef0 0%, #8a5fb8 100%);
}

.job-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 6px;
  font-size: 11px;
  flex-wrap: wrap;
}

.job-text {
  color: #3498db;
  font-weight: 500;
  transition: color 0.3s ease;
}

:global(.dark-mode) .job-text {
  color: #5dade2;
}

.job-building {
  color: #6b7280;
  font-size: 10px;
  transition: color 0.3s ease;
}

:global(.dark-mode) .job-building {
  color: #9ca3af;
}

.job-info.no-job .job-text {
  color: #9ca3af;
}

:global(.dark-mode) .job-info.no-job .job-text {
  color: #6b7280;
}

.char-money {
  font-size: 11px;
  font-weight: bold;
  color: #f97316;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .char-money {
    font-size: 12px;
  }
}

.hp-bar-container {
  height: 4px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
  margin: 8px 0;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .hp-bar-container {
  background: #404040;
}

.hp-bar-fill {
  height: 100%;
  background: #f87171;
  transition: width 0.3s ease;
}

.sexual-desire-bar-container {
  height: 4px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
  margin: 6px 0;
  position: relative;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .sexual-desire-bar-container {
  background: #404040;
}

.sexual-desire-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ec4899 0%, #f472b6 100%);
  transition: width 0.3s ease;
}

.sexual-desire-label {
  position: absolute;
  top: 50%;
  left: 4px;
  transform: translateY(-50%);
  font-size: 9px;
  color: white;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  z-index: 1;
}

.char-action {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s ease;
}

:global(.dark-mode) .char-action {
  color: #b0b0b0;
}
</style>
