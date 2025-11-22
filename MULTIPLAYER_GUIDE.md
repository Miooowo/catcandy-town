# 多人联机模式使用指南

## 快速开始

### 1. 启动服务器

```bash
cd server
npm install
npm start
```

服务器将运行在 `http://localhost:3000`

### 2. 启动游戏

在浏览器中打开游戏，点击控制面板的 **🌐 多人模式** 按钮。

### 3. 连接服务器

1. 在多人模式弹窗中输入服务器地址（默认: `http://localhost:3000`）
2. 点击 **连接服务器**
3. 输入城镇名称，点击 **创建城镇**

### 4. 开始游戏

创建城镇后，游戏会自动启用多人模式。你的居民会自动：
- 前往其他城镇消费（如果本地没有相应建筑）
- 在其他城镇的酒店住宿（如果本地没有酒店）
- 为其他城镇带来收入

## 功能说明

### 跨城镇消费机制

- **自动触发**：当本地没有可用建筑时，居民有30%概率前往其他城镇
- **特定需求**：喜欢睡觉的居民会优先前往有酒店的城镇
- **旅行冷却**：每次跨城镇消费后有2-4小时的冷却时间
- **收入分配**：跨城镇消费的收入会分配给目标城镇的建筑

### 角色状态显示

在多人模式下，角色卡片会显示：
- 当前所在城镇（如果不在自己的城镇）
- 跨城镇旅行状态

### 城镇信息

在多人模式弹窗中可以查看：
- 所有在线城镇列表
- 每个城镇的居民数量
- 每个城镇已建成的建筑

## 部署服务器

### 本地开发

```bash
cd server
npm install
npm start
```

### 生产环境部署

#### Railway

1. 在 Railway 创建新项目
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 设置启动命令: `npm start`

#### Render

1. 创建新的 Web Service
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 设置构建命令: `npm install`
5. 设置启动命令: `npm start`

#### VPS

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆项目
git clone <your-repo>
cd catcandy-town/server

# 安装依赖
npm install

# 使用 PM2 运行
npm install -g pm2
pm2 start server.js --name catcandy-town-server
pm2 save
pm2 startup
```

## 技术架构

- **服务器**: Node.js + Express + Socket.io
- **客户端**: Vue 3 + Socket.io-client
- **通信协议**: WebSocket (Socket.io)
- **数据同步**: 每5秒自动同步游戏状态

## 注意事项

1. 服务器需要保持运行，所有玩家才能正常联机
2. 跨城镇消费需要角色有足够的金钱
3. 旅行有冷却时间，防止频繁跨城镇
4. 角色卡片不会移动，但会显示当前所在城镇

