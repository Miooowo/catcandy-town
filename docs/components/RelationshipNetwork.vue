<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
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

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

// 画布状态
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const draggedNode = ref<string | null>(null);
const isStable = ref(false); // 是否已稳定
const physicsEnabled = ref(true); // 默认启用物理模拟（动态但温和）
const isDraggingNode = ref(false); // 是否正在拖拽节点

// 节点和边的数据
interface Node {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number; // 速度
  vy: number;
  radius: number;
  color: string;
}

interface Edge {
  from: string;
  to: string;
  type: 'marriage' | 'romance' | 'friendship' | 'family' | 'special' | 'other';
  love: number;
  status: string;
}

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

// 初始化节点位置（静态圆形布局）
const initializeNodes = () => {
  const chars = gameInstance.state.chars;
  const radius = Math.max(250, chars.length * 15); // 根据人数调整半径
  nodes.value = chars.map((char, index) => {
    // 静态圆形分布
    const angle = (index / chars.length) * Math.PI * 2;
    return {
      id: char.name,
      name: char.name,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      radius: 30,
      color: getNodeColor(char)
    };
  });
};

// 获取节点颜色（根据性格）
const getNodeColor = (char: Character): string => {
  const personality = char.personality.name;
  if (personality === '易怒' || personality === '刻薄') return '#e74c3c';
  if (personality === '开朗' || personality === '温柔' || personality === '幽默') return '#27ae60';
  if (personality === '沉着') return '#3498db';
  return '#95a5a6';
};

// 获取边的颜色
const getEdgeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    'marriage': '#e84393',
    'romance': '#ff7675',
    'friendship': '#3498db',
    'family': '#9b59b6',
    'special': '#ec4899', // 特殊关系（炮友）使用粉色
    'other': '#999'
  };
  return colorMap[type] || '#999';
};

// 构建关系数据
const buildRelationships = () => {
  edges.value = [];
  const addedPairs = new Set<string>();

  gameInstance.state.chars.forEach(char => {
    // 婚姻关系
    if (char.partner) {
      const pairKey = [char.name, char.partner].sort().join('-');
      if (!addedPairs.has(pairKey)) {
        addedPairs.add(pairKey);
        edges.value.push({
          from: char.name,
          to: char.partner,
          type: 'marriage',
          love: char.relationships[char.partner]?.love || 0,
          status: 'spouse'
        });
      }
    }

    // 亲子关系
    if (char.children && char.children.length > 0) {
      char.children.forEach(childName => {
        edges.value.push({
          from: char.name,
          to: childName,
          type: 'family',
          love: 100,
          status: 'parent'
        });
      });
    }

    // 炮友关系（从fwbList中获取）
    if (char.fwbList && char.fwbList.length > 0) {
      char.fwbList.forEach(fwbName => {
        const pairKey = [char.name, fwbName].sort().join('-');
        if (!addedPairs.has(pairKey)) {
          addedPairs.add(pairKey);
          const fwbRel = char.relationships[fwbName];
          edges.value.push({
            from: char.name,
            to: fwbName,
            type: 'special', // 炮友属于特殊关系
            love: fwbRel?.love || 0,
            status: 'fwb'
          });
        }
      });
    }

    // 所有关系（排除陌生人和普通朋友）
    Object.entries(char.relationships).forEach(([otherName, rel]) => {
      if (otherName === char.partner) return;
      if (char.children && char.children.includes(otherName)) return;
      
      // 排除陌生人和普通朋友
      if (rel.status === 'stranger' || rel.status === 'friend') return;
      
      // 只显示重要关系（非陌生人、非普通朋友）
      const pairKey = [char.name, otherName].sort().join('-');
      if (!addedPairs.has(pairKey)) {
        addedPairs.add(pairKey);
        const type = getRelationshipType(rel.status);
        edges.value.push({
          from: char.name,
          to: otherName,
          type: type,
          love: rel.love,
          status: rel.status
        });
      }
    });
  });
};

