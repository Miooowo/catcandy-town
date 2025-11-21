<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../core/character';
import { gameInstance } from '../core/game';

const props = defineProps<{
  character: Character | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

// 计算性格颜色
const personalityColor = computed(() => {
  if (!props.character) return '#999';
  const name = props.character.personality.name;
  if (name === '易怒' || name === '刻薄') return '#e74c3c';
  if (name === '开朗' || name === '温柔' || name === '幽默') return '#27ae60';
  if (name === '沉着') return '#3498db';
  return '#999';
});

// 获取工作信息
const jobInfo = computed(() => {
  if (!props.character) return null;
  if (props.character.prostitute) {
    const building = gameInstance.state.buildings.find(b => b.id === props.character!.prostitute!.buildingId);
    return { type: 'prostitute', text: `💋 卖银者 (${building ? building.name : '未知'})`, color: '#e74c3c' };
  }
  if (props.character.job) {
    const building = gameInstance.state.buildings.find(b => b.id === props.character!.job!.buildingId);
    return { type: 'job', text: `${props.character.job.role} (${building ? building.name : '未知'})`, color: '#333' };
  }
  return { type: 'none', text: '无业', color: '#999' };
});

// 获取主要关系（好感度>30或非陌生人）
const mainRelations = computed(() => {
  if (!props.character) return [];
  return Object.entries(props.character.relationships)
    .map(([name, data]) => ({ name, ...data }))
    .filter(r => r.love > 30 || r.status !== 'stranger')
    .sort((a, b) => b.love - a.love)
    .slice(0, 5);
});

// 获取关系状态文本和颜色
const getRelationStatus = (status: string) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    'spouse': { text: '配偶', color: '#e84393' },
    'lover': { text: '情侣', color: '#ff7675' },
    'mistress': { text: '小三', color: '#ff8c00' },
    'fwb': { text: '炮友', color: '#ec4899' },
    'bestfriend': { text: '挚友', color: '#3498db' },
    'ex': { text: '前任', color: '#636e72' },
    'friend': { text: '朋友', color: '#74b9ff' }
  };
  return statusMap[status] || { text: '陌生人', color: '#999' };
};

// 怀孕剩余天数
const pregnancyDaysLeft = computed(() => {
  if (!props.character?.pregnant) return 0;
  const daysLeft = Math.max(0, Math.ceil((props.character.pregnant.dueDate - gameInstance.getAbsoluteTime()) / 1440));
  return daysLeft;
});

