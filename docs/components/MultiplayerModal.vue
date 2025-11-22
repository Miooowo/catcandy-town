<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { networkManager, type TownInfo } from '../core/network';
import { gameInstance } from '../core/game';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// 从 localStorage 加载保存的服务器地址，如果没有则使用默认值
const getDefaultServerUrl = (): string => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('multiplayer_serverUrl');
    if (saved) return saved;
  }
  // 默认使用 localhost，但用户可以在生产环境中修改
  return 'http://localhost:3000';
};

const serverUrl = ref(getDefaultServerUrl());
const isConnected = ref(false);
const currentTownId = ref<string | null>(null);
const towns = ref<TownInfo[]>([]);
const townName = ref(gameInstance.state.townName || '猫果镇');
const showTownDetails = ref(false);
const selectedTownDetails = ref<{
  townId: string;
  townName: string;
  characters: any[];
  buildings: any[];
} | null>(null);

const close = () => {
  emit('close');
};

// 保存服务器地址到 localStorage
const saveServerUrl = (url: string) => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.setItem('multiplayer_serverUrl', url);
  }
};

// 连接到服务器
const connect = () => {
  const url = serverUrl.value.trim();
  if (!url) {
    alert('请输入服务器地址');
    return;
  }
  
  // 保存服务器地址
  saveServerUrl(url);
  
  networkManager.connect(url);
  isConnected.value = true;
  
  // 监听连接状态
  setTimeout(() => {
    if (networkManager.getCurrentTownId()) {
      currentTownId.value = networkManager.getCurrentTownId();
    }
    updateTownsList();
  }, 1000);
};

// 创建城镇
const createTown = () => {
  if (!isConnected.value) {
    alert('请先连接到服务器');
    return;
  }

  const trimmedName = townName.value.trim();
  if (!trimmedName) {
    alert('城镇名称不能为空');
    return;
  }

  networkManager.createTown(trimmedName);
  networkManager.startAutoSync(5000); // 每5秒同步一次
  
  // 启用多人模式
  setTimeout(() => {
    const townId = networkManager.getCurrentTownId();
    if (townId) {
      gameInstance.enableMultiplayerMode(townId);
      currentTownId.value = townId;
      updateTownsList();
    }
  }, 500);
};

// 更新城镇列表
const updateTownsList = () => {
  towns.value = networkManager.getTowns();
};

// 查看城镇详情（居民信息）
const viewTownDetails = (town: TownInfo) => {
  if (town.townId === currentTownId.value) {
    // 如果是当前城镇，不需要查看（已经在游戏界面显示了）
    return;
  }
  
  showTownDetails.value = true;
  selectedTownDetails.value = {
    townId: town.townId,
    townName: town.townName,
    characters: [],
    buildings: []
  };
  
  networkManager.requestTownDetails(town.townId, (details) => {
    selectedTownDetails.value = details;
  });
};

// 关闭城镇详情
const closeTownDetails = () => {
  showTownDetails.value = false;
  selectedTownDetails.value = null;
};

// 断开连接
const disconnect = () => {
  networkManager.disconnect();
  isConnected.value = false;
  currentTownId.value = null;
  gameInstance.disableMultiplayerMode();
};

let townsUpdateInterval: number | null = null;

onMounted(() => {
  // 定期更新城镇列表
  townsUpdateInterval = window.setInterval(() => {
    if (isConnected.value) {
      updateTownsList();
    }
  }, 3000);
});

