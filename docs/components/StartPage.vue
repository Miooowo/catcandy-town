<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { gameInstance } from '../core/game';
import { NAMES } from '../data/constants';

const emit = defineEmits<{
  (e: 'start-game'): void;
}>();

// 城镇名称
const townName = ref('猫果镇');

// 旁观者名称
const observerName = ref('');

// 淫乱度等级（0-10）
const promiscuityLevel = ref(1);

// 居民名称列表（12个）
const characterNames = ref<string[]>([...NAMES]);

// 刷新单个名称
const refreshName = (index: number) => {
  let newName = gameInstance.generateRandomName();
  // 确保不重复（排除当前索引的名称）
  let attempts = 0;
  const otherNames = characterNames.value.filter((_, i) => i !== index);
  while (otherNames.includes(newName) && attempts < 20) {
    newName = gameInstance.generateRandomName();
    attempts++;
  }
  characterNames.value[index] = newName;
};

// 刷新所有名称
const refreshAllNames = () => {
  const newNames: string[] = [];
  for (let i = 0; i < 12; i++) {
    let newName = gameInstance.generateRandomName();
    let attempts = 0;
    // 确保不重复
    while (newNames.includes(newName) && attempts < 20) {
      newName = gameInstance.generateRandomName();
      attempts++;
    }
    newNames.push(newName);
  }
  characterNames.value = newNames;
};

// 刷新城镇名称
const refreshTownName = () => {
  const townNames = [
    '猫果镇', '喵喵村', '猫咪城', '果果镇', '毛球镇', 
    '喵星镇', '猫爪镇', '果香镇', '喵呜村', '猫乐园',
    '果味镇', '喵喵乐园', '猫猫村', '果果村', '喵星村'
  ];
  townName.value = townNames[Math.floor(Math.random() * townNames.length)];
};

// 获取淫乱度描述
const getPromiscuityDesc = (level: number): string => {
  if (level === 0) return '纯爱模式';
  if (level <= 3) return '低淫乱度';
  if (level <= 6) return '中等淫乱度';
  if (level <= 9) return '高淫乱度';
  return '极高淫乱度';
};

// 预设配置
const PRESETS: Record<string, { townName: string; characterNames: string[] }> = {
  '592700690': {
    townName: '猫の星空登陆舱',
    characterNames: ['耄耋', '曼波', '湫白', '果猫', '暖泪', '沐夏', 'sans', '时苏', '小睿', '斗罗1654e', '云绒', '抉']
  },
  '233906077': {
    townName: '快乐小镇',
    characterNames: ['Mio', '老吕', 'Ler', 'Dofa', 'Ter', '三三', '画画', '阿湫', '蓝楹花', '绯衣响', '九八', '大切']
  }
};

// 加载预设
const loadPreset = () => {
  const groupId = prompt('请输入群号以加载预设：');
  if (!groupId || !groupId.trim()) {
    return;
  }
  
  const preset = PRESETS[groupId.trim()];
  if (!preset) {
    alert('未找到该群号的预设！');
    return;
  }
  
  townName.value = preset.townName;
  
  // 确保有12个居民名称（如果预设只有13个，取前12个）
  const names = preset.characterNames.slice(0, 12);
  while (names.length < 12) {
    names.push('');
  }
  characterNames.value = names;
  
  alert(`已加载预设：${preset.townName}`);
};

// 开始游戏
const startGame = () => {
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
  gameInstance.state.observerName = observerName.value.trim() || '';
  gameInstance.state.promiscuityLevel = promiscuityLevel.value;
  
  // 初始化游戏
  if (gameInstance.state.chars.length === 0) {
    gameInstance.initNewGame();
  }
  
  // 自动保存
  gameInstance.autoSave();
  
  // 触发开始游戏事件
  emit('start-game');
};

