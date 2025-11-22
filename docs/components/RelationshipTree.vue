<script setup lang="ts">
import { computed, ref } from 'vue';
import { gameInstance } from '../core/game';
import type { Character } from '../core/character';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-network'): void;
  (e: 'open-love-matrix'): void;
}>();

const closeModal = () => {
  emit('close');
};

const showLoveMatrix = ref(false);
const showNetwork = ref(false);
const showFamilyTree = ref(false);

const openLoveMatrix = () => {
  emit('open-love-matrix');
};

const openNetwork = () => {
  emit('open-network');
};

// 构建家庭树
const familyTrees = computed(() => {
  const trees: Array<{
    families: Array<{
      parents: Character[];
      children: Character[];
    }>;
  }> = [];
  
  const processed = new Set<string>();
  
  // 找到所有有父母或子女的角色
  const allFamilyChars = gameInstance.state.chars.filter(c => 
    (c.parents && (c.parents.mother || c.parents.father)) || 
    (c.children && c.children.length > 0)
  );
  
  allFamilyChars.forEach(char => {
    if (processed.has(char.name)) return;
    
    // 找到这个角色的所有家庭成员
    const familyMembers = new Set<string>();
    const findFamily = (name: string) => {
      if (familyMembers.has(name)) return;
      familyMembers.add(name);
      
      const member = gameInstance.state.chars.find(c => c.name === name);
      if (!member) return;
      
      // 添加父母
      if (member.parents) {
        if (member.parents.mother) findFamily(member.parents.mother);
        if (member.parents.father) findFamily(member.parents.father);
      }
      
      // 添加子女
      if (member.children && member.children.length > 0) {
        member.children.forEach(childName => findFamily(childName));
      }
      
      // 添加兄弟姐妹
      if (member.parents) {
        gameInstance.state.chars.forEach(c => {
          if (c.name !== name && c.parents) {
            if ((c.parents.mother === member.parents.mother && c.parents.father === member.parents.father) ||
                (c.parents.mother === member.parents.mother && c.parents.father === member.parents.father)) {
              findFamily(c.name);
            }
          }
        });
      }
    };
    
    findFamily(char.name);
    
    if (familyMembers.size > 0) {
      // 构建家庭树结构
      const families: Array<{ parents: Character[]; children: Character[] }> = [];
      const familyChars = Array.from(familyMembers).map(name => 
        gameInstance.state.chars.find(c => c.name === name)!
      ).filter(c => c);
      
      // 找到所有父母对及其孩子
      const parentPairMap = new Map<string, { parents: Character[]; children: Character[] }>();
      
      familyChars.forEach(c => {
        if (c.parents) {
          const mother = familyChars.find(ch => ch.name === c.parents!.mother);
          const father = familyChars.find(ch => ch.name === c.parents!.father);
          
          if (mother || father) {
            const pairKey = [c.parents.mother || '', c.parents.father || ''].sort().join('-');
            
            if (!parentPairMap.has(pairKey)) {
              const parents: Character[] = [];
              if (mother) parents.push(mother);
              if (father) parents.push(father);
              parentPairMap.set(pairKey, { parents, children: [] });
            }
            
            const pair = parentPairMap.get(pairKey)!;
            if (!pair.children.find(ch => ch.name === c.name)) {
              pair.children.push(c);
            }
          }
        }
      });
      
      // 转换为数组
      parentPairMap.forEach(pair => {
        if (pair.parents.length > 0 || pair.children.length > 0) {
          families.push(pair);
        }
      });
      
      if (families.length > 0) {
        trees.push({ families });
        familyMembers.forEach(name => processed.add(name));
      }
    }
  });
  
  return trees;
});

