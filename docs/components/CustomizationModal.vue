<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { gameInstance } from '../core/game';
import { NAMES } from '../data/constants';

const props = defineProps<{
  visible: boolean;
  isInitialSetup?: boolean; // 是否为首次设置
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'complete-setup'): void; // 完成初始设置
}>();

// 城镇名称
const townName = ref(gameInstance.state.townName || '猫果镇');

// 居民名称列表（12个）
const characterNames = ref<string[]>(() => {
  if (gameInstance.state.customCharacterNames.length === 12) {
    return [...gameInstance.state.customCharacterNames];
  }
  return [...NAMES];
});

// 确保始终有12个名称
if (characterNames.value.length < 12) {
  while (characterNames.value.length < 12) {
    characterNames.value.push('');
  }
}

const close = () => {
  emit('close');
};

const save = () => {
  // 验证城镇名称
  const trimmedTownName = townName.value.trim();
  if (!trimmedTownName) {
    alert('城镇名称不能为空！');
    return;
  }
  
  // 验证居民名称
  const trimmedNames = characterNames.value.map(name => name.trim()).filter(name => name !== '');
  if (trimmedNames.length < 12) {
    alert('必须为所有12个居民设置名称！');
    return;
  }
  
  // 检查重复名称
  const nameSet = new Set(trimmedNames);
  if (nameSet.size !== trimmedNames.length) {
    alert('居民名称不能重复！');
    return;
  }
  
  // 保存到游戏状态
  gameInstance.state.townName = trimmedTownName;
  gameInstance.state.customCharacterNames = trimmedNames;
  
  // 如果是首次设置
  if (props.isInitialSetup) {
    // 初始化游戏
    if (gameInstance.state.chars.length === 0) {
      gameInstance.initNewGame();
    }
    // 自动保存
    gameInstance.autoSave();
    // 触发完成设置事件
    emit('complete-setup');
    return;
  }
  
  // 如果游戏已开始，需要重新初始化角色（但保留游戏进度）
  if (gameInstance.state.chars.length > 0) {
    const shouldRestart = confirm('修改居民名称需要重新开始游戏。是否继续？\n（当前游戏进度将被重置）');
    if (shouldRestart) {
      // 先保存自定义设置，然后重置（保留自定义设置）
      gameInstance.state.townName = trimmedTownName;
      gameInstance.state.customCharacterNames = trimmedNames;
      gameInstance.resetData(true); // 传递true以保留自定义设置
      gameInstance.log(`🏘️ 欢迎来到 **${trimmedTownName}**！`, 'system');
    } else {
      // 取消修改
      townName.value = gameInstance.state.townName;
      characterNames.value = gameInstance.state.customCharacterNames.length === 12
        ? [...gameInstance.state.customCharacterNames]
        : [...NAMES];
      return;
    }
  }
  
  // 自动保存
  gameInstance.autoSave();
  
  gameInstance.log(`✅ 自定义设置已保存！城镇名称：**${trimmedTownName}**`, 'system');
  close();
};

const resetToDefault = () => {
  if (confirm('确定要重置为默认名称吗？')) {
    townName.value = '猫果镇';
    characterNames.value = [...NAMES];
  }
};

// 监听可见性变化，同步数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    townName.value = gameInstance.state.townName || '猫果镇';
    if (gameInstance.state.customCharacterNames.length === 12) {
      characterNames.value = [...gameInstance.state.customCharacterNames];
    } else {
      characterNames.value = [...NAMES];
    }
  }
});
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="customization-modal-content">
      <div class="customization-header">
        <h3>{{ isInitialSetup ? '🎮 欢迎来到猫果镇物语' : '⚙️ 自定义设置' }}</h3>
        <button v-if="!isInitialSetup" class="modal-close" @click="close">×</button>
      </div>
      
      <div class="customization-content">
        <!-- 城镇名称设置 -->
        <div class="setting-section">
          <h4>🏘️ 城镇名称</h4>
          <div class="input-group">
            <input 
              type="text" 
              v-model="townName" 
              placeholder="请输入城镇名称"
              class="town-name-input"
              maxlength="20"
            />
          </div>
        </div>
        
        <!-- 居民名称设置 -->
        <div class="setting-section">
          <h4>👥 初始居民名称（12个）</h4>
          <div class="characters-grid">
            <div 
              v-for="(name, index) in characterNames" 
              :key="index" 
              class="character-name-item"
            >
              <label class="character-label">居民 {{ index + 1 }}</label>
              <input 
                type="text" 
                v-model="characterNames[index]" 
                :placeholder="NAMES[index] || `居民${index + 1}`"
                class="character-name-input"
                maxlength="20"
              />
            </div>
          </div>
        </div>
        
        <!-- 提示信息 -->
        <div class="info-section">
          <p class="info-text">💡 提示：</p>
          <ul class="info-list">
            <li v-if="isInitialSetup">请为你的小镇和居民设置名称，完成后即可开始游戏</li>
            <li v-else>修改居民名称后需要重新开始游戏才能生效</li>
            <li>所有12个居民都必须有名称，且不能重复</li>
            <li>城镇名称最多20个字符</li>
          </ul>
        </div>
      </div>
      
      <div class="customization-footer">
        <button v-if="!isInitialSetup" @click="resetToDefault" class="btn-reset">🔄 重置为默认</button>
        <div class="footer-buttons">
          <button v-if="!isInitialSetup" @click="close" class="btn-cancel">取消</button>
          <button @click="save" class="btn-save">{{ isInitialSetup ? '🎮 开始游戏' : '💾 保存' }}</button>
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