// 获取孩子年龄
const getChildAge = (childName: string) => {
  const child = gameInstance.state.chars.find(c => c.name === childName);
  if (!child) return '（已离开）';
  if (!child.birthTime) return '新生儿';
  const age = Math.floor((gameInstance.state.gameTime - child.birthTime) / 1440);
  return age > 0 ? `${age}天` : '新生儿';
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="profile-modal-content">
      <div class="profile-header">
        <h3>👤 {{ character?.name }} 的个人档案</h3>
        <button class="modal-close" @click="close">×</button>
      </div>
      
      <div class="profile-content" v-if="character">
        <!-- 基本信息 -->
        <div class="profile-section">
          <h4>📋 基本信息</h4>
          <div class="profile-stats-grid">
            <div class="profile-stat-item">
              <div class="profile-stat-value">{{ character.happiness }}</div>
              <div class="profile-stat-label">心情值</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-value">💰{{ character.money }}</div>
              <div class="profile-stat-label">金钱</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-value">{{ character.credibility }}</div>
              <div class="profile-stat-label">可信度</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-value">{{ character.currentAction || '发呆' }}</div>
              <div class="profile-stat-label">当前状态</div>
            </div>
            <div v-if="character.hasTrait('promiscuous')" class="profile-stat-item">
              <div class="profile-stat-value">🔞 {{ character.sexualDesire || 0 }}</div>
              <div class="profile-stat-label">性欲值</div>
            </div>
          </div>
          <div v-if="character.hasTrait('promiscuous')" class="sexual-desire-display" style="margin-top: 12px;">
            <div class="profile-label" style="margin-bottom: 6px;">性欲值：</div>
            <div class="sexual-desire-bar-wrapper">
              <div class="sexual-desire-bar-bg">
                <div 
                  class="sexual-desire-bar-fill" 
                  :style="{ width: `${character.sexualDesire || 0}%` }"
                ></div>
              </div>
              <span class="sexual-desire-text">{{ character.sexualDesire || 0 }}/100</span>
            </div>
            <div v-if="character.isRelieving" class="sexual-desire-status" style="margin-top: 6px; font-size: 12px; color: #ec4899;">
              🔞 正在发泄性欲{{ character.relievingWith ? `（与 ${character.relievingWith} 一起）` : '' }}
            </div>
            <div v-if="character.fwbList && character.fwbList.length > 0" class="fwb-list" style="margin-top: 8px;">
              <div class="profile-label" style="margin-bottom: 4px; font-size: 12px;">炮友列表：</div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <span 
                  v-for="fwbName in character.fwbList" 
                  :key="fwbName"
                  class="fwb-badge"
                >
                  💋 {{ fwbName }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 性格与特性 -->
        <div class="profile-section">
          <h4>🎭 性格与特性</h4>
          <div class="profile-row">
            <span class="profile-label">性格：</span>
            <span class="profile-value" :style="{ color: personalityColor }">
              {{ character.personality.name }}
            </span>
          </div>
          <div class="profile-row">
            <span class="profile-label">性格描述：</span>
            <span class="profile-value">{{ character.personality.desc }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">特性：</span>
            <span class="profile-value" :style="{ color: character.traits.length > 0 ? '#333' : '#999' }">
              {{ character.traits.length > 0 ? character.traits.map(t => t.name).join('、') : '无' }}
            </span>
          </div>
        </div>

        <!-- 工作状态 -->
        <div class="profile-section">
          <h4>💼 工作状态</h4>
          <div class="profile-row">
            <span class="profile-label">职业：</span>
            <span class="profile-value" :style="{ color: jobInfo?.color }">
              {{ jobInfo?.text }}
            </span>
          </div>
        </div>

        <!-- 关系状态 -->
        <div class="profile-section">
          <h4>❤️ 关系状态</h4>
          <div class="profile-row">
            <span class="profile-label">伴侣：</span>
            <span class="profile-value" :style="{ color: character.partner ? '#ff6b6b' : '#999' }">
              {{ character.partner ? `❤ ${character.partner}` : '单身' }}
            </span>
          </div>
          <div v-if="mainRelations.length > 0" style="margin-top: 10px;">
            <div class="profile-label" style="margin-bottom: 8px;">主要关系：</div>
            <div class="profile-relations">
              <div v-for="rel in mainRelations" :key="rel.name" class="profile-relation-item">
                <span>
                  <span :style="{ color: getRelationStatus(rel.status).color, fontWeight: 'bold' }">
                    {{ getRelationStatus(rel.status).text }}
                  </span>
                  {{ rel.name }}
                </span>
                <span style="color: #666;">❤{{ rel.love }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 怀孕与家庭 -->
        <div class="profile-section">
          <h4>👶 怀孕与家庭</h4>
          <div class="profile-row">
            <span class="profile-label">怀孕状态：</span>
            <span class="profile-value" :style="{ color: character.pregnant ? '#e74c3c' : '#999' }">
              {{ character.pregnant 
                ? `🤰 已怀孕（父亲：${character.pregnant.father}，约${pregnancyDaysLeft}天后分娩）`
                : '未怀孕' }}
            </span>
          </div>
          <div class="profile-row">
            <span class="profile-label">避孕用品：</span>
            <span class="profile-value">💊 {{ character.contraceptives || 0 }} 个</span>
          </div>
          <div v-if="character.children && character.children.length > 0" style="margin-top: 10px;">
            <div class="profile-label" style="margin-bottom: 8px;">孩子：</div>
            <div v-for="childName in character.children" :key="childName" class="profile-row">
              <span class="profile-label">👶 {{ childName }}</span>
              <span class="profile-value" style="color: #666;">{{ getChildAge(childName) }}</span>
            </div>
          </div>
          <div v-else class="profile-row">
            <span class="profile-label">孩子：</span>
            <span class="profile-value" style="color: #999;">无</span>
          </div>
          <div v-if="character.parents" class="profile-row" style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px;">
            <span class="profile-label">父母：</span>
            <span class="profile-value">👨 {{ character.parents.father }} & 👩 {{ character.parents.mother }}</span>
          </div>
        </div>

        <!-- 收入统计 -->
        <div class="profile-section">
          <h4>💰 收入统计</h4>
          <div class="profile-row">
            <span class="profile-label">工作收入：</span>
            <span class="profile-value">💰{{ character.incomeStats.work }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">零工收入：</span>
            <span class="profile-value">💰{{ character.incomeStats.oddJob }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">站街收入：</span>
            <span class="profile-value">💰{{ character.incomeStats.streetwalking }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">卖银收入：</span>
            <span class="profile-value">💰{{ character.incomeStats.prostitution }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">建设补贴：</span>
            <span class="profile-value">💰{{ character.incomeStats.construction }}</span>
          </div>
          <div class="profile-row" style="border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px;">
            <span class="profile-label" style="font-weight: bold;">总收入：</span>
            <span class="profile-value" style="font-weight: bold; color: #27ae60;">💰{{ character.incomeStats.total }}</span>
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
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.profile-modal-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  max-width: 700px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .profile-modal-content {
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

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 3px solid #4a90e2;
}

.profile-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-header h3 {
  color: #e5e5e5;
}

:global(.dark-mode) .profile-header {
  border-bottom-color: #5a9ae2;
}

.modal-close {
  cursor: pointer;
  font-size: 1.5rem;
  color: #999;
  background: none;
  border: none;
  padding: 0;
  width: 30px;
  height: 30px;
  transition: color 0.2s ease;
}

.modal-close:hover {
  color: #333;
}

:global(.dark-mode) .modal-close {
  color: #999;
}

:global(.dark-mode) .modal-close:hover {
  color: #e5e5e5;
}

.profile-section {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #4a90e2;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

:global(.dark-mode) .profile-section {
  background: #1a1a1a;
  border-left-color: #5a9ae2;
}

.profile-section h4 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #333;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-section h4 {
  color: #e5e5e5;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;
  transition: border-color 0.3s ease;
}

:global(.dark-mode) .profile-row {
  border-bottom-color: #404040;
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-label {
  color: #666;
  font-weight: 500;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-label {
  color: #b0b0b0;
}

.profile-value {
  color: #333;
  font-weight: 600;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-value {
  color: #e5e5e5;
}

.profile-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.profile-stat-item {
  padding: 10px;
  background: white;
  border-radius: 6px;
  text-align: center;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .profile-stat-item {
  background: #2d2d2d;
}

.profile-stat-value {
  font-size: 1.3rem;
  font-weight: bold;
  color: #4a90e2;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-stat-value {
  color: #5a9ae2;
}

.profile-stat-label {
  font-size: 0.85rem;
  color: #666;
  margin-top: 4px;
  transition: color 0.3s ease;
}

:global(.dark-mode) .profile-stat-label {
  color: #b0b0b0;
}

.profile-relations {
  max-height: 200px;
  overflow-y: auto;
}

.profile-relation-item {
  padding: 6px;
  margin-bottom: 4px;
  background: white;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .profile-relation-item {
  background: #2d2d2d;
}

.sexual-desire-display {
  padding: 10px;
  background: white;
  border-radius: 6px;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .sexual-desire-display {
  background: #2d2d2d;
}

.sexual-desire-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sexual-desire-bar-bg {
  flex: 1;
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
  transition: background-color 0.3s ease;
}

:global(.dark-mode) .sexual-desire-bar-bg {
  background: #404040;
}

.sexual-desire-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ec4899 0%, #f472b6 100%);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.sexual-desire-text {
  font-size: 12px;
  font-weight: bold;
  color: #ec4899;
  min-width: 50px;
  text-align: right;
  transition: color 0.3s ease;
}

:global(.dark-mode) .sexual-desire-text {
  color: #f472b6;
}

.sexual-desire-status {
  font-weight: 500;
}

.fwb-badge {
  display: inline-block;
  padding: 4px 8px;
  background: linear-gradient(135deg, #ec4899 0%, #f472b6 100%);
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}
</style>