// 获取所有关系数据（去重）
const allRelationships = computed(() => {
  const relationships: Array<{
    from: string;
    to: string;
    love: number;
    status: string;
    type: 'marriage' | 'romance' | 'friendship' | 'family' | 'special' | 'other';
  }> = [];

  const addedPairs = new Set<string>(); // 用于去重

  gameInstance.state.chars.forEach(char => {
    // 婚姻关系
    if (char.partner) {
      const pairKey = [char.name, char.partner].sort().join('-');
      if (!addedPairs.has(pairKey)) {
        addedPairs.add(pairKey);
        relationships.push({
          from: char.name,
          to: char.partner,
          love: char.relationships[char.partner]?.love || 0,
          status: 'spouse',
          type: 'marriage'
        });
      }
    }

    // 亲子关系（单向，不需要去重）
    if (char.children && char.children.length > 0) {
      char.children.forEach(childName => {
        relationships.push({
          from: char.name,
          to: childName,
          love: 100, // 亲子关系默认高好感
          status: 'parent',
          type: 'family'
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
          relationships.push({
            from: char.name,
            to: fwbName,
            love: fwbRel?.love || 0,
            status: 'fwb',
            type: 'special' // 炮友属于特殊关系
          });
        }
      });
    }

    // 所有关系（包括陌生人、朋友等）
    Object.entries(char.relationships).forEach(([otherName, rel]) => {
      if (otherName === char.partner) return; // 已处理婚姻关系
      if (char.children && char.children.includes(otherName)) return; // 已处理亲子关系
      
      // 显示所有关系，包括陌生人（但排除好感度为0且是陌生人的关系，避免显示过多）
      if (rel.love > 0 || rel.status !== 'stranger') {
        const pairKey = [char.name, otherName].sort().join('-');
        if (!addedPairs.has(pairKey)) {
          addedPairs.add(pairKey);
          relationships.push({
            from: char.name,
            to: otherName,
            love: rel.love,
            status: rel.status,
            type: getRelationshipType(rel.status)
          });
        }
      }
    });
  });

  return relationships;
});

// 根据状态判断关系类型
const getRelationshipType = (status: string): 'marriage' | 'romance' | 'friendship' | 'family' | 'special' | 'other' => {
  if (status === 'spouse') return 'marriage';
  if (status === 'lover' || status === 'mistress') return 'romance';
  if (status === 'friend' || status === 'bestfriend') return 'friendship';
  if (status === 'parent' || status === 'child') return 'family';
  if (status === 'fwb') return 'special'; // 炮友属于特殊关系
  if (status === 'stranger') return 'other';
  return 'other';
};

// 获取关系状态文本和颜色
const getRelationshipInfo = (status: string, love: number) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    'spouse': { text: '💑 配偶', color: '#e84393' },
    'lover': { text: '❤️ 情侣', color: '#ff7675' },
    'mistress': { text: '💋 小三', color: '#ff8c00' },
    'fwb': { text: '💋 炮友', color: '#ec4899' },
    'bestfriend': { text: '👥 挚友', color: '#3498db' },
    'friend': { text: '🤝 朋友', color: '#74b9ff' },
    'stranger': { text: '👤 陌生人', color: '#95a5a6' },
    'parent': { text: '👨‍👩‍👧 亲子', color: '#9b59b6' },
    'child': { text: '👶 孩子', color: '#9b59b6' },
    'ex': { text: '💔 前任', color: '#636e72' }
  };
  
  const info = statusMap[status] || { text: '👤 关系', color: '#999' };
  return { ...info, love };
};

// 按类型分组关系
const relationshipsByType = computed(() => {
  const grouped: Record<string, typeof allRelationships.value> = {
    marriage: [],
    romance: [],
    friendship: [],
    family: [],
    special: [],
    other: []
  };

  allRelationships.value.forEach(rel => {
    grouped[rel.type].push(rel);
  });

  return grouped;
});

// 按居民分组的关系（用于所有关系类型）
const getRelationshipsByCharacter = (type: string) => {
  return gameInstance.state.chars.map(char => {
    const rels = allRelationships.value
      .filter(r => r.type === type && (r.from === char.name || r.to === char.name))
      .map(r => {
        const otherName = r.from === char.name ? r.to : r.from;
        return {
          name: otherName,
          love: r.love,
          status: r.status
        };
      })
      .sort((a, b) => b.love - a.love);
    
    return {
      character: char,
      relationships: rels
    };
  }).filter(item => item.relationships.length > 0);
};

