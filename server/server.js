import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 房间管理：每个房间代表一个游戏会话
const rooms = new Map();

// 城镇管理：存储所有城镇的状态
const towns = new Map(); // townId -> { townName, playerId, gameState }

// 消息类型常量
const MSG_TYPES = {
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

io.on('connection', (socket) => {
  console.log('玩家连接:', socket.id);

  // 创建城镇
  socket.on(MSG_TYPES.CREATE_TOWN, (data) => {
    const { townName, playerId, gameState } = data;
    const townId = `town_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    towns.set(townId, {
      townId,
      townName,
      playerId: socket.id,
      gameState,
      lastUpdate: Date.now(),
      characters: gameState?.chars || []
    });

    socket.join(townId);
    socket.emit('town-created', { townId, townName });
    
    // 广播城镇列表更新
    broadcastTownsList();
    
    console.log(`城镇创建: ${townName} (${townId})`);
  });

  // 加入游戏（获取所有城镇列表）
  socket.on(MSG_TYPES.JOIN_GAME, () => {
    broadcastTownsList(socket);
  });

  // 请求城镇列表
  socket.on(MSG_TYPES.REQUEST_TOWNS, () => {
    broadcastTownsList(socket);
  });

  // 更新城镇状态
  socket.on(MSG_TYPES.UPDATE_STATE, (data) => {
    const { townId, gameState } = data;
    const town = towns.get(townId);
    
    if (town && town.playerId === socket.id) {
      town.gameState = gameState;
      town.characters = gameState?.chars || [];
      town.lastUpdate = Date.now();
      
      // 广播给其他玩家（让他们知道这个城镇的状态）
      socket.to(townId).emit(MSG_TYPES.GAME_UPDATE, {
        townId,
        gameState: {
          townName: town.townName,
          chars: town.characters.map(char => ({
            name: char.name,
            currentTown: char.currentTown || townId,
            currentAction: char.currentAction,
            money: char.money,
            happiness: char.happiness
          })),
          buildings: gameState.buildings.map(b => ({
            id: b.id,
            name: b.name,
            isBuilt: b.isBuilt,
            totalRevenue: b.totalRevenue
          }))
        }
      });
    }
  });

  // 角色跨城镇移动
  socket.on(MSG_TYPES.CHARACTER_TRAVEL, (data) => {
    const { characterName, fromTownId, toTownId } = data;
    
    const fromTown = towns.get(fromTownId);
    const toTown = towns.get(toTownId);
    
    if (!fromTown || !toTown) {
      socket.emit('error', { message: '城镇不存在' });
      return;
    }

    // 从源城镇移除角色
    if (fromTown.gameState?.chars) {
      const charIndex = fromTown.gameState.chars.findIndex(c => c.name === characterName);
      if (charIndex !== -1) {
        const character = fromTown.gameState.chars[charIndex];
        character.currentTown = toTownId;
        character.currentAction = `在 ${toTown.townName} 旅行`;
        
        // 通知目标城镇
        const toTownSocket = io.sockets.sockets.get(toTown.playerId);
        if (toTownSocket) {
          toTownSocket.emit('character-arrived', {
            character,
            fromTown: fromTown.townName,
            toTown: toTown.townName
          });
        }
        
        // 通知源城镇
        const fromTownSocket = io.sockets.sockets.get(fromTown.playerId);
        if (fromTownSocket) {
          fromTownSocket.emit('character-left', {
            characterName,
            toTown: toTown.townName
          });
        }
      }
    }
  });

  // 跨城镇消费（例如在别的城镇的酒店住宿）
  socket.on(MSG_TYPES.CROSS_TOWN_CONSUME, (data) => {
    const { characterName, fromTownId, toTownId, buildingId, amount } = data;
    
    const fromTown = towns.get(fromTownId);
    const toTown = towns.get(toTownId);
    
    if (!fromTown || !toTown) {
      socket.emit('error', { message: '城镇不存在' });
      return;
    }

    // 找到目标建筑
    const building = toTown.gameState?.buildings?.find(b => b.id === buildingId);
    if (!building || !building.isBuilt) {
      socket.emit('error', { message: '建筑不存在或未建成' });
      return;
    }

    // 增加目标城镇的建筑收入
    building.totalRevenue = (building.totalRevenue || 0) + amount;
    
    // 如果有员工，分配收入
    if (building.staff && building.staff.length > 0) {
      // 这里可以调用目标城镇的收入分配逻辑
      // 暂时直接加到建筑收入
    } else {
      // 没有员工，收入进入目标城镇的镇库
      toTown.gameState.townMoney = (toTown.gameState.townMoney || 0) + amount;
    }

    // 通知目标城镇的玩家
    const toTownSocket = io.sockets.sockets.get(toTown.playerId);
    if (toTownSocket) {
      toTownSocket.emit('cross-town-revenue', {
        characterName,
        fromTown: fromTown.townName,
        buildingId,
        buildingName: building.name,
        amount
      });
    }

    // 通知源城镇的玩家
    const fromTownSocket = io.sockets.sockets.get(fromTown.playerId);
    if (fromTownSocket) {
      fromTownSocket.emit('character-consumed', {
        characterName,
        toTown: toTown.townName,
        buildingName: building.name,
        amount
      });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('玩家断开:', socket.id);
    
    // 清理城镇（如果玩家是城镇主人）
    for (const [townId, town] of towns.entries()) {
      if (town.playerId === socket.id) {
        towns.delete(townId);
        io.emit('town-removed', { townId });
        console.log(`城镇删除: ${town.townName} (${townId})`);
      }
    }
    
    broadcastTownsList();
  });

  // 广播城镇列表
  function broadcastTownsList(targetSocket = null) {
    const townsList = Array.from(towns.values()).map(town => ({
      townId: town.townId,
      townName: town.townName,
      playerId: town.playerId,
      characterCount: town.characters?.length || 0,
      buildings: town.gameState?.buildings?.filter(b => b.isBuilt).map(b => ({
        id: b.id,
        name: b.name
      })) || []
    }));

    if (targetSocket) {
      targetSocket.emit(MSG_TYPES.TOWNS_LIST, { towns: townsList });
    } else {
      io.emit(MSG_TYPES.TOWNS_LIST, { towns: townsList });
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看服务器状态`);
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    towns: towns.size,
    timestamp: Date.now()
  });
});