const getRelationshipType = (status: string): 'marriage' | 'romance' | 'friendship' | 'family' | 'special' | 'other' => {
  if (status === 'spouse') return 'marriage';
  if (status === 'lover' || status === 'mistress') return 'romance';
  if (status === 'friend' || status === 'bestfriend') return 'friendship';
  if (status === 'parent' || status === 'child') return 'family';
  if (status === 'fwb') return 'special'; // 炮友属于特殊关系
  if (status === 'stranger') return 'other';
  return 'other';
};

// 力导向布局算法（默认启用，温和的物理效果）
const updatePhysics = () => {
  if (!physicsEnabled.value) return;
  
  const repulsion = 800; // 排斥力（降低，更温和）
  const attraction = 0.01; // 吸引力（降低，更温和）
  const damping = 0.85; // 阻尼（增加，更快稳定）
  const minDistance = 100; // 最小距离
  const maxSpeed = 2; // 最大速度（降低，更温和）

  let totalMovement = 0; // 总移动量，用于检测稳定性

  // 计算节点之间的力
  nodes.value.forEach(node => {
    // 被拖拽的节点不参与物理计算
    if (draggedNode.value === node.id) {
      node.vx = 0;
      node.vy = 0;
      return;
    }
    
    let fx = 0, fy = 0;

    // 节点之间的排斥力
    nodes.value.forEach(other => {
      if (node.id === other.id || draggedNode.value === other.id) return;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      
      if (distance < minDistance) {
        const force = repulsion / (distance * distance);
        fx += (dx / distance) * force;
        fy += (dy / distance) * force;
      } else {
        const force = repulsion / (distance * distance + 100);
        fx += (dx / distance) * force;
        fy += (dy / distance) * force;
      }
    });

    // 边之间的吸引力
    edges.value.forEach(edge => {
      if (edge.from === node.id) {
        const target = nodes.value.find(n => n.id === edge.to);
        if (target) {
          const dx = target.x - node.x;
          const dy = target.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const idealDistance = 150; // 理想距离
          const distanceDiff = distance - idealDistance;
          fx += (dx / distance) * attraction * distanceDiff;
          fy += (dy / distance) * attraction * distanceDiff;
        }
      }
    });

    // 更新速度（更温和的加速度）
    node.vx = (node.vx + fx * 0.05) * damping; // 降低加速度
    node.vy = (node.vy + fy * 0.05) * damping;

    // 限制最大速度
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > maxSpeed) {
      node.vx = (node.vx / speed) * maxSpeed;
      node.vy = (node.vy / speed) * maxSpeed;
    }

    // 更新位置
    node.x += node.vx;
    node.y += node.vy;
    
    // 累计移动量
    totalMovement += Math.abs(node.vx) + Math.abs(node.vy);
  });

  // 检测稳定性：如果总移动量很小，认为已稳定
  if (totalMovement < 0.1 && !isDraggingNode.value) {
    isStable.value = true;
    // 稳定后可以进一步降低物理模拟频率，但保持启用
  } else {
    isStable.value = false;
  }
};

// 获取关系标注文字
const getEdgeLabel = (status: string): string => {
  const labelMap: Record<string, string> = {
    'fwb': '炮',
    'spouse': '婚',
    'lover': '恋',
    'mistress': '三',
    'bestfriend': '挚',
    'friend': '友',
    'stranger': '陌',
    'ex': '前',
    'parent': '亲',
    'child': '子'
  };
  return labelMap[status] || '';
};