.customization-modal-content {
  background: white;
  padding: 16px;
  border-radius: 12px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  transition: background-color 0.3s ease;
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .customization-modal-content {
    padding: 30px;
    width: 90%;
    max-height: 85vh;
  }
}

:global(.dark-mode) .customization-modal-content {
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

.customization-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 3px solid #4a90e2;
}

.customization-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .customization-header h3 {
    font-size: 1.5rem;
  }
}

:global(.dark-mode) .customization-header h3 {
  color: #e5e5e5;
}

:global(.dark-mode) .customization-header {
  border-bottom-color: #5a9ae2;
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

.customization-content {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
}

.setting-section {
  margin-bottom: 24px;
}

.setting-section h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #333;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .setting-section h4 {
    font-size: 1.2rem;
  }
}

:global(.dark-mode) .setting-section h4 {
  color: #e5e5e5;
}

.input-group {
  margin-bottom: 16px;
}

.town-name-input {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.town-name-input:focus {
  outline: none;
  border-color: #4a90e2;
}

:global(.dark-mode) .town-name-input {
  background: #1a1a1a;
  border-color: #555;
  color: #e5e5e5;
}

:global(.dark-mode) .town-name-input:focus {
  border-color: #5a9ae2;
}

.characters-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 640px) {
  .characters-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .characters-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.character-name-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.character-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  transition: color 0.3s ease;
}

:global(.dark-mode) .character-label {
  color: #b0b0b0;
}

.character-name-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.character-name-input:focus {
  outline: none;
  border-color: #4a90e2;
}

:global(.dark-mode) .character-name-input {
  background: #1a1a1a;
  border-color: #555;
  color: #e5e5e5;
}

:global(.dark-mode) .character-name-input:focus {
  border-color: #5a9ae2;
}

.info-section {
  margin-top: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #4a90e2;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

:global(.dark-mode) .info-section {
  background: #1a1a1a;
  border-left-color: #5a9ae2;
}

.info-text {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  transition: color 0.3s ease;
}

:global(.dark-mode) .info-text {
  color: #e5e5e5;
}

.info-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #666;
  line-height: 1.6;
  transition: color 0.3s ease;
}

:global(.dark-mode) .info-list {
  color: #b0b0b0;
}

.info-list li {
  margin-bottom: 4px;
}

.customization-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid #eee;
  gap: 12px;
  flex-wrap: wrap;
}

:global(.dark-mode) .customization-footer {
  border-top-color: #404040;
}

.footer-buttons {
  display: flex;
  gap: 8px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-weight: 500;
}

.btn-reset {
  background: #f39c12;
  color: white;
}

.btn-reset:hover {
  background: #e67e22;
}

.btn-cancel {
  background: #95a5a6;
  color: white;
}

.btn-cancel:hover {
  background: #7f8c8d;
}

.btn-save {
  background: #27ae60;
  color: white;
}

.btn-save:hover {
  background: #229954;
}

:global(.dark-mode) .btn-reset {
  background: #f39c12;
}

:global(.dark-mode) .btn-reset:hover {
  background: #e67e22;
}

:global(.dark-mode) .btn-cancel {
  background: #555;
  color: #e5e5e5;
}

:global(.dark-mode) .btn-cancel:hover {
  background: #666;
}

:global(.dark-mode) .btn-save {
  background: #27ae60;
}

:global(.dark-mode) .btn-save:hover {
  background: #229954;
}
</style>

