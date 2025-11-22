<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, provide } from 'vue';
import { gameInstance } from '../core/game';
import type { Character } from '../core/character';
import CharacterCard from './CharacterCard.vue';
import BuildingCard from './BuildingCard.vue';
import LogPanel from './LogPanel.vue';
import ControlPanel from './ControlPanel.vue';
import CharacterProfile from './CharacterProfile.vue';
import BuildingProfile from './BuildingProfile.vue';
import RelationshipTree from './RelationshipTree.vue';
import RelationshipNetwork from './RelationshipNetwork.vue';
import RelationshipLoveMatrix from './RelationshipLoveMatrix.vue';
import ChangelogModal from './ChangelogModal.vue';
import StartPage from './StartPage.vue';
import SaveSlotPage from './SaveSlotPage.vue';
import MultiplayerModal from './MultiplayerModal.vue';
import RankingsPage from './RankingsPage.vue';
import DebugPanel from './DebugPanel.vue';
import type { Building } from '../core/building';

// 直接解构 state 以便在模板使用
const { state } = gameInstance;

// 暗色模式状态
const isDarkMode = ref(false);

// 角色档案模态框状态
const selectedCharacter = ref<Character | null>(null);
const showProfile = ref(false);

const openProfile = (char: Character) => {
  selectedCharacter.value = char;
  showProfile.value = true;
};

const closeProfile = () => {
  showProfile.value = false;
  selectedCharacter.value = null;
};

// 建筑详情模态框状态
const selectedBuilding = ref<Building | null>(null);
const showBuildingProfile = ref(false);

const openBuildingProfile = (building: Building) => {
  selectedBuilding.value = building;
  showBuildingProfile.value = true;
};

const closeBuildingProfile = () => {
  showBuildingProfile.value = false;
  selectedBuilding.value = null;
};

// 关系谱模态框状态
const showRelationshipTree = ref(false);
const showRelationshipNetwork = ref(false);
const showLoveMatrix = ref(false);

// 更新日志模态框状态
const showChangelog = ref(false);

// 多人模式模态框状态
const showMultiplayer = ref(false);

// 榜单页面状态
const showRankings = ref(false);

// 调试面板状态
const showDebug = ref(false);

// 存档页面状态
const showSaveSlotPage = ref(false);
// 开始页面状态
const showStartPage = ref(false);

// 侧边栏状态（手机端）
const sidebarOpen = ref(false);
const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value;
};

const openRelationshipTree = () => {
  showRelationshipTree.value = true;
};

const closeRelationshipTree = () => {
  showRelationshipTree.value = false;
};

const closeRelationshipNetwork = () => {
  showRelationshipNetwork.value = false;
};

const openRelationshipNetwork = () => {
  showRelationshipNetwork.value = true;
};

const closeLoveMatrix = () => {
  showLoveMatrix.value = false;
};

const openLoveMatrix = () => {
  showLoveMatrix.value = true;
};

const openChangelog = () => {
  showChangelog.value = true;
};

const closeChangelog = () => {
  showChangelog.value = false;
};

const openMultiplayer = () => {
  showMultiplayer.value = true;
};

const closeMultiplayer = () => {
  showMultiplayer.value = false;
};

const openRankings = () => {
  showRankings.value = true;
};

const closeRankings = () => {
  showRankings.value = false;
};

const openDebug = () => {
  showDebug.value = true;
};

const closeDebug = () => {
  showDebug.value = false;
};

const handleGlobalReset = () => {
  if (confirm('确定要全局重置吗？这将删除当前存档并重置游戏到初始状态！')) {
    gameInstance.resetData();
  }
};

// 从存档页面选择槽位
const handleSelectSlot = (slot: number) => {
  const result = gameInstance.loadFromSlot(slot);
  if (result.success) {
    showSaveSlotPage.value = false;
    // 自动开始游戏
    if (!gameInstance.state.isPlaying && gameInstance.state.chars.length > 0) {
      gameInstance.start();
    }
  } else {
    alert(result.message || '加载存档失败');
  }
};

// 从存档页面新建游戏
const handleNewGame = (slot?: number) => {
  if (slot) {
    gameInstance.setCurrentSlot(slot);
  }
  // 新建游戏时清除调试模式标志
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem('debug_mode');
    window.dispatchEvent(new CustomEvent('debug-mode-disabled'));
  }
  showSaveSlotPage.value = false;
  showStartPage.value = true;
};

