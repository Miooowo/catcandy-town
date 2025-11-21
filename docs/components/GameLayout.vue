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
  
  // 可以在这里做一些浏览器端的初始化检查
  if (!state.isPlaying) {
    gameInstance.start();
  }
});

onUnmounted(() => {
  // 卸载前自动保存
  gameInstance.autoSave();
  gameInstance.stop();
  // 清理事件监听器
  gameInstance.cleanup();
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
  <div class="game-wrapper" :class="{ 'dark-mode': isDarkMode }">
    <ControlPanel 
      @toggle-dark="toggleDarkMode" 
      @show-relationship-tree="openRelationshipTree"
      @show-changelog="openChangelog"
    />

    <div class="game-content">
      <div class="section residents-section">
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

      <div class="section buildings-section">
        <h3 class="section-title">小镇建设</h3>
        <div class="buildings-list">
          <BuildingCard 
            v-for="b in state.buildings" 
            :key="b.id" 
            :build="b"
            @click="openBuildingProfile(b)"
          />
        </div>
      </div>

      <LogPanel :logs="state.logs" class="section log-section" />
    </div>

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
}

.game-wrapper.dark-mode {
  background: #1a1a1a;
  color: #e5e5e5;
}

.game-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 80px);
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
    height: calc(100vh - 100px);
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
  flex: 2;
  min-height: 200px;
}

.buildings-section {
  flex: 1;
  min-height: 150px;
}

.log-section {
  flex: 1;
  min-height: 150px;
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
  grid-template-columns: 1fr;
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
