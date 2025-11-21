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

const closeModal = () => {
  emit('close');
};

// 获取所有角色的好感度矩阵
const loveMatrix = computed(() => {
  const chars = gameInstance.state.chars;
  const matrix: Array<{
    from: string;
    to: string;
    love: number;
    status: string;
  }> = [];

  chars.forEach(fromChar => {
    chars.forEach(toChar => {
      if (fromChar.name !== toChar.name) {
        const rel = fromChar.relationships[toChar.name];
        if (rel) {
          matrix.push({
            from: fromChar.name,
            to: toChar.name,
            love: rel.love,
            status: rel.status
          });
        } else {
          // 如果没有关系记录，默认为陌生人
          matrix.push({
            from: fromChar.name,
            to: toChar.name,
            love: 0,
            status: 'stranger'
          });
        }
      }
    });
  });

  return matrix;
});

// 获取关系状态颜色
const getStatusColor = (status: string, love: number): string => {
  if (status === 'spouse') return '#e84393';
  if (status === 'lover' || status === 'mistress') return '#ff7675';
  if (status === 'bestfriend') return '#3498db';
  if (status === 'friend') return '#74b9ff';
  if (status === 'parent' || status === 'child') return '#9b59b6';
  if (status === 'ex') return '#636e72';
  if (love > 50) return '#55efc4';
  if (love > 20) return '#fdcb6e';
  return '#b2bec3';
};

// 获取关系状态文本
const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'spouse': '💑 配偶',
    'lover': '❤️ 情侣',
    'mistress': '💋 小三',
    'bestfriend': '👥 挚友',
    'friend': '🤝 朋友',
    'parent': '👨‍👩‍👧 亲子',
    'child': '👶 孩子',
    'ex': '💔 前任',
    'stranger': '👤 陌生人'
  };
  return statusMap[status] || '👤 关系';
};

// 获取所有角色列表
const allChars = computed(() => gameInstance.state.chars);

// 获取某个角色对另一个角色的好感度
const getLove = (fromName: string, toName: string): number => {
  const item = loveMatrix.value.find(m => m.from === fromName && m.to === toName);
  return item ? item.love : 0;
};

