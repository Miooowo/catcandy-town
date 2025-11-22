<script setup lang="ts">
import { computed } from 'vue';
import { Building } from '../core/building';
import { gameInstance } from '../core/game';

const props = defineProps<{
  building: Building | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const closeModal = () => {
  emit('close');
};

// 计算日均收入
const averageDailyRevenue = computed(() => {
  if (!props.building || !props.building.isBuilt) return 0;
  if (!props.building.revenueHistory || props.building.revenueHistory.length === 0) {
    return 0;
  }
  const total = props.building.revenueHistory.reduce((a, b) => a + b, 0);
  return Math.floor(total / props.building.revenueHistory.length);
});

// 计算日均员工收入（基于员工收入历史）
const averageDailyStaffIncome = computed(() => {
  if (!props.building || !props.building.isBuilt) return 0;
  if (!props.building.staffIncomeHistory || props.building.staffIncomeHistory.length === 0) {
    return 0;
  }
  const total = props.building.staffIncomeHistory.reduce((a, b) => a + b, 0);
  return Math.floor(total / props.building.staffIncomeHistory.length);
});

// 获取工作人员信息
const staffInfo = computed(() => {
  if (!props.building || !props.building.staff || props.building.staff.length === 0) {
    return [];
  }
  
  // 计算日均员工总收入（三人今日总收入）
  const avgDailyTotalStaffIncome = averageDailyStaffIncome.value;
  
  return props.building.staff.map((staffName, index) => {
    const char = gameInstance.state.chars.find(c => c.name === staffName);
    if (!char) return null;
    const role = props.building!.jobs[index] || '未知';
    
    // 从这个建筑获得的收入（工资）
    const buildingIncome = char.buildingIncome?.[props.building!.id] || 0;
    
    // 计算日均收入：根据员工收入历史计算平均每日总收入，然后按比例分配
    // 如果日均员工总收入为0，则按游戏天数计算
    let avgDailyIncome = 0;
    if (avgDailyTotalStaffIncome > 0 && props.building.staffIncomeHistory.length > 0) {
      // 根据该员工从该建筑获得的总收入，按比例计算日均收入
      const totalStaffIncome = props.building.staffIncomeHistory.reduce((a, b) => a + b, 0);
      if (totalStaffIncome > 0) {
        const incomeRatio = buildingIncome / totalStaffIncome; // 该员工收入占比
        avgDailyIncome = Math.floor(avgDailyTotalStaffIncome * incomeRatio);
      }
    } else {
      // 如果没有历史记录，按游戏天数计算
      const daysWorked = gameInstance.state.totalDaysPassed || 1;
      avgDailyIncome = daysWorked > 0 ? Math.floor(buildingIncome / daysWorked) : 0;
    }
    
    return {
      name: staffName,
      role: role,
      avgDailyIncome: avgDailyIncome,
      totalWorkIncome: buildingIncome, // 从这个建筑获得的总收入
      character: char
    };
  }).filter(s => s !== null);
});

// 计算所有工作人员的平均收入（基于员工收入历史）
const averageStaffIncome = computed(() => {
  if (!props.building || !props.building.staff || props.building.staff.length === 0) {
    return 0;
  }
  
  // 直接使用日均员工总收入除以员工数量
  const avgDailyTotalStaffIncome = averageDailyStaffIncome.value;
  return avgDailyTotalStaffIncome > 0 ? Math.floor(avgDailyTotalStaffIncome / props.building.staff.length) : 0;
});

// 获取营业时间显示
const operatingHours = computed(() => {
  if (!props.building) return '';
  if (props.building.open === 0 && props.building.close === 24) {
    return '24小时营业';
  }
  return `${props.building.open}:00 - ${props.building.close}:00`;
});

// 获取休息日显示
const closedDaysText = computed(() => {
  if (!props.building || !props.building.closedDays || props.building.closedDays.length === 0) {
    return '无';
  }
  const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return props.building.closedDays.map(d => DAYS[d]).join('、');
});

// 计算升级费用
const upgradeCost = computed(() => {
  if (!props.building || !props.building.isBuilt) return 0;
  return Math.floor((props.building.totalCost || 0) * 0.5 * (props.building.level || 1));
});

// 检查是否可以升级
const canUpgrade = computed(() => {
  if (!props.building || !props.building.isBuilt) return false;
  return (props.building.companyFunds || 0) >= upgradeCost.value;
});

// 升级建筑
const handleUpgrade = () => {
  if (!props.building) return;
  if (canUpgrade.value) {
    gameInstance.upgradeBuilding(props.building);
  }
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="closeModal">
    <div class="profile-modal-content">
      <div class="profile-header">
        <h3 class="profile-title">🏢 {{ building?.name }} 的详细信息</h3>
        <button class="modal-close" @click="closeModal">×</button>
      </div>
      <div v-if="building" class="profile-content">
        <!-- 基本信息 -->
        <div class="profile-section">
          <h4>📋 基本信息</h4>
          <div class="profile-row">
            <span class="profile-label">状态：</span>
            <span v-if="building.isBuilt" class="profile-value" style="color: #27ae60;">✅ 已建成</span>
            <span v-else class="profile-value" style="color: #e67e22;">🏗️ 建设中 ({{ Math.floor((building.currentProgress / building.totalCost) * 100) }}%)</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">描述：</span>
            <span class="profile-value">{{ building.desc }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">建筑等级：</span>
            <span class="profile-value" style="color: #3498db; font-weight: bold;">⭐ {{ building.level || 1 }} 级</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">基础工资：</span>
            <span class="profile-value">💰{{ building.baseSalary || 10 }}/次</span>
          </div>
          <div v-if="building.isBuilt && building.staff.length > 0" class="profile-row">
            <span class="profile-label">公司账户：</span>
            <span class="profile-value" style="color: #27ae60; font-weight: bold;">💰{{ building.companyFunds || 0 }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">营业时间：</span>
            <span class="profile-value">{{ operatingHours }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">休息日：</span>
            <span class="profile-value">{{ closedDaysText }}</span>
          </div>
        </div>

        <!-- 收入统计 -->
        <div v-if="building.isBuilt" class="profile-section">
          <h4>💰 收入统计</h4>
          <div class="profile-row">
            <span class="profile-label">总收入：</span>
            <span class="profile-value">💰{{ building.totalRevenue || 0 }}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">日均收入：</span>
            <span class="profile-value" style="color: #27ae60; font-weight: bold;">💰{{ averageDailyRevenue }}</span>
            <span class="profile-value" style="color: #999; font-size: 12px; margin-left: 8px;">
              (基于最近{{ building.revenueHistory?.length || 0 }}天)
            </span>
          </div>
        </div>

        <!-- 工作人员 -->
        <div v-if="building.jobs && building.jobs.length > 0" class="profile-section">
          <h4>👥 工作人员 ({{ building.staff.length }}/{{ building.jobs.length }})</h4>
          <div v-if="staffInfo.length > 0" class="staff-list">
            <div v-for="(staff, index) in staffInfo" :key="index" class="staff-item">
              <div class="staff-header">
                <span class="staff-role">{{ staff?.role }}</span>
                <span class="staff-name">{{ staff?.name }}</span>
              </div>
              <div class="staff-details">
                <span class="staff-salary">日均收入: 💰{{ staff?.avgDailyIncome || 0 }}</span>
                <span class="staff-total">总收入: 💰{{ staff?.totalWorkIncome || 0 }}</span>
              </div>
            </div>
          </div>
          <div v-else class="profile-row">
            <span class="profile-value no-info">暂无工作人员</span>
          </div>
          <div v-if="staffInfo.length > 0" class="profile-row" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vp-c-divider);">
            <span class="profile-label">平均收入：</span>
            <span class="profile-value" style="color: #27ae60; font-weight: bold;">💰{{ averageStaffIncome }}/天</span>
            <span class="profile-value" style="color: #999; font-size: 12px; margin-left: 8px;">
              (三人今日总收入: 💰{{ averageDailyStaffIncome }})
            </span>
          </div>
        </div>

        <!-- 商品/服务信息 -->
        <div v-if="building.products && building.products.length > 0" class="profile-section">
          <h4 v-if="building.id === 'bar'">🍺 售卖商品</h4>
          <h4 v-else-if="building.id === 'hotel'">🏨 房间选择</h4>
          <h4 v-else-if="building.id === 'cinema'">🎬 正在热映</h4>
          <h4 v-else-if="building.id === 'hospital'">🏥 医疗服务</h4>
          <h4 v-else-if="building.id === 'pharmacy'">💊 药品售卖</h4>
          <h4 v-else>🛒 商品/服务</h4>
          <div class="products-list">
            <div v-for="(product, index) in building.products" :key="index" class="product-item">
              <div class="product-info">
                <span class="product-name">{{ product.name }}</span>
                <span class="product-price">💰{{ product.price }}元</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 特殊信息 -->
        <div v-if="building.id === 'footshop' && building.prostitutes && building.prostitutes.length > 0" class="profile-section">
          <h4>💋 特殊工作人员</h4>
          <div class="profile-row">
            <span class="profile-label">卖银者：</span>
            <span class="profile-value">{{ building.prostitutes.join('、') }}</span>
          </div>
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
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.profile-modal-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 95%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
  margin: 10px;
}

@media (min-width: 768px) {
  .profile-modal-content {
    width: 90%;
    margin: 0;
  }
}

:global(.dark-mode) .profile-modal-content {
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

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

@media (min-width: 768px) {
  .profile-header {
    padding: 20px;
  }
}

:global(.dark-mode) .profile-header {
  border-bottom-color: #404040;
}

.profile-title {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #1f2937;
}

@media (min-width: 768px) {
  .profile-title {
    font-size: 20px;
  }
}

:global(.dark-mode) .profile-title {
  color: #e5e5e5;
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
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #333;
}

:global(.dark-mode) .modal-close:hover {
  background: #404040;
  color: #e5e5e5;
}

.profile-content {
  padding: 12px;
}

@media (min-width: 768px) {
  .profile-content {
    padding: 20px;
  }
}

.profile-section {
  margin-bottom: 24px;
}

.profile-section:last-child {
  margin-bottom: 0;
}

.profile-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: bold;
  color: #1f2937;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 6px;
}

@media (min-width: 768px) {
  .profile-section h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
    padding-bottom: 8px;
  }
}

:global(.dark-mode) .profile-section h4 {
  color: #e5e5e5;
  border-bottom-color: #404040;
}

.profile-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-label {
  font-weight: 600;
  color: #6b7280;
  min-width: 100px;
}

:global(.dark-mode) .profile-label {
  color: #b0b0b0;
}

.profile-value {
  color: #1f2937;
  flex: 1;
}

:global(.dark-mode) .profile-value {
  color: #e5e5e5;
}

.profile-value.no-info {
  color: #999;
  font-style: italic;
}

.staff-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.staff-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
}

:global(.dark-mode) .staff-item {
  background: #1e1e1e;
  border-color: #404040;
}

.staff-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

:global(.dark-mode) .staff-item:hover {
  background: #2a2a2a;
  border-color: #555;
}

.staff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.staff-role {
  font-weight: bold;
  color: #1f2937;
  font-size: 14px;
}

:global(.dark-mode) .staff-role {
  color: #e5e5e5;
}

.staff-name {
  color: #6b7280;
  font-size: 13px;
}

:global(.dark-mode) .staff-name {
  color: #b0b0b0;
}

.staff-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #6b7280;
}

