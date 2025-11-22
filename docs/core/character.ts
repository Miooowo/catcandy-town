import { TRAITS, PERSONALITIES, rand, choose, hasTraitConflict } from '../data/constants';

export interface Relationship {
  love: number;
  status: string; // 'friend', 'lover', 'spouse', etc.
}

export interface Job {
  buildingId: string;
  role: string;
}

export interface IncomeStats {
  work: number;
  oddJob: number;
  streetwalking: number;
  prostitution: number;
  construction: number;
  total: number;
}

export interface PregnantState {
  father: string;
  dueDate: number; // Absolute Time
}

export interface Parents {
  mother: string;
  father: string;
}

export class Character {
  name: string;
  happiness: number;
  money: number;
  job: Job | null;
  currentAction: string;
  relationships: Record<string, Relationship>;
  partner: string | null;
  interactingWith: string | null;
  personality: typeof PERSONALITIES[number];
  traits: typeof TRAITS[number][];
  constructionContribution: Record<string, number>;
  prostitute: { buildingId: string } | null;
  credibility: number;
  electionFailures: Record<string, number>;
  electionCooldown: Record<string, number>;
  incomeStats: IncomeStats;
  buildingIncome: Record<string, number>; // 记录从每个建筑获得的收入 {buildingId: income}
  slackingOffCount: Record<string, number>; // 记录在每个建筑被抓到摸鱼的次数 {buildingId: count}
  jobSatisfaction: number; // 工作满意度 (0-100)
  fightCount: number; // 主动吵架次数
  totalSleepTime: number; // 总睡觉时间（小时）
  masturbationCount: number; // 扣扣/鹿观次数
  sexCount: number; // 打炮次数（与炮友或情人交欢）
  alcoholTolerance: number; // 酒量 (0-100，越高越不容易喝晕)
  isDrunk: boolean; // 是否喝晕
  drunkEndTime?: number; // 喝晕结束时间（绝对时间）
  pregnant: PregnantState | null;
  contraceptives: number;
  children: string[];
  parents: Parents | null;
  birthTime: number | null;
  sexualDesire: number; // 性欲值 (0-100)
  isRelieving: boolean; // 是否正在发泄性欲
  relievingWith?: string; // 正在和谁一起发泄（炮友）
  relievingEndTime?: number; // 发泄结束时间（绝对时间）
  fwbList: string[]; // 炮友列表（可以和小三关系并存）
  resignationCooldown?: number; // 辞职冷静期结束时间（绝对时间），5天内不能工作
  lastResignedBuilding?: string; // 上次辞职的建筑ID
  lastResignedTime?: number; // 上次辞职的时间（绝对时间），用于计算一个月冷却期
  currentTown?: string; // 当前所在城镇ID（多人模式）
  homeTown?: string; // 所属城镇ID（多人模式）
  travelCooldown?: number; // 旅行冷却时间（绝对时间）
  
  // 选举相关的临时属性（不持久化）
  bribedBy?: string; // 被谁收买
  rejectedBribeFrom?: string; // 拒绝了谁的收买
  wasReported?: boolean; // 是否被举报

