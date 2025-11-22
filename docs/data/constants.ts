export const GAME_CONFIG = {
  TICK_RATE: 1000 / 60, // 60 FPS
  RESOURCE_TICK_RATE: 1000, // 1 second for resources
};

export const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export const NAMES = ["耄耋", "曼波", "哈基米", "果猫", "暖泪", "沐夏", "sans", "时苏", "小睿", "斗罗1654e", "云绒", "抉"];

export interface Trait {
  id: string;
  name: string;
  desc: string;
}

export const TRAITS: Trait[] = [
  { id: "sleepy", name: "喜欢睡觉", desc: "睡眠时间更长，恢复更多心情" },
  { id: "promiscuous", name: "淫乱", desc: "更容易交欢，容易发展小三关系" },
  { id: "money-loving", name: "爱钱", desc: "更珍惜金钱，消费更谨慎。因为城镇建设有钱分，所以更倾向于持久建设" },
  { id: "hardworking", name: "勤奋", desc: "工作更努力，不容易摸鱼，工作效率更高" },
  { id: "lazy", name: "懒惰", desc: "更容易摸鱼，工作满意度下降更快" },
  { id: "social", name: "社交达人", desc: "更容易交朋友，好感度提升更快，喜欢社交活动" },
  { id: "loner", name: "孤僻", desc: "不太喜欢社交，好感度提升较慢，更倾向于独处" },
  { id: "romantic", name: "浪漫", desc: "更容易表白和接受表白，在浪漫场所好感度提升更多" },
  { id: "conservative", name: "保守", desc: "不太容易发展关系，但关系更稳定" },
  { id: "impulsive", name: "冲动", desc: "更容易吵架，但也更容易表白，情绪波动大" },
  { id: "rational", name: "理性", desc: "不容易冲动，但也不容易发展关系，更注重逻辑" },
  { id: "generous", name: "大方", desc: "消费时更舍得花钱，容易请客" },
  { id: "stingy", name: "小气", desc: "消费时更谨慎，不太愿意花钱" },
  { id: "ambitious", name: "野心勃勃", desc: "更倾向于竞选职位，工作满意度要求更高" },
  { id: "content", name: "知足常乐", desc: "工作满意度下降较慢，更容易满足" },
  { id: "coward", name: "胆小", desc: "胆小谨慎，害怕被草，抗拒酒店，成为炮友可能性更低，喝酒通常不会喝晕" },
  { id: "clever", name: "机智", desc: "机智聪明，摸鱼时更难被老板抓到" }
];

// 特质冲突组：同一组内的特质不能同时拥有
export const TRAIT_CONFLICTS: Record<string, string[]> = {
  "hardworking": ["lazy", "sleepy"], // 勤奋与懒惰、喜欢睡觉冲突
  "lazy": ["hardworking"],
  "sleepy": ["hardworking"], // 喜欢睡觉与勤奋冲突
  "social": ["loner"],
  "loner": ["social"],
  "romantic": ["conservative"],
  "conservative": ["romantic"],
  "impulsive": ["rational"],
  "rational": ["impulsive"],
  "generous": ["stingy"],
  "stingy": ["generous"],
  "ambitious": ["content"],
  "content": ["ambitious"]
};

// 检查特质是否冲突
export function hasTraitConflict(existingTraitIds: string[], newTraitId: string): boolean {
  const conflicts = TRAIT_CONFLICTS[newTraitId] || [];
  return conflicts.some(conflictId => existingTraitIds.includes(conflictId));
}

export interface Personality {
  name: string;
  chaosBonus: number;
  loveGain: number;
  childDesire: number;
  desc: string;
}

export const PERSONALITIES: Personality[] = [
  { name: "易怒", chaosBonus: 0.3, loveGain: -0.5, childDesire: -0.3, desc: "脾气暴躁，容易吵架" },
  { name: "沉着", chaosBonus: -0.2, loveGain: 0.3, childDesire: 0.2, desc: "冷静理智，不易冲突" },
  { name: "开朗", chaosBonus: -0.1, loveGain: 0.5, childDesire: 0.4, desc: "乐观外向，容易相处" },
  { name: "内向", chaosBonus: 0.1, loveGain: -0.2, childDesire: -0.1, desc: "不善社交，略显疏离" },
  { name: "温柔", chaosBonus: -0.15, loveGain: 0.4, childDesire: 0.5, desc: "温和友善，人见人爱" },
  { name: "刻薄", chaosBonus: 0.25, loveGain: -0.3, childDesire: -0.2, desc: "说话带刺，容易得罪人" },
  { name: "幽默", chaosBonus: -0.1, loveGain: 0.3, childDesire: 0.3, desc: "风趣幽默，讨人喜欢" },
  { name: "严肃", chaosBonus: 0.05, loveGain: 0, childDesire: 0.1, desc: "一本正经，不冷不热" },
  { name: "热情", chaosBonus: -0.1, loveGain: 0.6, childDesire: 0.3, desc: "热情似火，容易感染他人" },
  { name: "冷漠", chaosBonus: 0.15, loveGain: -0.4, childDesire: -0.2, desc: "冷漠疏离，不太关心他人" },
  { name: "乐观", chaosBonus: -0.15, loveGain: 0.4, childDesire: 0.2, desc: "积极乐观，总是看到好的一面" },
  { name: "悲观", chaosBonus: 0.2, loveGain: -0.3, childDesire: -0.1, desc: "消极悲观，容易陷入负面情绪" },
  { name: "勇敢", chaosBonus: 0.1, loveGain: 0.2, childDesire: 0.2, desc: "勇敢果断，敢于冒险" },
  { name: "胆小", chaosBonus: -0.1, loveGain: -0.1, childDesire: -0.2, desc: "胆小谨慎，不敢轻易尝试" },
  { name: "大方", chaosBonus: -0.05, loveGain: 0.3, childDesire: 0.1, desc: "慷慨大方，乐于分享" },
  { name: "小气", chaosBonus: 0.1, loveGain: -0.2, childDesire: -0.1, desc: "吝啬小气，精打细算" },
  { name: "诚实", chaosBonus: -0.1, loveGain: 0.2, childDesire: 0.1, desc: "诚实可靠，值得信任" },
  { name: "狡猾", chaosBonus: 0.2, loveGain: -0.1, childDesire: -0.1, desc: "狡猾精明，善于算计" },
  { name: "浪漫", chaosBonus: -0.1, loveGain: 0.5, childDesire: 0.4, desc: "浪漫多情，追求爱情" },
  { name: "务实", chaosBonus: 0.05, loveGain: 0, childDesire: 0.2, desc: "务实理性，注重实际" }
];

// 工具函数
export const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const choose = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