// 从开始页面进入游戏
const handleStartGame = () => {
  showStartPage.value = false;
  // 自动开始游戏
  if (!gameInstance.state.isPlaying && gameInstance.state.chars.length > 0) {
    gameInstance.start();
  }
};

// 更新主题类名
const updateTheme = () => {
  if (typeof document === 'undefined') return;
  
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
};

// 监听暗色模式变化，保存到 localStorage
watch(isDarkMode, (newVal) => {
  if (typeof localStorage === 'undefined') return;
  
  localStorage.setItem('game-theme', newVal ? 'dark' : 'light');
  updateTheme();
});

// 监听游戏重置事件
const handleGameReset = () => {
  showSaveSlotPage.value = true;
  showStartPage.value = false;
};

// 从 localStorage 读取用户偏好
onMounted(() => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  
  const savedTheme = localStorage.getItem('game-theme');
  if (savedTheme === 'dark') {
    isDarkMode.value = true;
  } else if (savedTheme === null) {
    // 如果没有保存的偏好，检查系统偏好
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDarkMode.value = prefersDark;
  }
  
  // 应用主题
  updateTheme();
  
  // 检查是否有任何存档槽位
  let hasAnySave = false;
  for (let i = 1; i <= 5; i++) {
    const saveKey = `happyTownV2_Save_Slot${i}`;
    if (localStorage.getItem(saveKey)) {
      hasAnySave = true;
      break;
    }
  }
  
  // 如果有存档或已有角色，显示存档页面；否则显示开始页面
  if (hasAnySave || gameInstance.state.chars.length > 0) {
    showSaveSlotPage.value = true;
  } else {
    showStartPage.value = true;
  }
  
  // 监听游戏重置事件
  window.addEventListener('game-reset', handleGameReset);
});

onUnmounted(() => {
  // 卸载前自动保存
  gameInstance.autoSave();
  gameInstance.stop();
  // 清理事件监听器
  gameInstance.cleanup();
  // 清理游戏重置事件监听器
  if (typeof window !== 'undefined') {
    window.removeEventListener('game-reset', handleGameReset);
  }
});

// 暴露切换函数给子组件
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
};

// 使用 provide 让子组件可以访问
provide('isDarkMode', isDarkMode);
provide('toggleDarkMode', toggleDarkMode);
</script>

<template>
  <!-- 存档页面 -->
  <SaveSlotPage 
    v-if="showSaveSlotPage"
    @select-slot="handleSelectSlot"
    @new-game="handleNewGame"
  />
  
  <!-- 开始页面 -->
  <StartPage 
    v-else-if="showStartPage"
    @start-game="handleStartGame"
  />
  
  <!-- 游戏主界面 -->
  <div v-else class="game-wrapper" :class="{ 'dark-mode': isDarkMode, 'sidebar-open': sidebarOpen }">
    <ControlPanel 
      @toggle-dark="toggleDarkMode" 
      @show-relationship-tree="openRelationshipTree"
      @show-changelog="openChangelog"
      @show-multiplayer="openMultiplayer"
      @show-rankings="openRankings"
      @toggle-sidebar="toggleSidebar"
      @show-debug="openDebug"
    />

    <!-- 侧边栏遮罩层（手机端） -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <div class="game-content">
      <!-- 左侧边栏：建筑列表 -->
      <div class="section buildings-section sidebar" :class="{ 'open': sidebarOpen }">
        <div class="sidebar-header">
          <h3 class="section-title">小镇建设</h3>
          <button class="sidebar-close-btn" @click="sidebarOpen = false" v-if="sidebarOpen">×</button>
        </div>
        <div class="buildings-list">
          <BuildingCard 
            v-for="b in state.buildings" 
            :key="b.id" 
            :build="b"
            @click="openBuildingProfile(b)"
          />
        </div>
        <div class="sidebar-actions">
          <button class="sidebar-btn btn-reset" @click="handleGlobalReset" title="全局重置：删除当前存档并重置游戏">🗑 全局重置</button>
        </div>
      </div>

      <!-- 中间主区域：居民状态 -->
      <div class="section residents-section main-content">
        <h3 class="section-title">居民状态 ({{ state.chars.length }})</h3>
        <div class="residents-grid">
          <CharacterCard 
            v-for="c in state.chars" 
            :key="c.name" 
            :char="c"
            @click="openProfile(c)"
          />
        </div>
      </div>
    </div>

    <!-- 底部：游戏日志 -->
    <LogPanel :logs="state.logs" class="section log-section bottom-panel" />

    <CharacterProfile 
      :character="selectedCharacter"
      :visible="showProfile"
      @close="closeProfile"
    />
    
    <BuildingProfile 
      :building="selectedBuilding"
      :visible="showBuildingProfile"
      @close="closeBuildingProfile"
    />
    
    <RelationshipTree 
      :visible="showRelationshipTree"
      @close="closeRelationshipTree"
      @open-network="openRelationshipNetwork"
      @open-love-matrix="openLoveMatrix"
    />
    
    <RelationshipNetwork 
      :visible="showRelationshipNetwork"
      @close="closeRelationshipNetwork"
    />
    
    <RelationshipLoveMatrix 
      :visible="showLoveMatrix"
      @close="closeLoveMatrix"
    />
    
    <ChangelogModal 
      :visible="showChangelog"
      @close="closeChangelog"
    />
    
    <MultiplayerModal 
      :visible="showMultiplayer"
      @close="closeMultiplayer"
    />
    
    <RankingsPage 
      :visible="showRankings"
      @close="closeRankings"
    />
    
    <DebugPanel 
      :visible="showDebug"
      @close="closeDebug"
    />
  </div>
