<script setup lang="ts">
import { computed, ref } from 'vue';
import { gameInstance } from '../core/game';
import type { Character } from '../core/character';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

const activeTab = ref<'economy' | 'social'>('economy');

// 经济榜：日均工资排行
const dailySalaryRanking = computed(() => {
  const chars = gameInstance.state.chars.map(char => {
    const workIncome = char.incomeStats?.work || 0;
    const daysWorked = gameInstance.state.totalDaysPassed || 1;
    const avgDailySalary = daysWorked > 0 ? workIncome / daysWorked : 0;
    return {
      name: char.name,
      value: Math.floor(avgDailySalary),
      character: char
    };
  }).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  
  return chars;
});

// 经济榜：个人账户排行
const moneyRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => ({
      name: char.name,
      value: char.money,
      character: char
    }))
    .sort((a, b) => b.value - a.value);
});

// 经济榜：摸鱼排行（被抓到摸鱼次数最多）
const slackingRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => {
      const totalSlacks = Object.values(char.slackingOffCount || {}).reduce((sum, count) => sum + count, 0);
      return {
        name: char.name,
        value: totalSlacks,
        character: char
      };
    })
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);
});

// 社交榜：吵架次数排行
const fightRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => ({
      name: char.name,
      value: char.fightCount || 0,
      character: char
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);
});

// 社交榜：睡觉时间排行
const sleepRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => ({
      name: char.name,
      value: Math.floor(char.totalSleepTime || 0),
      character: char
    }))
    .sort((a, b) => b.value - a.value);
});

// 社交榜：扣录榜（扣扣/鹿观次数排行）
const masturbationRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => ({
      name: char.name,
      value: char.masturbationCount || 0,
      character: char
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);
});

// 社交榜：打炮榜（与炮友或情人交欢次数排行）
const sexRanking = computed(() => {
  return gameInstance.state.chars
    .map(char => ({
      name: char.name,
      value: char.sexCount || 0,
      character: char
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);
});

// 获取排名图标
const getRankIcon = (index: number) => {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}.`;
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="rankings-page">
      <div class="rankings-header">
        <h1>📊 小镇榜单</h1>
        <button class="modal-close" @click="close">×</button>
      <div class="tabs">
        <button 
          :class="{ active: activeTab === 'economy' }" 
          @click="activeTab = 'economy'"
          class="tab-btn"
        >
          💰 经济榜
        </button>
        <button 
          :class="{ active: activeTab === 'social' }" 
          @click="activeTab = 'social'"
          class="tab-btn"
        >
          👥 社交榜
        </button>
      </div>
    </div>

    <div class="rankings-content">
      <!-- 经济榜 -->
      <div v-if="activeTab === 'economy'" class="rankings-section">
        <div class="ranking-category">
          <h2>💼 日均工资排行</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in dailySalaryRanking" 
              :key="`salary-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">💰{{ item.value }}/天</span>
            </div>
            <div v-if="dailySalaryRanking.length === 0" class="no-data">
              暂无数据
            </div>
          </div>
        </div>

        <div class="ranking-category">
          <h2>💵 个人账户排行</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in moneyRanking" 
              :key="`money-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">💰{{ item.value }}</span>
            </div>
          </div>
        </div>

        <div class="ranking-category">
          <h2>😴 摸鱼排行（被抓次数）</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in slackingRanking" 
              :key="`slack-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">😴 {{ item.value }}次</span>
            </div>
            <div v-if="slackingRanking.length === 0" class="no-data">
              暂无数据（还没有人被抓住摸鱼）
            </div>
          </div>
        </div>
      </div>

      <!-- 社交榜 -->
      <div v-if="activeTab === 'social'" class="rankings-section">
        <div class="ranking-category">
          <h2>💢 主动吵架次数排行</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in fightRanking" 
              :key="`fight-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">💢 {{ item.value }}次</span>
            </div>
            <div v-if="fightRanking.length === 0" class="no-data">
              暂无数据（还没有人吵架）
            </div>
          </div>
        </div>

        <div class="ranking-category">
          <h2>😴 睡觉时间排行</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in sleepRanking" 
              :key="`sleep-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">😴 {{ item.value }}小时</span>
            </div>
          </div>
        </div>

        <div class="ranking-category">
          <h2>🔞 扣录榜（扣扣/鹿观次数）</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in masturbationRanking" 
              :key="`masturbation-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">🔞 {{ item.value }}次</span>
            </div>
            <div v-if="masturbationRanking.length === 0" class="no-data">
              暂无数据（还没有人扣扣或鹿观）
            </div>
          </div>
        </div>

        <div class="ranking-category">
          <h2>💋 打炮榜（交欢次数）</h2>
          <div class="ranking-list">
            <div 
              v-for="(item, index) in sexRanking" 
              :key="`sex-${item.name}`"
              class="ranking-item"
            >
              <span class="rank-number">{{ getRankIcon(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-value">💋 {{ item.value }}次</span>
            </div>
            <div v-if="sexRanking.length === 0" class="no-data">
              暂无数据（还没有人打炮）
            </div>
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
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rankings-page {
  background: white;
  border-radius: 12px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  position: relative;
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

.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
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

.rankings-page {
  padding: 20px;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .rankings-page {
  background: #2d2d2d;
  color: #e5e5e5;
}

.rankings-header {
  margin-bottom: 20px;
  position: relative;
}

.rankings-header h1 {
  font-size: 28px;
  margin-bottom: 20px;
  color: #1f2937;
}

:global(.dark-mode) .rankings-header h1 {
  color: #e5e5e5;
}

.tabs {
  display: flex;
  gap: 10px;
  border-bottom: 2px solid #e5e7eb;
}

:global(.dark-mode) .tabs {
  border-bottom-color: #404040;
}

.tab-btn {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: #1f2937;
  background: #f3f4f6;
}

:global(.dark-mode) .tab-btn:hover {
  color: #e5e5e5;
  background: #2d2d2d;
}

.tab-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
  font-weight: 600;
}

:global(.dark-mode) .tab-btn.active {
  color: #60a5fa;
  border-bottom-color: #60a5fa;
}

.rankings-content {
  max-width: 1200px;
  margin: 0 auto;
}

.rankings-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
}

.ranking-category {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

:global(.dark-mode) .ranking-category {
  background: #2d2d2d;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.ranking-category h2 {
  font-size: 18px;
  margin-bottom: 15px;
  color: #1f2937;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 10px;
}

:global(.dark-mode) .ranking-category h2 {
  color: #e5e5e5;
  border-bottom-color: #404040;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

:global(.dark-mode) .ranking-item {
  background: #1a1a1a;
}

.ranking-item:hover {
  background: #f3f4f6;
}

:global(.dark-mode) .ranking-item:hover {
  background: #2a2a2a;
}

.rank-number {
  font-weight: bold;
  font-size: 16px;
  min-width: 40px;
  text-align: center;
  color: #6b7280;
}

:global(.dark-mode) .rank-number {
  color: #9ca3af;
}

.rank-name {
  flex: 1;
  font-weight: 500;
  color: #1f2937;
}

:global(.dark-mode) .rank-name {
  color: #e5e5e5;
}

.rank-value {
  font-weight: 600;
  color: #3b82f6;
  font-size: 14px;
}

:global(.dark-mode) .rank-value {
  color: #60a5fa;
}

.no-data {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-style: italic;
}

:global(.dark-mode) .no-data {
  color: #6b7280;
}
</style>