// 绘制网络图
const draw = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 设置画布大小
  if (containerRef.value) {
    canvas.width = containerRef.value.clientWidth;
    canvas.height = containerRef.value.clientHeight;
  }

  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 应用变换
  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX.value, canvas.height / 2 + offsetY.value);
  ctx.scale(scale.value, scale.value);

  // 绘制边
  edges.value.forEach(edge => {
    const fromNode = nodes.value.find(n => n.id === edge.from);
    const toNode = nodes.value.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;
    const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);

    ctx.strokeStyle = getEdgeColor(edge.type);
    ctx.lineWidth = Math.max(1, edge.love / 20); // 根据好感度调整线条粗细
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(toNode.x, toNode.y);
    ctx.stroke();

    // 绘制连线标注
    const label = getEdgeLabel(edge.status);
    if (label) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = getEdgeColor(edge.type);
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 在连线中点绘制文字背景（白色圆）
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(midX, midY, 12, 0, Math.PI * 2);
      ctx.fill();
      
      // 绘制文字
      ctx.fillStyle = getEdgeColor(edge.type);
      ctx.fillText(label, midX, midY);
      ctx.restore();
    }
  });

  ctx.globalAlpha = 1;

  // 绘制节点
  nodes.value.forEach(node => {
    // 外圈
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    // 内圈（白色）
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius - 3, 0, Math.PI * 2);
    ctx.fill();

    // 文字
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y);
  });

  ctx.restore();
};

// 动画循环（默认启用物理模拟）
let animationId: number | null = null;
const animate = () => {
  // 默认启用物理模拟（温和的动态效果）
  if (physicsEnabled.value) {
    updatePhysics();
  }
  draw();
  animationId = requestAnimationFrame(animate);
};

// 切换物理模拟
const togglePhysics = () => {
  physicsEnabled.value = !physicsEnabled.value;
  if (!physicsEnabled.value) {
    // 禁用时停止所有节点运动
    nodes.value.forEach(node => {
      node.vx = 0;
      node.vy = 0;
    });
  }
};

// 手动稳定（停止所有节点运动）
const stabilize = () => {
  nodes.value.forEach(node => {
    node.vx = 0;
    node.vy = 0;
  });
  isStable.value = true;
  physicsEnabled.value = false; // 稳定后禁用物理模拟
};

// 鼠标事件处理
const handleMouseDown = (e: MouseEvent) => {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const x = (e.clientX - rect.left - canvasRef.value.width / 2 - offsetX.value) / scale.value;
  const y = (e.clientY - rect.top - canvasRef.value.height / 2 - offsetY.value) / scale.value;

  // 检查是否点击了节点
  const clickedNode = nodes.value.find(node => {
    const dx = x - node.x;
    const dy = y - node.y;
    return Math.sqrt(dx * dx + dy * dy) < node.radius;
  });

  if (clickedNode) {
    draggedNode.value = clickedNode.id;
    isDragging.value = true;
    isDraggingNode.value = true; // 标记正在拖拽节点
    // 保持物理模拟启用（默认已启用）
    // 停止被拖拽节点的速度
    const node = nodes.value.find(n => n.id === clickedNode.id);
    if (node) {
      node.vx = 0;
      node.vy = 0;
    }
  } else {
    isDragging.value = true;
    isDraggingNode.value = false; // 拖拽画布，物理模拟继续运行
    dragStart.value = { x: e.clientX - offsetX.value, y: e.clientY - offsetY.value };
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;

  if (draggedNode.value) {
    // 拖拽节点
    const node = nodes.value.find(n => n.id === draggedNode.value);
    if (node && canvasRef.value) {
      const rect = canvasRef.value.getBoundingClientRect();
      const x = (e.clientX - rect.left - canvasRef.value.width / 2 - offsetX.value) / scale.value;
      const y = (e.clientY - rect.top - canvasRef.value.height / 2 - offsetY.value) / scale.value;
      node.x = x;
      node.y = y;
      node.vx = 0;
      node.vy = 0;
    }
  } else {
    // 拖拽画布
    offsetX.value = e.clientX - dragStart.value.x;
    offsetY.value = e.clientY - dragStart.value.y;
  }
  draw();
};

const handleMouseUp = () => {
  isDragging.value = false;
  if (draggedNode.value) {
    // 停止被拖拽节点的速度
    const node = nodes.value.find(n => n.id === draggedNode.value);
    if (node) {
      node.vx = 0;
      node.vy = 0;
    }
  }
  draggedNode.value = null;
  isDraggingNode.value = false; // 停止拖拽
  // 保持物理模拟启用（默认已启用，继续运行）
};

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale.value = Math.max(0.3, Math.min(3, scale.value * delta));
  draw();
};

