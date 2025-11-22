import { gameInstance } from './game';
import { io, Socket } from 'socket.io-client';

// 消息类型常量
export const MSG_TYPES = {
  CREATE_TOWN: 'create-town',
  JOIN_GAME: 'join-game',
  LEAVE_GAME: 'leave-game',
  UPDATE_STATE: 'update-state',
  REQUEST_TOWNS: 'request-towns',
  TOWNS_LIST: 'towns-list',
  CHARACTER_TRAVEL: 'character-travel',
  CROSS_TOWN_CONSUME: 'cross-town-consume',
  GAME_UPDATE: 'game-update'
};

export interface TownInfo {
  townId: string;
  townName: string;
  observerName?: string; // 旁观者名称
  playerId: string;
  characterCount: number;
  buildings: Array<{ id: string; name: string }>;
  isOnline?: boolean; // 是否在线
}

export class NetworkManager {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private currentTownId: string | null = null;
  private playerId: string;
  private towns: Map<string, TownInfo> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private syncInterval: number | null = null;

  constructor() {
    // 生成或获取玩家ID
    this.playerId = this.getOrCreatePlayerId();
  }

  // 连接到服务器
  connect(serverUrl: string = 'http://localhost:3000') {
    if (typeof window === 'undefined') {
      console.warn('网络管理器仅在浏览器环境中可用');
      return;
    }

    if (this.socket && this.socket.connected) {
      console.log('已连接到服务器，无需重复连接');
      return;
    }

    this.socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000
    });

    this.setupEventHandlers();
  }

  // 设置事件处理器
  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('已连接到服务器');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // 请求城镇列表
      this.requestTowns();
      
      // 如果有保存的城镇ID且游戏处于多人模式，尝试恢复城镇
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const savedTownId = localStorage.getItem('multiplayer_townId');
        if (savedTownId && gameInstance.state.isMultiplayerMode) {
      // 延迟一下，确保socket完全连接
      setTimeout(() => {
        const gameState = gameInstance.toJSON();
        const gameStateObj = JSON.parse(gameState);
        this.socket?.emit(MSG_TYPES.CREATE_TOWN, {
          townName: gameInstance.state.townName,
          observerName: gameInstance.state.observerName || '',
          playerId: this.playerId,
          gameState: gameStateObj
        });
      }, 500);
        }
      }
    });

    this.socket.on('disconnect', () => {
      console.log('与服务器断开连接');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('连接错误:', error);
      this.reconnectAttempts++;
    });

    // 城镇创建成功
    this.socket.on('town-created', (data: { townId: string; townName: string; isRestore?: boolean }) => {
      this.currentTownId = data.townId;
      // 保存城镇ID到localStorage
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem('multiplayer_townId', data.townId);
      }
      // 如果恢复城镇，确保启用多人模式
      if (data.isRestore && !gameInstance.state.isMultiplayerMode) {
        gameInstance.enableMultiplayerMode(data.townId);
      }
      if (data.isRestore) {
        console.log('城镇恢复成功:', data.townName);
      } else {
        console.log('城镇创建成功:', data.townName);
      }
    });

    // 收到城镇列表
    this.socket.on(MSG_TYPES.TOWNS_LIST, (data: { towns: TownInfo[] }) => {
      this.towns.clear();
      data.towns.forEach(town => {
        this.towns.set(town.townId, town);
      });
      console.log('城镇列表更新:', data.towns.length, '个城镇');
    });

    // 收到游戏状态更新
    this.socket.on(MSG_TYPES.GAME_UPDATE, (data: any) => {
      // 更新其他城镇的状态（只更新可见信息）
      console.log('收到其他城镇更新:', data.townId);
    });

    // 角色到达通知
    this.socket.on('character-arrived', (data: any) => {
      console.log(`角色 ${data.character.name} 从 ${data.fromTown} 到达`);
      gameInstance.log(`[🚶旅行] **${data.character.name}** 从 **${data.fromTown}** 来到了我们的 **${data.toTown}**！`, 'event');
    });

    // 角色离开通知
    this.socket.on('character-left', (data: any) => {
      console.log(`角色 ${data.characterName} 前往 ${data.toTown}`);
      gameInstance.log(`[🚶旅行] **${data.characterName}** 前往 **${data.toTown}** 旅行`, 'event');
    });

    // 跨城镇收入通知
    this.socket.on('cross-town-revenue', (data: any) => {
      console.log(`收到跨城镇收入: ${data.characterName} 在 ${data.buildingName} 消费 ${data.amount}`);
      gameInstance.log(`[💰收入] **${data.characterName}**（来自 **${data.fromTown}**）在 **${data.buildingName}** 消费了 💰${data.amount}！`, 'event');
    });

    // 角色消费通知
    this.socket.on('character-consumed', (data: any) => {
      console.log(`角色 ${data.characterName} 在 ${data.toTown} 的 ${data.buildingName} 消费 ${data.amount}`);
      gameInstance.log(`[💸消费] **${data.characterName}** 在 **${data.toTown}** 的 **${data.buildingName}** 消费了 💰${data.amount}`, 'event');
    });

    // 城镇被删除
    this.socket.on('town-removed', (data: { townId: string }) => {
      this.towns.delete(data.townId);
      if (this.currentTownId === data.townId) {
        this.currentTownId = null;
      }
    });

    // 错误处理
    this.socket.on('error', (error: any) => {
      console.error('服务器错误:', error);
      gameInstance.log(`❌ 网络错误: ${error.message}`, 'error');
    });
  }

  // 创建城镇（或恢复城镇）
  createTown(townName: string) {
    if (!this.socket || !this.isConnected) {
      console.error('未连接到服务器');
      return;
    }

    const gameState = gameInstance.toJSON();
    const gameStateObj = JSON.parse(gameState);
    this.socket.emit(MSG_TYPES.CREATE_TOWN, {
      townName,
      observerName: gameStateObj.observerName || '',
      playerId: this.playerId,
      gameState: gameStateObj
    });
  }

  // 加入游戏
  joinGame() {
    if (!this.socket || !this.isConnected) {
      console.error('未连接到服务器');
      return;
    }

    this.socket.emit(MSG_TYPES.JOIN_GAME);
  }

  // 请求城镇列表
  requestTowns() {
    if (!this.socket || !this.isConnected) {
      return;
    }

    this.socket.emit(MSG_TYPES.REQUEST_TOWNS);
  }

  // 更新城镇状态
  updateTownState() {
    if (!this.socket || !this.isConnected || !this.currentTownId) {
      return;
    }

    const gameState = JSON.parse(gameInstance.toJSON());
    this.socket.emit(MSG_TYPES.UPDATE_STATE, {
      townId: this.currentTownId,
      gameState
    });
  }

  // 角色跨城镇移动
  characterTravel(characterName: string, toTownId: string) {
    if (!this.socket || !this.isConnected || !this.currentTownId) {
      console.error('无法发送跨城镇移动请求');
      return;
    }

    this.socket.emit(MSG_TYPES.CHARACTER_TRAVEL, {
      characterName,
      fromTownId: this.currentTownId,
      toTownId
    });
  }

  // 跨城镇消费
  crossTownConsume(characterName: string, toTownId: string, buildingId: string, amount: number) {
    if (!this.socket || !this.isConnected || !this.currentTownId) {
      console.error('无法发送跨城镇消费请求');
      return;
    }

    this.socket.emit(MSG_TYPES.CROSS_TOWN_CONSUME, {
      characterName,
      fromTownId: this.currentTownId,
      toTownId,
      buildingId,
      amount
    });
  }

  // 开始自动同步
  startAutoSync(interval: number = 5000) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = window.setInterval(() => {
      if (this.isConnected && this.currentTownId) {
        this.updateTownState();
      }
    }, interval);
  }

  // 停止自动同步
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // 获取城镇列表
  getTowns(): TownInfo[] {
    return Array.from(this.towns.values());
  }

  // 获取当前城镇ID
  getCurrentTownId(): string | null {
    return this.currentTownId;
  }

  // 请求城镇详情（包括居民信息）
  requestTownDetails(townId: string, callback: (details: any) => void) {
    if (!this.socket || !this.isConnected) {
      console.error('未连接到服务器');
      return;
    }

    // 设置一次性监听器
    const handler = (data: any) => {
      if (data.townId === townId) {
        callback(data);
        this.socket?.off('town-details', handler);
      }
    };

    this.socket.on('town-details', handler);
    this.socket.emit('request-town-details', { townId });
  }

  // 断开连接
  disconnect() {
    this.stopAutoSync();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  // 获取或创建玩家ID
  private getOrCreatePlayerId(): string {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    let playerId = localStorage.getItem('multiplayer_playerId');
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('multiplayer_playerId', playerId);
    }
    return playerId;
  }
}

export const networkManager = new NetworkManager();