</template>

<style scoped>
.game-wrapper {
  background: #f9fafb;
  min-height: 100vh;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: background-color 0.3s ease, color 0.3s ease;
  height: 100vh;
  overflow: hidden;
}

.game-wrapper.dark-mode {
  background: #1a1a1a;
  color: #e5e5e5;
}

.game-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (min-width: 768px) {
  .game-wrapper {
    padding: 16px;
    gap: 16px;
  }
  
  .game-content {
    flex-direction: row;
    gap: 16px;
  }
}

.section {
  background: #f3f4f6;
  padding: 8px;
  border-radius: 8px;
  overflow-y: auto;
  transition: background-color 0.3s ease;
  min-height: 0;
}

@media (min-width: 768px) {
  .section {
    padding: 12px;
  }
}

.dark-mode .section {
  background: #2d2d2d;
}

.residents-section {
  flex: 1;
  min-height: 200px;
}

.main-content {
  flex: 1;
  min-height: 0;
}

.sidebar {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
}

.bottom-panel {
  height: 200px;
  min-height: 200px;
  max-height: 300px;
  flex-shrink: 0;
  margin-top: 12px;
}

/* 侧边栏操作按钮区域 */
.sidebar-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:global(.dark-mode) .sidebar-actions {
  border-top-color: #404040;
}

.sidebar-btn {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.btn-reset {
  background: #ef4444;
  color: white;
}

.btn-reset:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

:global(.dark-mode) .btn-reset {
  background: #dc2626;
}

:global(.dark-mode) .btn-reset:hover {
  background: #b91c1c;
}


/* 侧边栏遮罩层（手机端） */
.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sidebar-close-btn {
  display: none;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.sidebar-close-btn:hover {
  background: #f0f0f0;
}

:global(.dark-mode) .sidebar-close-btn {
  color: #ccc;
}

:global(.dark-mode) .sidebar-close-btn:hover {
  background: #3d3d3d;
}

@media (max-width: 767px) {
  .sidebar-overlay {
    display: block;
  }
  
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 280px;
    max-width: 85vw;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .sidebar-close-btn {
    display: flex;
  }
  
  .main-content {
    width: 100%;
    flex: 1;
    order: -1; /* 在手机端，居民活动区域优先显示 */
    min-height: 0;
    overflow-y: auto;
  }
  
  .game-content {
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  
  .bottom-panel {
    height: 120px;
    min-height: 120px;
    max-height: 180px;
    order: 1;
    flex-shrink: 0;
  }
  
  .residents-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
  }
}

.section-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #4b5563;
  font-size: 12px;
  transition: color 0.3s ease;
}

@media (min-width: 768px) {
  .section-title {
    font-size: 14px;
  }
}

.dark-mode .section-title {
  color: #d1d5db;
}

.residents-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

@media (min-width: 640px) {
  .residents-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
}

@media (min-width: 1024px) {
  .residents-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.buildings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (min-width: 768px) {
  .buildings-list {
    gap: 8px;
  }
}

/* 移动端滚动优化 */
@media (max-width: 767px) {
  .section {
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  
  .section::-webkit-scrollbar {
    width: 4px;
  }
  
  .section::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
  }
  
  .dark-mode .section::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
  }
}
</style>