// 监听可见性变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      initializeNodes();
      buildRelationships();
      isStable.value = false; // 初始不稳定，需要物理模拟
      physicsEnabled.value = true; // 默认启用物理模拟（温和的动态效果）
      isDraggingNode.value = false; // 默认不拖拽
      animate();
    });
  } else {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    // 重置状态
    isDraggingNode.value = false;
    draggedNode.value = null;
  }
});

onMounted(() => {
  if (props.visible) {
    nextTick(() => {
      initializeNodes();
      buildRelationships();
      isStable.value = false; // 初始不稳定，需要物理模拟
      physicsEnabled.value = true; // 默认启用物理模拟（温和的动态效果）
      isDraggingNode.value = false; // 默认不拖拽
      animate();
    });
  }
});

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="closeModal">
    <div class="network-modal-content">
      <div class="network-header">
        <h3 class="network-title">🕸️ 关系网络图</h3>
        <div class="network-controls">
          <button @click="togglePhysics" :class="['btn-physics', { active: physicsEnabled }]" :title="physicsEnabled ? '暂停物理效果' : '启用物理效果'">
            {{ physicsEnabled ? '⏸️ 暂停' : '▶️ 播放' }}
          </button>
          <button @click="stabilize" class="btn-stabilize" title="稳定布局">⚡ 稳定</button>
          <button @click="scale = 1; offsetX = 0; offsetY = 0; draw()" class="btn-reset-view" title="重置视图">🔄 重置</button>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
      </div>
      
      <div class="network-legend">
        <div class="legend-item">
          <span class="legend-color" style="background: #e84393;"></span>
          <span>婚姻</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #ff7675;"></span>
          <span>恋爱</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #3498db;"></span>
          <span>友谊</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #9b59b6;"></span>
          <span>家庭</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #ec4899;"></span>
          <span>特殊</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #999;"></span>
          <span>其他</span>
        </div>
        <div class="legend-hint">💡 拖拽节点移动，滚轮缩放，拖拽空白处平移</div>
      </div>
      
      <div ref="containerRef" class="network-canvas-container">
        <canvas 
          ref="canvasRef" 
          class="network-canvas"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseUp"
          @wheel="handleWheel"
        ></canvas>
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

.network-modal-content {
  background: white;
  border-radius: 12px;
  max-width: 95vw;
  max-height: 95vh;
  width: 1200px;
  height: 800px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

:global(.dark-mode) .network-modal-content {
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

.network-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

:global(.dark-mode) .network-header {
  border-bottom-color: #404040;
}

.network-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #1f2937;
}

:global(.dark-mode) .network-title {
  color: #e5e5e5;
}

.network-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-reset-view {
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease;
}

.btn-reset-view:hover {
  background: #2980b9;
}

.btn-stabilize {
  padding: 6px 12px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease;
}

.btn-stabilize:hover {
  background: #229954;
}

.btn-physics {
  padding: 6px 12px;
  background: #95a5a6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease;
}

.btn-physics.active {
  background: #e74c3c;
}

.btn-physics:hover {
  opacity: 0.9;
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

.network-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  flex-wrap: wrap;
  font-size: 12px;
}

:global(.dark-mode) .network-legend {
  border-bottom-color: #404040;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6b7280;
}

:global(.dark-mode) .legend-item {
  color: #b0b0b0;
}

.legend-color {
  width: 16px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}

.legend-hint {
  margin-left: auto;
  color: #9ca3af;
  font-size: 11px;
}

:global(.dark-mode) .legend-hint {
  color: #888;
}

.network-canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #f9fafb;
  cursor: grab;
}

:global(.dark-mode) .network-canvas-container {
  background: #1a1a1a;
}

.network-canvas-container:active {
  cursor: grabbing;
}

.network-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>