:global(.dark-mode) .staff-details {
  color: #b0b0b0;
}

.staff-salary {
  color: #27ae60;
  font-weight: 600;
}

.staff-total {
  color: #3498db;
}

.upgrade-btn {
  margin-left: 12px;
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.upgrade-btn:hover:not(.disabled) {
  background: #2980b9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.upgrade-btn.disabled {
  background: #95a5a6;
  cursor: not-allowed;
  opacity: 0.6;
}

:global(.dark-mode) .upgrade-btn {
  background: #3498db;
}

:global(.dark-mode) .upgrade-btn:hover:not(.disabled) {
  background: #2980b9;
}

:global(.dark-mode) .upgrade-btn.disabled {
  background: #555;
}

.products-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.product-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
}

:global(.dark-mode) .product-item {
  background: #1e1e1e;
  border-color: #404040;
}

.product-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  transform: translateX(2px);
}

:global(.dark-mode) .product-item:hover {
  background: #2a2a2a;
  border-color: #555;
}

.product-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.product-name {
  font-weight: 500;
  color: #1f2937;
  font-size: 14px;
}

:global(.dark-mode) .product-name {
  color: #e5e5e5;
}

.product-price {
  font-weight: 600;
  color: #27ae60;
  font-size: 14px;
}

:global(.dark-mode) .product-price {
  color: #2ecc71;
}
</style>