// 获取所有角色
const allCharacters = computed(() => {
  return gameInstance.state.chars;
});

// 按居民分组的好感度列表（用于友谊关系）
const characterRelationships = computed(() => {
  return gameInstance.state.chars.map(char => {
    // 获取该居民的所有关系，排除配偶、恋人、小三、前任、炮友（这些在专门区域显示）
    const rels = Object.entries(char.relationships)
      .map(([name, data]) => ({ name, ...data }))
      .filter(r => {
        // 排除配偶
        if (char.partner === r.name) return false;
        // 排除恋人、小三、前任、炮友（这些在专门区域显示）
        if (r.status === 'lover' || r.status === 'mistress' || r.status === 'ex' || r.status === 'fwb') return false;
        // 排除陌生人关系
        if (r.status === 'stranger') return false;
        // 显示其他关系（朋友、挚友等）
        return true;
      })
      .sort((a, b) => {
        // 先按状态排序（朋友>挚友>陌生人），再按好感度排序
        const statusOrder: Record<string, number> = { 'bestfriend': 3, 'friend': 2, 'stranger': 1 };
        const aOrder = statusOrder[a.status] || 0;
        const bOrder = statusOrder[b.status] || 0;
        if (aOrder !== bOrder) return bOrder - aOrder;
        return b.love - a.love;
      });
    
    return {
      character: char,
      relationships: rels
    };
  }).filter(item => item.relationships.length > 0); // 只显示有关系的居民
});

// 展开/收起状态（按关系类型和居民名称）
const expandedChars = ref<Map<string, Set<string>>>(new Map());
const toggleExpand = (type: string, charName: string) => {
  const key = `${type}-${charName}`;
  if (!expandedChars.value.has(type)) {
    expandedChars.value.set(type, new Set());
  }
  const typeSet = expandedChars.value.get(type)!;
  if (typeSet.has(charName)) {
    typeSet.delete(charName);
  } else {
    typeSet.add(charName);
  }
};