  constructor(name: string) {
    this.name = name;
    this.happiness = 60;
    this.money = 0;
    this.job = null;
    this.currentAction = "发呆";
    this.relationships = {};
    this.partner = null;
    this.interactingWith = null;
    this.personality = choose(PERSONALITIES);
    
    // 特性分配逻辑：
    // 1. 如果没有特性，较大概率获得一个特性（70%）
    // 2. 大概率再获得一个特性（80%）
    // 3. 小概率额外获得一个特性（20%）
    // 4. 极小概率额外获得一个特性（5%）
    // 特性之间不能冲突
    this.traits = [];
    const existingTraitIds: string[] = [];
    
    // 第一步：较大概率获得第一个特性（70%）
    if (Math.random() < 0.7) {
      const availableTraits = TRAITS.filter(t => 
        !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
      );
      if (availableTraits.length > 0) {
        const selectedTrait = choose(availableTraits);
        this.traits.push(selectedTrait);
        existingTraitIds.push(selectedTrait.id);
      }
    }
    
    // 第二步：大概率再获得一个特性（80%）
    if (Math.random() < 0.8 && existingTraitIds.length > 0) {
      const availableTraits = TRAITS.filter(t => 
        !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
      );
      if (availableTraits.length > 0) {
        const selectedTrait = choose(availableTraits);
        this.traits.push(selectedTrait);
        existingTraitIds.push(selectedTrait.id);
      }
    }
    
    // 第三步：小概率额外获得一个特性（20%）
    if (Math.random() < 0.2 && existingTraitIds.length > 0) {
      const availableTraits = TRAITS.filter(t => 
        !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
      );
      if (availableTraits.length > 0) {
        const selectedTrait = choose(availableTraits);
        this.traits.push(selectedTrait);
        existingTraitIds.push(selectedTrait.id);
      }
    }
    
    // 第四步：极小概率额外获得一个特性（5%）
    if (Math.random() < 0.05 && existingTraitIds.length > 0) {
      const availableTraits = TRAITS.filter(t => 
        !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
      );
      if (availableTraits.length > 0) {
        const selectedTrait = choose(availableTraits);
        this.traits.push(selectedTrait);
        existingTraitIds.push(selectedTrait.id);
      }
    }
    
    this.constructionContribution = {};
    this.prostitute = null;
    this.credibility = 50;
    this.electionFailures = {};
    this.electionCooldown = {};
    this.slackingOffCount = {}; // 初始化摸鱼记录
    this.jobSatisfaction = 70; // 初始工作满意度
    this.fightCount = 0; // 初始化吵架次数
    this.totalSleepTime = 0; // 初始化睡觉时间
    this.masturbationCount = 0; // 初始化扣扣/鹿观次数
    this.sexCount = 0; // 初始化打炮次数
    this.alcoholTolerance = rand(30, 90); // 初始酒量随机（30-90）
    this.isDrunk = false; // 初始不喝晕
    this.sexualDesire = rand(20, 60); // 初始性欲值随机
    this.isRelieving = false; // 初始不在发泄
    this.relievingWith = undefined; // 初始没有一起发泄的对象
    this.fwbList = []; // 初始没有炮友
    this.incomeStats = {
      work: 0,
      oddJob: 0,
      streetwalking: 0,
      prostitution: 0,
      construction: 0,
      total: 0
    };
    this.buildingIncome = {}; // 初始化建筑收入记录
    this.pregnant = null;
    this.contraceptives = 0;
    this.children = [];
    this.parents = null;
    this.birthTime = null;
  }

  hasTrait(traitId: string): boolean {
    return this.traits.some(t => t.id === traitId);
  }

  // 获取睡眠时间段
  getSleepSchedule(): { start: number; end: number } {
    let start: number, end: number;
    // 如果有工作，且是夜班 (酒吧 18-02)，则白天睡觉 (03-11)
    if (this.job && this.job.buildingId === 'bar') {
      start = 3;
      end = 11;
    } else {
      // 默认作息 (23-07)
      start = 23;
      end = 7;
    }

    // 喜欢睡觉的人睡眠时间延长2小时
    if (this.hasTrait('sleepy')) {
      if (start > end) { // 跨天
        start = (start - 1 + 24) % 24; // 提前1小时
        end = (end + 1) % 24; // 延后1小时
      } else {
        start = Math.max(0, start - 1);
        end = Math.min(24, end + 1);
      }
    }

    return { start, end };
  }

  // 拒绝判定的核心逻辑
  // return true = 接受, false = 拒绝
  decideProposal(askerName: string, type: 'date' | 'confess' | 'propose'): boolean {
    const rel = this.relationships[askerName];
    if (!rel) return false;

    let chance = 0;
    let threshold = 0;

    // 基础概率基于好感度
    chance = rel.love;
    // 加上心情修正 (心情差很难答应)
    chance += (this.happiness - 50) / 2;

    if (type === 'date') threshold = 30; // 约会门槛低
    if (type === 'confess') threshold = 75; // 表白门槛高
    if (type === 'propose') threshold = 90; // 求婚门槛极高

    // 随机波动 +/- 10
    chance += rand(-10, 10);

    return chance >= threshold;
  }
}