// 初始化时随机生成名称
onMounted(() => {
  // 如果已有自定义设置，使用自定义设置
  if (gameInstance.state.townName && gameInstance.state.townName !== '猫果镇') {
    townName.value = gameInstance.state.townName;
  }
  
  if (gameInstance.state.customCharacterNames.length === 12) {
    characterNames.value = [...gameInstance.state.customCharacterNames];
  }
  
  if (gameInstance.state.observerName) {
    observerName.value = gameInstance.state.observerName;
  } else {
    // 随机生成所有名称
    refreshAllNames();
  }
  
  if (gameInstance.state.promiscuityLevel !== undefined) {
    promiscuityLevel.value = gameInstance.state.promiscuityLevel;
  }
});
</script>

<template>
  <div class="start-page">
    <div class="start-page-content">
      <div class="start-page-header">
        <h1 class="game-title">🐱 猫果镇物语</h1>
        <p class="game-subtitle">欢迎来到你的小镇！在开始之前，请为你的小镇和居民命名。</p>
      </div>
      
      <div class="start-page-body">
        <!-- 城镇名称设置 -->
        <div class="setting-section">
          <div class="section-header">
            <h3>🏘️ 城镇名称</h3>
            <button @click="refreshTownName" class="btn-refresh" title="随机生成城镇名称">
              🔄 刷新
            </button>
          </div>
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
        
        <!-- 旁观者名称设置 -->
        <div class="setting-section">
          <div class="section-header">
            <h3>👤 旁观者名称（可选）</h3>
          </div>
          <div class="input-group">
            <input 
              type="text" 
              v-model="observerName" 
              placeholder="请输入旁观者名称（多人模式显示用）"
              class="town-name-input"
              maxlength="20"
            />
            <small class="input-hint">💡 在多人模式下，其他玩家会看到"你的名称 的 城镇名称"</small>
          </div>
        </div>
        
        <!-- 淫乱度设置 -->
        <div class="setting-section">
          <div class="section-header">
            <h3>🔞 存档淫乱度（0-10级）</h3>
          </div>
          <div class="input-group">
            <div class="promiscuity-control">
              <input 
                type="range" 
                v-model.number="promiscuityLevel"
                min="0"
                max="10"
                step="1"
                class="promiscuity-slider"
              />
              <div class="promiscuity-display">
                <span class="level-value">{{ promiscuityLevel }}</span>
                <span class="level-desc">{{ getPromiscuityDesc(promiscuityLevel) }}</span>
              </div>
            </div>
            <small class="input-hint">
              💡 0级：纯爱模式（取消所有炮友和小三关系，禁止强奸和诱拐）<br>
              💡 10级：高淫乱度（增加70%的淫乱属性修正）
            </small>
          </div>
        </div>
        
        <!-- 居民名称设置 -->
        <div class="setting-section">
          <div class="section-header">
            <h3>👥 初始居民名称（12个）</h3>
            <button @click="refreshAllNames" class="btn-refresh" title="随机生成所有居民名称">
              🔄 全部刷新
            </button>
          </div>
          <div class="characters-grid">
            <div 
              v-for="(name, index) in characterNames" 
              :key="index" 
              class="character-name-item"
            >
              <label class="character-label">居民 {{ index + 1 }}</label>
              <div class="character-input-group">
                <input 
                  type="text" 
                  v-model="characterNames[index]" 
                  placeholder="请输入名称"
                  class="character-name-input"
                  maxlength="20"
                />
                <button 
                  @click="refreshName(index)" 
                  class="btn-refresh-small"
                  title="随机生成名称"
                >
                  🔄
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 提示信息 -->
        <div class="info-section">
          <p class="info-text">💡 提示：</p>
          <ul class="info-list">
            <li>点击刷新按钮可以随机生成名称</li>
            <li>所有12个居民都必须有名称，且不能重复</li>
            <li>城镇名称最多20个字符</li>
            <li>准备好后点击"启程！"按钮开始游戏</li>
          </ul>
        </div>
      </div>
      
      <div class="start-page-footer">
        <button @click="loadPreset" class="btn-preset">
          ⚡ 加载预设
        </button>
        <button @click="startGame" class="btn-start">
          🎮 启程！
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-page {
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

:global(.dark-mode) .start-page {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.start-page-content {
  background: white;
  border-radius: 20px;
  padding: 30px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.4s ease;
}

@media (min-width: 768px) {
  .start-page-content {
    padding: 40px;
  }
}

:global(.dark-mode) .start-page-content {
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

.start-page-header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 3px solid #4a90e2;
}

.game-title {
  font-size: 2rem;
  margin: 0 0 10px 0;
  color: #333;
  font-weight: bold;
}

@media (min-width: 768px) {
  .game-title {
    font-size: 2.5rem;
  }
}

:global(.dark-mode) .game-title {
  color: #e5e5e5;
}

.game-subtitle {
  font-size: 0.9rem;
  color: #666;
  margin: 0;
}

@media (min-width: 768px) {
  .game-subtitle {
    font-size: 1rem;
  }
}

:global(.dark-mode) .game-subtitle {
  color: #bbb;
}

.start-page-body {
  margin-bottom: 30px;
}

.setting-section {
  margin-bottom: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

@media (min-width: 768px) {
  .section-header h3 {
    font-size: 1.4rem;
  }
}

:global(.dark-mode) .section-header h3 {
  color: #e5e5e5;
}

.btn-refresh {
  background: #4a90e2;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-refresh:hover {
  background: #357abd;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(74, 144, 226, 0.3);
}

.btn-refresh:active {
  transform: translateY(0);
}

.input-group {
  margin-top: 10px;
}

.town-name-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  color: #000;
  font-weight: 600;
}

.town-name-input:focus {
  outline: none;
  border-color: #4a90e2;
}

:global(.dark-mode) .town-name-input {
  background: #1a1a1a;
  border-color: #555;
  color: #ffffff;
  font-weight: 600;
}

:global(.dark-mode) .town-name-input:focus {
  border-color: #5a9ae2;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 15px;
}

@media (min-width: 768px) {
  .characters-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.character-name-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.character-label {
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
}

:global(.dark-mode) .character-label {
  color: #bbb;
}

.character-input-group {
  display: flex;
  gap: 5px;
  align-items: center;
}

.character-name-input {
  flex: 1;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
  color: #000;
  font-weight: 600;
}

.character-name-input:focus {
  outline: none;
  border-color: #4a90e2;
}

:global(.dark-mode) .character-name-input {
  background: #1a1a1a;
  border-color: #555;
  color: #ffffff;
  font-weight: 600;
}

:global(.dark-mode) .character-name-input:focus {
  border-color: #5a9ae2;
}

.btn-refresh-small {
  background: #4a90e2;
  color: white;
  border: none;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-refresh-small:hover {
  background: #357abd;
  transform: scale(1.05);
}

.btn-refresh-small:active {
  transform: scale(0.95);
}

.info-section {
  background: #f0f7ff;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #4a90e2;
  margin-top: 20px;
}

:global(.dark-mode) .info-section {
  background: #1a2332;
  border-left-color: #5a9ae2;
}

.info-text {
  margin: 0 0 10px 0;
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

:global(.dark-mode) .info-text {
  color: #e5e5e5;
}

.info-list {
  margin: 0;
  padding-left: 20px;
  color: #666;
  font-size: 0.9rem;
  line-height: 1.6;
}

:global(.dark-mode) .info-list {
  color: #bbb;
}

.info-list li {
  margin-bottom: 5px;
}

.start-page-footer {
  text-align: center;
  padding-top: 20px;
  border-top: 2px solid #eee;
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

:global(.dark-mode) .start-page-footer {
  border-top-color: #444;
}

.btn-preset {
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  color: white;
  border: none;
  padding: 15px 40px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(243, 156, 18, 0.4);
}

.btn-preset:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(243, 156, 18, 0.6);
}

.btn-preset:active {
  transform: translateY(-1px);
}

.btn-start {
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

.btn-start:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.btn-start:active {
  transform: translateY(-1px);
}

@media (min-width: 768px) {
  .btn-preset {
    padding: 18px 50px;
    font-size: 1.2rem;
  }
  
  .btn-start {
    padding: 18px 60px;
    font-size: 1.4rem;
  }
}
</style>