onUnmounted(() => {
  if (townsUpdateInterval) {
    clearInterval(townsUpdateInterval);
    townsUpdateInterval = null;
  }
});
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="multiplayer-modal-content">
      <div class="multiplayer-header">
        <h3>🌐 多人联机模式</h3>
        <button class="modal-close" @click="close">×</button>
      </div>
      
      <div class="multiplayer-content">
        <!-- 连接设置 -->
        <div class="section">
          <h4>服务器设置</h4>
          <div class="input-group">
            <label>服务器地址:</label>
            <input 
              v-model="serverUrl" 
              type="text" 
              placeholder="http://localhost:3000 或 https://your-server.com"
              :disabled="isConnected"
              @blur="saveServerUrl(serverUrl)"
            />
            <small class="input-hint">
              💡 提示：输入你的服务器地址（如：https://your-server.railway.app 或 https://your-server.render.com）
            </small>
          </div>
          <div class="button-group">
            <button 
              v-if="!isConnected" 
              @click="connect" 
              class="btn-connect"
            >
              连接服务器
            </button>
            <button 
              v-else 
              @click="disconnect" 
              class="btn-disconnect"
            >
              断开连接
            </button>
          </div>
          <div v-if="isConnected" class="status-connected">
            ✅ 已连接到服务器
          </div>
        </div>

        <!-- 创建城镇 -->
        <div v-if="isConnected && !currentTownId" class="section">
          <h4>创建城镇</h4>
          <div class="input-group">
            <label>城镇名称:</label>
            <input 
              v-model="townName" 
              type="text" 
              placeholder="输入城镇名称"
              maxlength="20"
            />
          </div>
          <button @click="createTown" class="btn-create-town">
            🏘️ 创建城镇
          </button>
        </div>

        <!-- 当前城镇信息 -->
        <div v-if="currentTownId" class="section current-town">
          <h4>我的城镇</h4>
          <div class="town-info">
            <div class="town-name">🏘️ {{ townName }}</div>
            <div class="town-id">ID: {{ currentTownId }}</div>
            <div class="status-active">🟢 在线</div>
          </div>
        </div>

        <!-- 其他城镇列表 -->
        <div v-if="isConnected" class="section">
          <h4>其他城镇 ({{ towns.filter(t => t.townId !== currentTownId).length }})</h4>
          <div v-if="towns.filter(t => t.townId !== currentTownId).length === 0" class="no-towns">
            暂无其他城镇
          </div>
          <div v-else class="towns-list">
            <div 
              v-for="town in towns.filter(t => t.townId !== currentTownId)" 
              :key="town.townId"
              class="town-item"
              @click="viewTownDetails(town)"
            >
              <div class="town-item-header">
                <span class="town-item-name">🏘️ {{ town.townName }}</span>
                <span v-if="town.isOnline === false" class="offline-badge">离线</span>
              </div>
              <div class="town-item-info">
                <span>👥 {{ town.characterCount }} 居民</span>
                <span>🏗️ {{ town.buildings.length }} 建筑</span>
              </div>
              <div v-if="town.buildings.length > 0" class="town-buildings">
                <span 
                  v-for="building in town.buildings" 
                  :key="building.id"
                  class="building-tag"
                >
                  {{ building.name }}
                </span>
              </div>
              <div class="town-item-action">
                <button class="btn-view-details">👁️ 查看居民信息</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 城镇详情模态框 -->
        <div v-if="showTownDetails && selectedTownDetails" class="modal-overlay town-details-overlay" @click.self="closeTownDetails">
          <div class="town-details-modal">
            <div class="town-details-header">
              <h3>🏘️ {{ selectedTownDetails.townName }}</h3>
              <button class="modal-close" @click="closeTownDetails">×</button>
            </div>
            <div class="town-details-content">
              <div class="details-section">
                <h4>👥 居民列表 ({{ selectedTownDetails.characters.length }})</h4>
                <div v-if="selectedTownDetails.characters.length === 0" class="no-characters">
                  暂无居民信息
                </div>
                <div v-else class="characters-list">
                  <div 
                    v-for="char in selectedTownDetails.characters" 
                    :key="char.name"
                    class="character-item"
                  >
                    <div class="character-name">👤 {{ char.name }}</div>
                    <div class="character-info">
                      <span>💰 {{ char.money || 0 }}</span>
                      <span>😊 {{ char.happiness || 0 }}</span>
                      <span v-if="char.currentAction">📝 {{ char.currentAction }}</span>
                    </div>
                    <div v-if="char.currentTown && char.currentTown !== selectedTownDetails.townId" class="character-travel">
                      🚶 当前在: {{ char.currentTown }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="details-section">
                <h4>🏗️ 建筑列表 ({{ selectedTownDetails.buildings.filter(b => b.isBuilt).length }})</h4>
                <div v-if="selectedTownDetails.buildings.filter(b => b.isBuilt).length === 0" class="no-buildings">
                  暂无建筑
                </div>
                <div v-else class="buildings-list">
                  <div 
                    v-for="building in selectedTownDetails.buildings.filter(b => b.isBuilt)" 
                    :key="building.id"
                    class="building-item"
                  >
                    <span class="building-name">{{ building.name }}</span>
                    <span v-if="building.totalRevenue" class="building-revenue">💰 {{ building.totalRevenue }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 提示信息 -->
        <div class="info-section">
          <p class="info-text">💡 多人模式说明：</p>
          <ul class="info-list">
            <li>连接到服务器后可以创建或查看其他城镇</li>
            <li>居民会自动前往其他城镇消费（如果本地没有相应建筑）</li>
            <li>角色卡片会显示当前所在城镇</li>
            <li>跨城镇消费会给目标城镇带来收入</li>
          </ul>
          <p class="info-text" style="margin-top: 12px;">📡 服务器部署：</p>
          <ul class="info-list">
            <li>服务器需要单独部署（Netlify 只支持静态网站）</li>
            <li>推荐使用 Railway、Render 或 VPS 部署服务器</li>
            <li>部署后在此输入服务器地址即可使用</li>
            <li>服务器地址会自动保存，下次打开时自动填充</li>
          </ul>
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.multiplayer-modal-content {
  background: white;
  padding: 20px;
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

:global(.dark-mode) .multiplayer-modal-content {
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

.multiplayer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 3px solid #4a90e2;
}

.multiplayer-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

:global(.dark-mode) .multiplayer-header h3 {
  color: #e5e5e5;
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
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #333;
}

:global(.dark-mode) .modal-close:hover {
  background: #404040;
  color: #e5e5e5;
}

.multiplayer-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

:global(.dark-mode) .section {
  background: #1a1a1a;
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #333;
}

:global(.dark-mode) .section h4 {
  color: #e5e5e5;
}

.input-group {
  margin-bottom: 12px;
}

.input-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 0.9rem;
  color: #666;
}

:global(.dark-mode) .input-group label {
  color: #bbb;
}

.input-group input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.input-hint {
  display: block;
  margin-top: 5px;
  font-size: 0.75rem;
  color: #666;
  line-height: 1.4;
}

:global(.dark-mode) .input-hint {
  color: #999;
}

:global(.dark-mode) .input-group input {
  background: #1a1a1a;
  border-color: #555;
  color: #e5e5e5;
}

.button-group {
  display: flex;
  gap: 10px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.btn-connect {
  background: #27ae60;
  color: white;
}

.btn-connect:hover {
  background: #229954;
}

.btn-disconnect {
  background: #e74c3c;
  color: white;
}

.btn-disconnect:hover {
  background: #c0392b;
}

.btn-create-town {
  background: #3498db;
  color: white;
  width: 100%;
}

.btn-create-town:hover {
  background: #2980b9;
}

.status-connected {
  margin-top: 10px;
  padding: 8px;
  background: #d4edda;
  border-radius: 4px;
  color: #155724;
  font-size: 0.85rem;
}

:global(.dark-mode) .status-connected {
  background: #1a3a2a;
  color: #4ade80;
}

.current-town {
  background: #e8f4f8;
  border: 2px solid #4a90e2;
}

:global(.dark-mode) .current-town {
  background: #1a2332;
  border-color: #5a9ae2;
}

.town-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.town-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

:global(.dark-mode) .town-name {
  color: #e5e5e5;
}

.town-id {
  font-size: 0.85rem;
  color: #666;
  font-family: monospace;
}

:global(.dark-mode) .town-id {
  color: #999;
}

.status-active {
  font-size: 0.9rem;
  color: #27ae60;
}

.no-towns {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 0.9rem;
}

:global(.dark-mode) .no-towns {
  color: #666;
}

.towns-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.town-item {
  padding: 12px;
  background: white;
  border: 2px solid #ddd;
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.town-item:hover {
  border-color: #4a90e2;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.town-item.current {
  background: #e8f4f8;
  border-color: #4a90e2;
}

:global(.dark-mode) .town-item {
  background: #1a1a1a;
  border-color: #555;
}

:global(.dark-mode) .town-item.current {
  background: #1a2332;
  border-color: #5a9ae2;
}

.town-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.town-item-name {
  font-weight: 600;
  color: #333;
}

:global(.dark-mode) .town-item-name {
  color: #e5e5e5;
}

.current-badge {
  background: #4a90e2;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
}

.offline-badge {
  background: #999;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
}

.town-item-action {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}

:global(.dark-mode) .town-item-action {
  border-top-color: #444;
}

.btn-view-details {
  width: 100%;
  padding: 6px 12px;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-view-details:hover {
  background: #2980b9;
}

.town-details-overlay {
  z-index: 2000;
}

.town-details-modal {
  background: white;
  padding: 20px;
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

:global(.dark-mode) .town-details-modal {
  background: #2d2d2d;
  color: #e5e5e5;
}

.town-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 3px solid #4a90e2;
}

.town-details-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

:global(.dark-mode) .town-details-header h3 {
  color: #e5e5e5;
}

.town-details-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.details-section {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

:global(.dark-mode) .details-section {
  background: #1a1a1a;
}

.details-section h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #333;
}

:global(.dark-mode) .details-section h4 {
  color: #e5e5e5;
}

.no-characters,
.no-buildings {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 0.9rem;
}

:global(.dark-mode) .no-characters,
:global(.dark-mode) .no-buildings {
  color: #666;
}

.characters-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.character-item {
  padding: 10px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
}

:global(.dark-mode) .character-item {
  background: #2d2d2d;
  border-color: #555;
}

.character-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
}

:global(.dark-mode) .character-name {
  color: #e5e5e5;
}

.character-info {
  display: flex;
  gap: 15px;
  font-size: 0.85rem;
  color: #666;
  flex-wrap: wrap;
}

:global(.dark-mode) .character-info {
  color: #bbb;
}

.character-travel {
  margin-top: 6px;
  font-size: 0.8rem;
  color: #4a90e2;
  font-style: italic;
}

.buildings-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.building-item {
  padding: 8px 12px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}

:global(.dark-mode) .building-item {
  background: #2d2d2d;
  border-color: #555;
}

.building-name {
  font-weight: 500;
  color: #333;
}

:global(.dark-mode) .building-name {
  color: #e5e5e5;
}

.building-revenue {
  font-size: 0.85rem;
  color: #27ae60;
}

.town-item-info {
  display: flex;
  gap: 15px;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 8px;
}

:global(.dark-mode) .town-item-info {
  color: #bbb;
}

.town-buildings {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.building-tag {
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  color: #666;
}

:global(.dark-mode) .building-tag {
  background: #2d2d2d;
  color: #bbb;
}

.info-section {
  margin-top: 10px;
  padding: 12px;
  background: #f0f7ff;
  border-radius: 8px;
  border-left: 4px solid #4a90e2;
}

:global(.dark-mode) .info-section {
  background: #1a2332;
  border-left-color: #5a9ae2;
}

.info-text {
  margin: 0 0 8px 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: #333;
}

:global(.dark-mode) .info-text {
  color: #e5e5e5;
}

.info-list {
  margin: 0;
  padding-left: 20px;
  font-size: 0.85rem;
  color: #666;
  line-height: 1.6;
}

:global(.dark-mode) .info-list {
  color: #bbb;
}

.info-list li {
  margin-bottom: 4px;
}
</style>

