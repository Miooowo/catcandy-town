# 猫果镇物语 - 多人联机服务器

## 安装依赖

```bash
cd server
npm install
```

## 启动服务器

```bash
npm start
```

或者开发模式（自动重启）：

```bash
npm run dev
```

服务器默认运行在 `http://localhost:3000`

## 环境变量

- `PORT`: 服务器端口（默认: 3000）

## API 端点

- `GET /health`: 健康检查，返回服务器状态

## Socket.io 事件

### 客户端发送

- `create-town`: 创建城镇
- `join-game`: 加入游戏（获取城镇列表）
- `request-towns`: 请求城镇列表
- `update-state`: 更新城镇状态
- `character-travel`: 角色跨城镇移动
- `cross-town-consume`: 跨城镇消费

### 服务器发送

- `town-created`: 城镇创建成功
- `towns-list`: 城镇列表
- `game-update`: 游戏状态更新
- `character-arrived`: 角色到达
- `character-left`: 角色离开
- `cross-town-revenue`: 跨城镇收入
- `character-consumed`: 角色消费
- `town-removed`: 城镇被删除

## 部署

### Railway

1. 在 Railway 创建新项目
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 设置启动命令: `npm start`
5. 设置环境变量 `PORT`（Railway 会自动提供）

### Render

1. 创建新的 Web Service
2. 连接 GitHub 仓库
3. 设置根目录为 `server/`
4. 设置构建命令: `npm install`
5. 设置启动命令: `npm start`

### VPS (自建)

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆项目
git clone <your-repo>
cd catcandy-town/server

# 安装依赖
npm install

# 使用 PM2 运行（推荐）
npm install -g pm2
pm2 start server.js --name catcandy-town-server
pm2 save
pm2 startup
```