// 获取某个角色对另一个角色的关系状态
const getStatus = (fromName: string, toName: string): string => {
  const item = loveMatrix.value.find(m => m.from === fromName && m.to === toName);
  return item ? item.status : 'stranger';
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="closeModal">
    <div class="matrix-modal-content">
      <div class="matrix-header">
        <h3 class="matrix-title">💕 好感度矩阵</h3>
        <button class="modal-close" @click="closeModal">×</button>
      </div>
      
      <div class="matrix-content">
        <div class="matrix-table-wrapper">
          <table class="love-matrix-table">
            <thead>
              <tr>
                <th class="corner-cell"></th>
                <th 
                  v-for="char in allChars" 
                  :key="char.name"
                  class="header-cell"
                  :title="char.name"
                >
                  {{ char.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fromChar in allChars" :key="fromChar.name">
                <td class="row-header-cell">{{ fromChar.name }}</td>
                <td 
                  v-for="toChar in allChars" 
                  :key="`${fromChar.name}-${toChar.name}`"
                  class="matrix-cell"
                  :class="{ 'self-cell': fromChar.name === toChar.name }"
                  :style="{ 
                    backgroundColor: fromChar.name === toChar.name 
                      ? 'transparent' 
                      : getStatusColor(getStatus(fromChar.name, toChar.name), getLove(fromChar.name, toChar.name)) + '20',
                    borderColor: getStatusColor(getStatus(fromChar.name, toChar.name), getLove(fromChar.name, toChar.name))
                  }"
                  :title="`${fromChar.name} 对 ${toChar.name}: ${getStatusText(getStatus(fromChar.name, toChar.name))} (❤${getLove(fromChar.name, toChar.name)})`"
                >
                  <span v-if="fromChar.name !== toChar.name" class="love-value">
                    ❤{{ getLove(fromChar.name, toChar.name) }}
                  </span>
                  <span v-else class="self-indicator">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="matrix-legend">
          <h4>图例</h4>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-color" style="background: #e84393;"></span>
              <span>配偶</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #ff7675;"></span>
              <span>情侣/小三</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #3498db;"></span>
              <span>挚友</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #74b9ff;"></span>
              <span>朋友</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #9b59b6;"></span>
              <span>家庭</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #55efc4;"></span>
              <span>高好感 (>50)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #fdcb6e;"></span>
              <span>中好感 (20-50)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #b2bec3;"></span>
              <span>低好感 (<20)</span>
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
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
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

.matrix-modal-content {
  background: white;
  border-radius: 12px;
  max-width: 95vw;
  max-height: 95vh;
  width: 90%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

:global(.dark-mode) .matrix-modal-content {
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

.matrix-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

:global(.dark-mode) .matrix-header {
  border-bottom-color: #404040;
}

.matrix-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #1f2937;
}

:global(.dark-mode) .matrix-title {
  color: #e5e5e5;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #333;
}

:global(.dark-mode) .modal-close:hover {
  background: #404040;
  color: #e5e5e5;
}

.matrix-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.matrix-table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(95vh - 250px);
}

.love-matrix-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  min-width: 600px;
}

.corner-cell {
  background: #f3f4f6;
  position: sticky;
  left: 0;
  z-index: 10;
  border: 1px solid #e5e7eb;
  padding: 8px;
  font-weight: bold;
  color: #1f2937; /* 深色文字 */
}

:global(.dark-mode) .corner-cell {
  background: #1a1a1a;
  border-color: #404040;
  color: #e5e5e5; /* 亮色文字（暗色模式） */
}

.header-cell {
  background: #f3f4f6;
  position: sticky;
  top: 0;
  z-index: 9;
  border: 1px solid #e5e7eb;
  padding: 8px;
  font-weight: bold;
  text-align: center;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  min-width: 30px;
  max-width: 30px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #1f2937; /* 深色文字 */
}

:global(.dark-mode) .header-cell {
  background: #1a1a1a;
  border-color: #404040;
  color: #e5e5e5; /* 亮色文字（暗色模式） */
}

.row-header-cell {
  background: #f3f4f6;
  position: sticky;
  left: 0;
  z-index: 8;
  border: 1px solid #e5e7eb;
  padding: 8px;
  font-weight: bold;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
  color: #1f2937; /* 深色文字 */
}

:global(.dark-mode) .row-header-cell {
  background: #1a1a1a;
  border-color: #404040;
  color: #e5e5e5; /* 亮色文字（暗色模式） */
}

.matrix-cell {
  border: 1px solid #e5e7eb;
  padding: 6px;
  text-align: center;
  cursor: help;
  transition: all 0.2s ease;
  min-width: 60px;
}

:global(.dark-mode) .matrix-cell {
  border-color: #404040;
}

.matrix-cell:hover {
  transform: scale(1.1);
  z-index: 5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.self-cell {
  background: transparent !important;
  border: none !important;
}

.love-value {
  font-weight: 600;
  font-size: 11px;
  color: #1f2937;
}

:global(.dark-mode) .love-value {
  color: #e5e5e5;
}

.self-indicator {
  color: #9ca3af;
  font-size: 14px;
}

.matrix-legend {
  background: #f9fafb;
  border-radius: 8px;
  padding: 15px;
  border: 1px solid #e5e7eb;
}

:global(.dark-mode) .matrix-legend {
  background: #1a1a1a;
  border-color: #404040;
}

.matrix-legend h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #1f2937;
}

:global(.dark-mode) .matrix-legend h4 {
  color: #e5e5e5;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}

:global(.dark-mode) .legend-item {
  color: #9ca3af;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-block;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
</style>