const isExpanded = (type: string, charName: string): boolean => {
  return expandedChars.value.get(type)?.has(charName) || false;
};
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="closeModal">
    <div class="tree-modal-content">
      <div class="tree-header">
        <h3 class="tree-title">👥 关系谱</h3>
        <div class="header-actions">
          <button @click="showFamilyTree = !showFamilyTree" class="action-btn" :class="{ active: showFamilyTree }" title="查看族谱">🌳 族谱</button>
          <button @click="openLoveMatrix" class="action-btn" title="查看好感度矩阵">💕 好感度</button>
          <button @click="openNetwork" class="action-btn" title="查看关系网络图">🕸️ 网络图</button>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
      </div>
      
      <div class="tree-content">
        <!-- 族谱 -->
        <div v-if="showFamilyTree" class="relationship-section">
          <h4 class="section-title">🌳 族谱 - 家庭树</h4>
          <div v-if="familyTrees.length > 0">
            <div v-for="(tree, treeIndex) in familyTrees" :key="`tree-${treeIndex}`" class="family-tree-item" style="margin-bottom: 24px; padding: 16px; border: 1px solid #eee; border-radius: 8px;">
              <div v-for="(family, familyIndex) in tree.families" :key="`family-${treeIndex}-${familyIndex}`" style="margin-bottom: 16px;">
                <div style="display: flex; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
                  <div v-for="parent in family.parents" :key="parent.name" style="margin-right: 8px; margin-bottom: 4px; padding: 8px; background: #e3f2fd; border-radius: 4px;">
                    <strong>{{ parent.name }}</strong> <span style="color: #666; font-size: 12px;">({{ parent.age }}岁)</span>
                  </div>
                  <span v-if="family.parents.length > 0 && family.children.length > 0" style="margin: 0 8px; color: #999;">→</span>
                </div>
                <div v-if="family.children.length > 0" style="margin-left: 24px; padding-left: 16px; border-left: 2px solid #ddd;">
                  <div v-for="child in family.children" :key="child.name" style="margin-bottom: 4px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
                    <strong>{{ child.name }}</strong> <span style="color: #666; font-size: 12px;">({{ child.age }}岁)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="no-relationships">
            <p>暂无家庭关系</p>
          </div>
        </div>

        <!-- 婚姻关系（按居民分组，可展开/收起） -->
        <div v-if="relationshipsByType.marriage.length > 0" class="relationship-section">
          <h4 class="section-title">💑 婚姻关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in getRelationshipsByCharacter('marriage')" 
              :key="`marriage-${item.character.name}`"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('marriage', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('marriage', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('marriage', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`marriage-${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 恋爱关系（按居民分组，可展开/收起） -->
        <div v-if="relationshipsByType.romance.length > 0" class="relationship-section">
          <h4 class="section-title">❤️ 恋爱关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in getRelationshipsByCharacter('romance')" 
              :key="`romance-${item.character.name}`"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('romance', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('romance', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('romance', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`romance-${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 特殊关系（炮友，按居民分组，可展开/收起） -->
        <div v-if="relationshipsByType.special.length > 0" class="relationship-section">
          <h4 class="section-title">💋 特殊关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in getRelationshipsByCharacter('special')" 
              :key="`special-${item.character.name}`"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('special', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('special', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('special', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`special-${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 家庭关系（按居民分组，可展开/收起） -->
        <div v-if="relationshipsByType.family.length > 0" class="relationship-section">
          <h4 class="section-title">👨‍👩‍👧 家庭关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in getRelationshipsByCharacter('family')" 
              :key="`family-${item.character.name}`"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('family', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('family', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('family', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`family-${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 友谊关系（按居民分组，可展开/收起） -->
        <div v-if="characterRelationships.length > 0" class="relationship-section">
          <h4 class="section-title">🤝 友谊关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in characterRelationships" 
              :key="item.character.name"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('friendship', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('friendship', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('friendship', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :class="`tag-${rel.status}`"
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 其他关系（按居民分组，可展开/收起） -->
        <div v-if="relationshipsByType.other.length > 0" class="relationship-section">
          <h4 class="section-title">👤 其他关系</h4>
          <div class="character-relationship-list">
            <div 
              v-for="item in getRelationshipsByCharacter('other')" 
              :key="`other-${item.character.name}`"
              class="character-relationship-item"
            >
              <div 
                class="character-header" 
                @click="toggleExpand('other', item.character.name)"
              >
                <span class="expand-icon" :class="{ expanded: isExpanded('other', item.character.name) }">
                  ▶
                </span>
                <strong class="character-name">{{ item.character.name }}</strong>
                <span class="relationship-count">({{ item.relationships.length }}个关系)</span>
              </div>
              <div 
                v-if="isExpanded('other', item.character.name)" 
                class="relationship-details"
              >
                <div 
                  v-for="rel in item.relationships" 
                  :key="`other-${item.character.name}-${rel.name}`"
                  class="relationship-detail-item"
                >
                  <span 
                    class="rel-tag" 
                    :style="{ backgroundColor: getRelationshipInfo(rel.status, rel.love).color }"
                  >
                    {{ getRelationshipInfo(rel.status, rel.love).text }}
                  </span>
                  <span class="rel-name">{{ rel.name }}</span>
                  <span class="rel-love-value">❤️{{ rel.love }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 如果没有关系 -->
        <div v-if="allRelationships.length === 0" class="no-relationships">
          <p>暂无重要关系</p>
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
  from { opacity: 0; }
  to { opacity: 1; }
}

.tree-modal-content {
  background: white;
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

:global(.dark-mode) .tree-modal-content {
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

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
}

:global(.dark-mode) .tree-header {
  background: #2d2d2d;
  border-bottom-color: #404040;
}

.tree-title {
  margin: 0;
  font-size: 20px;
  font-weight: bold;
  color: #1f2937;
}

:global(.dark-mode) .tree-title {
  color: #e5e5e5;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease;
}

.action-btn:hover {
  background: #2563eb;
}

.action-btn.active {
  background: #4caf50;
  color: white;
}

.action-btn.active:hover {
  background: #45a049;
}

:global(.dark-mode) .action-btn {
  background: #60a5fa;
}

:global(.dark-mode) .action-btn:hover {
  background: #3b82f6;
}

.action-btn.active {
  background: #4caf50;
  color: white;
}

.action-btn.active:hover {
  background: #45a049;
}

:global(.dark-mode) .action-btn.active {
  background: #4caf50;
  color: white;
}

:global(.dark-mode) .action-btn.active:hover {
  background: #45a049;
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

.tree-content {
  padding: 20px;
}

.relationship-section {
  margin-bottom: 24px;
}

.relationship-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: bold;
  color: #1f2937;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 8px;
}

:global(.dark-mode) .section-title {
  color: #e5e5e5;
  border-bottom-color: #404040;
}

.relationship-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relationship-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 3px solid #ddd;
  transition: all 0.2s ease;
}

:global(.dark-mode) .relationship-item {
  background: #1e1e1e;
  border-left-color: #555;
}

.relationship-item:hover {
  background: #f3f4f6;
  transform: translateX(4px);
}

:global(.dark-mode) .relationship-item:hover {
  background: #2a2a2a;
}

.relationship-item.marriage {
  border-left-color: #e84393;
}

.relationship-item.romance {
  border-left-color: #ff7675;
}

.relationship-item.family {
  border-left-color: #9b59b6;
}

.relationship-item.friendship {
  border-left-color: #3498db;
}

.relationship-item.other {
  border-left-color: #999;
}

.rel-from {
  font-weight: bold;
  color: #1f2937;
  min-width: 80px;
}

:global(.dark-mode) .rel-from {
  color: #e5e5e5;
}

.rel-connector {
  font-size: 16px;
  flex-shrink: 0;
}

.rel-to {
  font-weight: bold;
  color: #1f2937;
  min-width: 80px;
}

:global(.dark-mode) .rel-to {
  color: #e5e5e5;
}

.rel-status {
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}

.rel-love {
  font-size: 12px;
  color: #e74c3c;
  font-weight: 600;
  min-width: 50px;
  text-align: right;
}

.no-relationships {
  text-align: center;
  padding: 40px;
  color: #999;
  font-style: italic;
}

:global(.dark-mode) .no-relationships {
  color: #888;
}

/* 按居民分组的关系列表样式 */
.character-relationship-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-relationship-item {
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  transition: all 0.2s ease;
}

:global(.dark-mode) .character-relationship-item {
  background: #1a1a1a;
  border-color: #404040;
}

.character-header {
  padding: 12px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
  background: white;
}

:global(.dark-mode) .character-header {
  background: #2d2d2d;
}

.character-header:hover {
  background: #f3f4f6;
}

:global(.dark-mode) .character-header:hover {
  background: #2a2a2a;
}

.expand-icon {
  display: inline-block;
  transition: transform 0.2s ease;
  color: #6b7280;
  font-size: 10px;
  width: 16px;
  text-align: center;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.character-name {
  flex: 1;
  color: #1f2937;
  font-size: 14px;
}

:global(.dark-mode) .character-name {
  color: #e5e5e5;
}

.relationship-count {
  color: #6b7280;
  font-size: 12px;
}

:global(.dark-mode) .relationship-count {
  color: #9ca3af;
}

.relationship-details {
  padding: 8px 15px 12px 40px;
  background: #fafafa;
  border-top: 1px solid #e5e7eb;
}

:global(.dark-mode) .relationship-details {
  background: #1a1a1a;
  border-top-color: #404040;
}

.relationship-detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.rel-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: white;
  font-weight: 500;
  min-width: 50px;
  text-align: center;
}

.tag-friend {
  background: #74b9ff;
}

.tag-bestfriend {
  background: #3498db;
}

.tag-stranger {
  background: #95a5a6;
}

.rel-name {
  flex: 1;
  color: #1f2937;
  font-weight: 500;
}

:global(.dark-mode) .rel-name {
  color: #e5e5e5;
}

.rel-love-value {
  color: #e74c3c;
  font-weight: 600;
  font-size: 12px;
}
</style>

