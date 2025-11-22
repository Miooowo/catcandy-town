<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

// 粒子效果
const particles = ref<Array<{ x: number; y: number; delay: number; duration: number }>>([]);

onMounted(() => {
  // 生成随机粒子
  for (let i = 0; i < 30; i++) {
    particles.value.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 1 + Math.random() * 1.5
    });
  }
});
</script>

<template>
  <div v-if="visible" class="secret-modal-overlay" @click.self="close">
    <div class="secret-modal">
      <!-- 粒子背景 -->
      <div class="particles-container">
        <div
          v-for="(particle, index) in particles"
          :key="index"
          class="particle"
          :style="{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`
          }"
        >
          ✨
        </div>
      </div>
      
      <!-- 关闭按钮 -->
      <button class="secret-close" @click="close">×</button>
      
      <!-- 内容 -->
      <div class="secret-content">
        <div class="secret-icon">🎮</div>
        <h2 class="secret-title">恭喜！</h2>
        <p class="secret-message">
          你已经发现了绝世秘籍，<br>
          那我也没什么好教的了……
        </p>
        <div class="secret-divider"></div>
        <p class="secret-hint">调试面板已解锁</p>
        <button class="secret-button" @click="close">知道了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.secret-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  animation: fadeIn 0.3s ease;
  backdrop-filter: blur(4px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.secret-modal {
  position: relative;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(116, 185, 255, 0.3),
    inset 0 0 40px rgba(116, 185, 255, 0.1);
  animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  border: 2px solid rgba(116, 185, 255, 0.5);
}

@keyframes slideUp {
  from {
    transform: translateY(50px) scale(0.9);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

:global(.dark-mode) .secret-modal {
  background: linear-gradient(135deg, #0a0a1a 0%, #0d1520 50%, #081020 100%);
  border-color: rgba(116, 185, 255, 0.6);
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.8),
    0 0 0 2px rgba(116, 185, 255, 0.4),
    inset 0 0 40px rgba(116, 185, 255, 0.15);
}

.particles-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.particle {
  position: absolute;
  font-size: 20px;
  animation: float 2s ease-in-out infinite;
  opacity: 0;
}

@keyframes float {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0);
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-100px) scale(1.5);
  }
}

.secret-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 28px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
}

.secret-close:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: rotate(90deg);
}

.secret-content {
  position: relative;
  z-index: 5;
  text-align: center;
  color: #fff;
}

.secret-icon {
  font-size: 80px;
  margin-bottom: 20px;
  animation: bounce 1s ease-in-out infinite;
  filter: drop-shadow(0 0 20px rgba(116, 185, 255, 0.6));
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-10px) scale(1.1);
  }
}

.secret-title {
  font-size: 32px;
  font-weight: bold;
  margin: 0 0 20px 0;
  background: linear-gradient(135deg, #74b9ff 0%, #a29bfe 50%, #fd79a8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 30px rgba(116, 185, 255, 0.5);
  animation: glow 2s ease-in-out infinite;
  word-break: keep-all;
  white-space: nowrap;
}

@keyframes glow {
  0%, 100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.3);
  }
}

.secret-message {
  font-size: 20px;
  line-height: 1.6;
  margin: 0 0 24px 0;
  color: #dfe6e9;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.secret-divider {
  width: 200px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #74b9ff, transparent);
  margin: 24px auto;
  box-shadow: 0 0 10px rgba(116, 185, 255, 0.5);
}

.secret-hint {
  font-size: 14px;
  color: #74b9ff;
  margin: 0 0 24px 0;
  opacity: 0.8;
  font-style: italic;
}

.secret-button {
  background: linear-gradient(135deg, #74b9ff 0%, #a29bfe 100%);
  border: none;
  border-radius: 8px;
  padding: 12px 32px;
  font-size: 16px;
  font-weight: bold;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(116, 185, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.secret-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(116, 185, 255, 0.6);
  background: linear-gradient(135deg, #8bc5ff 0%, #b8b0ff 100%);
}

.secret-button:active {
  transform: translateY(0);
}

@media (max-width: 640px) {
  .secret-modal {
    padding: 30px 20px;
  }
  
  .secret-icon {
    font-size: 60px;
  }
  
  .secret-title {
    font-size: 26px;
  }
  
  .secret-message {
    font-size: 18px;
  }
}
</style>

