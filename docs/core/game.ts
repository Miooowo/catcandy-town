import { reactive } from 'vue';
import { Character, Relationship } from './character';
import { Building } from './building';
import { NAMES, DAYS, rand, choose, TRAITS, PERSONALITIES, hasTraitConflict } from '../data/constants';
import { BUILDINGS_BLUEPRINT } from '../data/blueprints';

export interface LogEntry {
  id: number;
  time: string;
  message: string;
  type: string;
}

// 游戏版本号，用于存档兼容性检查
const GAME_VERSION = '0.7.2';
const MIN_SUPPORTED_VERSION = '0.7.0'; // 最低支持的版本

interface GameState {
  chars: Character[];
  buildings: Building[];
  townMoney: number;
  gameTime: number; // minutes, start at 8:00
  gameDay: number; // 0-6, default Monday (1)
  totalDaysPassed: number;
  logs: LogEntry[];
  isPlaying: boolean;
  timeSpeed: number;
  townName: string; // 城镇名称
  customCharacterNames: string[]; // 自定义居民名称（12个）
  observerName: string; // 旁观者名称（多人模式显示用）
}

export class GameEngine {
  public state: GameState;
  private tickIntervalId: any = null;
  private autoSaveTimer: number = 0;
  private lastSaveTime: number = Date.now();
  private autoSaveInterval: number = 15; // 自动存档间隔（秒）
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private lastNewCharDay: number = 0; // 上次添加新居民的游戏日
  private newCharInterval: number = 5; // 每5天添加一个新居民
  private currentSlot: number = 1; // 当前存档槽位（1-5）
  private isMultiplayerMode: boolean = false; // 是否多人模式
  private currentTownId: string | null = null; // 当前城镇ID（多人模式）

  constructor() {
    this.state = reactive({
      chars: [],
      buildings: [],
      townMoney: 0,
      gameTime: 480, // minutes, start at 8:00
      gameDay: 1, // 0-6, default Monday
      totalDaysPassed: 0,
      logs: [],
      isPlaying: false,
      timeSpeed: 1,
      townName: '猫果镇', // 默认城镇名称
      customCharacterNames: [], // 自定义居民名称，如果为空则使用默认名称
      observerName: '' // 旁观者名称，默认为空
    });

    this.loadOrInit();
    this.setupAutoSaveOnUnload();
  }

  // 设置页面关闭前的自动保存
  setupAutoSaveOnUnload() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return;
    }
    
    this.beforeUnloadHandler = () => {
      this.autoSave();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  // 清理事件监听
  cleanup() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return;
    }
    
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  // 获取游戏的绝对时间（总分钟数），用于跨天计算
  getAbsoluteTime(): number {
    return this.state.totalDaysPassed * 1440 + this.state.gameTime;
  }

  loadOrInit() {
    // 检查是否在浏览器环境中（SSR 构建时 localStorage 不存在）
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      this.initNewGame();
      return;
    }
    
    // 迁移旧存档到槽位1
    this.migrateOldSave();
    
    // 不自动加载，等待用户选择存档槽位
    // 只有在已有自定义设置时才初始化
    if (this.state.townName && this.state.townName !== '猫果镇' || 
        this.state.customCharacterNames.length === 12) {
      this.initNewGame();
    }
  }

  // 迁移旧存档到槽位1
  migrateOldSave() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    const oldSaveKey = 'happyTownV2_Save';
    const newSaveKey = 'happyTownV2_Save_Slot1';
    
    // 如果旧存档存在且槽位1没有存档，则迁移
    const oldSave = localStorage.getItem(oldSaveKey);
    const slot1Save = localStorage.getItem(newSaveKey);
    
    if (oldSave && !slot1Save) {
      localStorage.setItem(newSaveKey, oldSave);
      localStorage.removeItem(oldSaveKey);
      console.log('已迁移旧存档到存档槽位1');
    }
  }

  // 设置当前存档槽位
  setCurrentSlot(slot: number) {
    if (slot >= 1 && slot <= 5) {
      this.currentSlot = slot;
    }
  }

  // 获取当前存档槽位
  getCurrentSlot(): number {
    return this.currentSlot;
  }

  // 从指定槽位加载存档
  loadFromSlot(slot: number): { success: boolean; message?: string } {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { success: false, message: '浏览器环境不支持' };
    }
    
    const saveKey = `happyTownV2_Save_Slot${slot}`;
    const saveStr = localStorage.getItem(saveKey);
    
    if (!saveStr) {
      return { success: false, message: '存档槽位为空' };
    }
    
    this.currentSlot = slot;
    const loadResult = this.loadFromJSON(saveStr);
    
    if (loadResult.success) {
      this.checkAndAddNewChars();
      this.log("📂 读取存档成功！欢迎回来。");
      
      // 切换存档时清除调试模式标志
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('debug_mode');
        // 触发事件通知ControlPanel更新
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('debug-mode-disabled'));
        }
      }
    }
    
    return loadResult;
  }

  checkAndAddNewChars() {
    let added = false;
    NAMES.forEach(name => {
      if (!this.state.chars.find(c => c.name === name)) {
        this.state.chars.push(new Character(name));
        this.log(`[🎉新居民] 欢迎新邻居 **${name}** 入住快乐小镇！`);
        added = true;
      }
    });

    if (added) {
      // Re-sync relationships for EVERYONE
      this.state.chars.forEach(c1 => {
        this.state.chars.forEach(c2 => {
          if (c1.name !== c2.name && !c1.relationships[c2.name]) {
            c1.relationships[c2.name] = { love: 0, status: 'stranger' };
          }
        });
      });
    }
  }

  // 生成随机名字
  // 获取遗传特质数量（1个到4个的概率为：70%，60%，10%，2%）
  getInheritedTraitCount(): number {
    const roll = Math.random();
    if (roll < 0.7) {
      // 70%概率获得1个
      return 1;
    } else if (roll < 0.7 + 0.6) {
      // 60%概率获得2个（在剩余的30%中）
      return 2;
    } else if (roll < 0.7 + 0.6 + 0.1) {
      // 10%概率获得3个（在剩余的-30%中，实际是10%）
      return 3;
    } else if (roll < 0.7 + 0.6 + 0.1 + 0.02) {
      // 2%概率获得4个
      return 4;
    }
    return 0;
  }

  generateRandomName(): string {
    // 网络风格前缀（中英混合）
    const prefixes = ['', 'Mr_', 'Ms_', 'Dr_', '超', '赛博', '数字', '虚拟', 'AI_', '终极', '疯狂', '神秘', '暗夜', '星辰', '量子', '赛博朋克', '重生之', '穿越之', '在线', '离线', '已黑化'];
    
    // 网络流行形容词（中文）
    const cnAdjectives = ['摆烂', '躺平', '内卷', '摸鱼', '真香', '硬核', '佛系', '社恐', '社牛', '破防', '绝绝子', '尊嘟假嘟', '泰酷辣', '栓Q', 'EMO', 'AWSL'];
    
    // 网络核心名词（中英混合）
    const coreWords = ['刺客', '猎人', '法师', '战士', '熊猫', '狐狸', '狼', '龙', '幽灵', '恶魔', '天使', '骑士', '巫师', '忍者', '海盗', '机甲', 
                      '打工人', '干饭人', '小丑', '大佬', '萌新', '菜狗', '卷王', '肝帝', '欧皇', '非酋', '课代表', '显眼包', '搭子',
                      'Code', 'Byte', 'Data', 'Hacker', 'Geek', 'Bug', 'Algorithm', 'Protocol'];
    
    // 网络后缀（中英数字混合）
    const suffixes = ['', '123', '456', '007', '2024', 'X', 'Z', 'Pro', 'Max', 'Plus', '_official', '酱', '君', '桑', '菌', '子', '儿', '啊', '呢', '~', '!', '!!', '!!!', '版', '形态'];
    
    // 特殊符号
    const symbols = ['', '☆', '★', '�', '�', '�', '�', '丨', '丶', '灬', '卩', '丿'];
  
    const prefix = prefixes[rand(0, prefixes.length - 1)];
    const symbol = symbols[rand(0, symbols.length - 1)];
    const suffix = suffixes[rand(0, suffixes.length - 1)];
    
    // 随机选择生成模式
    const pattern = rand(1, 8);
    
    switch(pattern) {
      case 1: // 前缀 + 中文形容词 + 核心词 + 后缀
        const adj1 = cnAdjectives[rand(0, cnAdjectives.length - 1)];
        const core1 = coreWords[rand(0, coreWords.length - 1)];
        return `${prefix}${adj1}${core1}${suffix}`;
        
      case 2: // 符号 + 核心词 + 数字后缀
        const core2 = coreWords[rand(0, coreWords.length - 1)];
        return `${symbol}${core2}${rand(1, 999)}`;
        
      case 3: // 中文形容词 + 的 + 核心词
        const adj3 = cnAdjectives[rand(0, cnAdjectives.length - 1)];
        const core3 = coreWords[rand(0, coreWords.length - 1)];
        return `${adj3}的${core3}`;
        
      case 4: // 英文前缀 + 中文核心词 + 英文后缀
        const enPrefixes = ['Mr_', 'Ms_', 'Dr_', 'AI_', 'Cyber_', 'Digital_', 'Virtual_'];
        const enPrefix = enPrefixes[rand(0, enPrefixes.length - 1)];
        const core4 = coreWords[rand(0, coreWords.length - 1)];
        const enSuffixes = ['_Pro', '_Max', '_Plus', '_X', '_Z'];
        const enSuffix = enSuffixes[rand(0, enSuffixes.length - 1)];
        return `${enPrefix}${core4}${enSuffix}`;
        
      case 5: // 动作前缀 + 核心词
        const actions = ['狂炫', '暴风', '沉浸式', '在线', '离线'];
        const action = actions[rand(0, actions.length - 1)];
        const core5 = coreWords[rand(0, coreWords.length - 1)];
        return `${action}${core5}`;
        
      case 6: // 纯英文科技风
        const enWords = ['Dark', 'Shadow', 'Light', 'Fire', 'Ice', 'Storm', 'Cyber', 'Neo', 'Tech', 'Data', 'Code'];
        return `${enWords[rand(0, enWords.length - 1)]}${rand(1, 999)}`;
        
      case 7: // 中文流行语缩写 + 核心词
        const abbr = ['AKA', 'DIY', 'CPU', 'KFC', 'PDF', 'ATM', 'VIP', 'YYDS'][rand(0, 7)];
        const core7 = coreWords[rand(0, coreWords.length - 1)];
        return `${abbr}${core7}`;
        
      case 8: // 符号 + 中文形容词 + 核心词 + 颜文字后缀
        const adj8 = cnAdjectives[rand(0, cnAdjectives.length - 1)];
        const core8 = coreWords[rand(0, coreWords.length - 1)];
        const kaomoji = ['~(￣▽￣)~', '(・∀・)', '(￣ω￣)', '(≧∇≦)ﾉ', '_(:3」∠)_', '(╯°□°)╯', '(*/ω＼*)'][rand(0, 6)];
        return `${symbol}${adj8}${core8}${kaomoji}`;
        
      default:
        const adjDefault = cnAdjectives[rand(0, cnAdjectives.length - 1)];
        const coreDefault = coreWords[rand(0, coreWords.length - 1)];
        return `${prefix}${adjDefault}${coreDefault}${suffix}`;
    }
  }
  
  // 辅助随机数函数
  rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 自动添加新居民（定期调用）
  tryAddNewResident() {
    // 检查是否到了添加新居民的时间
    const daysSinceLastNewChar = this.state.totalDaysPassed - this.lastNewCharDay;
    
    if (daysSinceLastNewChar >= this.newCharInterval) {
      // 获取所有已存在的角色名字（包括初始居民和自定义名字）
      const existingNames = new Set(this.state.chars.map(c => c.name));
      
      // 如果使用了自定义名字，排除自定义名字列表中的名字
      const customNamesSet = this.state.customCharacterNames.length === 12 
        ? new Set(this.state.customCharacterNames)
        : new Set<string>();
      
      // 尝试从 NAMES 列表中添加（但要排除已存在的和自定义名字）
      const availableNames = NAMES.filter(name => 
        !existingNames.has(name) && !customNamesSet.has(name)
      );
      
      let newName: string;
      if (availableNames.length > 0) {
        // 优先使用 NAMES 列表中的名字（但不在自定义名字中）
        newName = choose(availableNames);
      } else {
        // NAMES 列表用完了或都被排除了，生成随机名字
        // 确保不重复（包括不与自定义名字重复）
        let attempts = 0;
        do {
          newName = this.generateRandomName();
          attempts++;
          if (attempts > 100) {
            // 如果尝试100次都重复，添加数字后缀
            newName = this.generateRandomName() + rand(1, 999);
            break; // 添加数字后缀后肯定不重复，跳出循环
          }
        } while (existingNames.has(newName) || customNamesSet.has(newName));
      }
      
      // 创建新角色
      const newChar = new Character(newName);
      
      // 为新角色初始化与其他所有角色的关系
      this.state.chars.forEach(c => {
        newChar.relationships[c.name] = { love: 0, status: 'stranger' };
        c.relationships[newName] = { love: 0, status: 'stranger' };
      });
      
      // 多人模式：设置所属城镇
      if (this.isMultiplayerMode && this.currentTownId) {
        newChar.homeTown = this.currentTownId;
        newChar.currentTown = this.currentTownId;
      }
      
      // 添加到角色列表
      this.state.chars.push(newChar);
      
      // 更新上次添加新居民的时间
      this.lastNewCharDay = this.state.totalDaysPassed;
      
      this.log(`[🎉新居民] 欢迎新邻居 **${newName}** 入住猫果镇！小镇人口现在有 ${this.state.chars.length} 人。`, 'event');
      
      // 自动保存
      this.autoSave();
    }
  }

  initNewGame() {
    // 重置所有游戏状态
    this.state.townMoney = 0; // 重置镇库
    this.state.gameTime = 480; // minutes, start at 8:00
    this.state.gameDay = 1; // 0-6, default Monday
    this.state.totalDaysPassed = 0;
    this.state.logs = [];
    this.state.isPlaying = false;
    this.state.timeSpeed = 1;
    
    // 新建游戏时清除调试模式标志
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem('debug_mode');
      window.dispatchEvent(new CustomEvent('debug-mode-disabled'));
    }
    
    // 如果没有自定义城镇名称，使用默认值
    if (!this.state.townName || this.state.townName.trim() === '') {
      this.state.townName = '猫果镇';
    }
    
    // 确定使用的居民名称列表
    const characterNames = this.state.customCharacterNames.length === 12 
      ? this.state.customCharacterNames 
      : NAMES;
    
    // 初始化角色
    const currentTime = this.getAbsoluteTime();
    this.state.chars = characterNames.map(n => {
      const c = new Character(n);
      // 设置出生时间（根据年龄推算）
      const ageInDays = c.age * 365;
      c.birthTime = currentTime - (ageInDays * 1440);
      // 初始化关系网：所有人都是陌生人
      characterNames.forEach(target => {
        if (target !== n) c.relationships[target] = { love: 0, status: 'stranger' };
      });
      // 多人模式：设置所属城镇
      if (this.isMultiplayerMode && this.currentTownId) {
        c.homeTown = this.currentTownId;
        c.currentTown = this.currentTownId;
      }
      return c;
    });

    // 初始化建筑
    this.state.buildings = BUILDINGS_BLUEPRINT.map(b => new Building(b));
    // 默认公园是建好的
    const park = this.state.buildings.find(b => b.id === 'park');
    if (park) {
      park.isBuilt = true;
      park.currentProgress = park.totalCost;
    }
    
    // 确保建筑列表不为空
    if (this.state.buildings.length === 0) {
      console.error('警告：建筑列表为空！');
    }
    
    // 初始化新居民添加时间
    this.lastNewCharDay = 0;
  }

  start() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    
    // 启动循环
    this.tickIntervalId = setInterval(() => this.tick(), 1500);
    this.log('游戏开始', 'info');
  }

  stop() {
    this.state.isPlaying = false;
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    this.log('游戏暂停', 'info');
  }

  tick() {
    if (!this.state.isPlaying) return;

    // 0. 时间流逝 (每次10分钟 * 速度倍数)
    const timeIncrement = Math.floor(10 * this.state.timeSpeed);
    this.state.gameTime += timeIncrement;
    if (this.state.gameTime >= 1440) {
      // 记录前一天的建筑收入
      this.state.buildings.forEach(building => {
        if (building.isBuilt && building.lastRevenueDay < this.state.totalDaysPassed) {
          // 计算当天的总收入（总收入减去历史收入总和）
          const previousTotal = building.revenueHistory.reduce((a, b) => a + b, 0);
          const dailyRevenue = building.totalRevenue - previousTotal;
          if (dailyRevenue >= 0) {
            building.revenueHistory.push(dailyRevenue);
            // 只保留最近30天的记录
            if (building.revenueHistory.length > 30) {
              building.revenueHistory.shift();
            }
          }
          
          // 记录当天分配给员工的收入（扣除公司账户10%后的90%）
          if (building.dailyStaffIncome > 0) {
            building.staffIncomeHistory.push(building.dailyStaffIncome);
            // 只保留最近30天的记录
            if (building.staffIncomeHistory.length > 30) {
              building.staffIncomeHistory.shift();
            }
            building.dailyStaffIncome = 0; // 重置当天员工收入
          } else {
            // 即使当天没有员工收入，也记录0（保持历史记录完整）
            building.staffIncomeHistory.push(0);
            if (building.staffIncomeHistory.length > 30) {
              building.staffIncomeHistory.shift();
            }
          }
          
          building.lastRevenueDay = this.state.totalDaysPassed;
        }
      });
      
      this.state.gameTime = 0;
      this.state.gameDay = (this.state.gameDay + 1) % 7; // 下一天
      this.state.totalDaysPassed++; // 增加总天数
      this.log(`新的一天开始了！今天是${DAYS[this.state.gameDay]}`, 'system');
      
      // 尝试添加新居民（每天检查一次）
      this.tryAddNewResident();
    }

    // 尝试招聘/选举 (每小时一次，避免刷屏)
    if (this.state.gameTime % 60 === 0) {
      this.runElectionsAndHiring();
      
      // 可信度自然恢复（每小时恢复1点，但不超过初始值50）
      this.state.chars.forEach(c => {
        if (c.credibility < 50) {
          c.credibility = Math.min(50, c.credibility + 1);
        }
      });
      
      // 检查建筑自动升级（每小时检查一次）
      this.checkAutoUpgrade();
      
      // 检查怀孕进度（分娩和堕胎）
      this.checkPregnancyProgress();
      
      // 检查抢劫事件（每小时检查一次）
      this.checkRobbery();
      
      // 检查零花钱（每小时检查一次，针对1-17岁的孩子）
      this.checkAllowance();
      
      // 检查年龄增长和死亡（每天检查一次）
      if (this.state.gameTime === 0) {
        this.checkAgeAndDeath();
      }
      
      // 检查人口流失和城镇幸福感（每天检查一次）
      if (this.state.gameTime === 0) {
        this.checkPopulationFlow();
      }
    }

    // 1. 角色行动（根据速度调整行动频率）
    const actionCount = Math.max(1, Math.floor(this.state.timeSpeed));
    for (let i = 0; i < actionCount; i++) {
      if (this.state.chars.length > 0) {
        const actor = choose(this.state.chars);
        this.decideAction(actor);
      }
    }

    // 2. 自动存档检查（更频繁的自动保存）
    this.autoSaveTimer += 1.5; // tick 间隔是 1.5 秒
    if (this.autoSaveTimer >= this.autoSaveInterval) {
      this.autoSave();
      this.autoSaveTimer = 0;
    }
  }

  // 选举与招聘核心逻辑
  runElectionsAndHiring() {
    this.state.buildings.forEach(b => {
      if (!b.isBuilt || b.jobs.length === 0) return;

      // 1. 如果没有管理者 (staff[0]) -> 举行全民选举
      if (b.staff.length === 0) {
        // 筛选候选人：排除有工作的、在冷却期的、在辞职冷静期的、一个月内不能回到原岗位的
        const candidates = this.state.chars.filter(c => {
          if (c.job) return false; // 有工作的不能参选
          
          // 检查是否在辞职冷静期内（5天内不能工作）
          if (c.resignationCooldown && this.getAbsoluteTime() < c.resignationCooldown) {
            return false; // 还在冷静期
          }
          
          // 检查是否在一个月内不能回到原岗位（30 * 1440 = 43200 分钟）
          if (c.lastResignedBuilding === b.id && c.lastResignedTime) {
            const oneMonthInMinutes = 30 * 1440;
            if (this.getAbsoluteTime() < c.lastResignedTime + oneMonthInMinutes) {
              return false; // 一个月内不能回到原岗位
            }
          }
          
          // 检查是否在选举冷却期
          if (c.electionCooldown && c.electionCooldown[b.id]) {
            if (this.getAbsoluteTime() < c.electionCooldown[b.id]) {
              return false; // 还在冷却期
            } else {
              // 冷却期已过，清除冷却期记录
              delete c.electionCooldown[b.id];
              delete c.electionFailures[b.id];
            }
          }
          return true;
        });

        if (candidates.length > 0) {
          // 选举前：候选人可以尝试收买其他居民（降低概率，更缓和）
          candidates.forEach(candidate => {
            if (candidate.electionCooldown && candidate.electionCooldown[b.id] &&
              this.getAbsoluteTime() < candidate.electionCooldown[b.id]) {
              return; // 冷却期不能贿赂
            }
            // 降低行贿概率：从30%降到10%，且需要更多钱
            if (candidate.money >= 30 && Math.random() < 0.1) { // 10%概率尝试收买，且需要至少30元
              this.attemptBribery(candidate, b);
            }
          });

          // 投票系统：同意票和反对票
          const yesVotes: Record<string, number> = {};
          const noVotes: Record<string, number> = {};
          candidates.forEach(c => {
            yesVotes[c.name] = 0;
            noVotes[c.name] = 0;
          });

          this.state.chars.forEach(voter => {
            candidates.forEach(c => {
              if (c.name === voter.name) {
                // 自己投自己同意票
                yesVotes[c.name]++;
              } else {
                // 根据好感度、可信度、收买状态决定投票
                const rel = voter.relationships[c.name];
                const love = rel ? rel.love : 0;

                // 检查是否被收买
                const wasBribed = (voter as any).bribedBy === c.name;
                const bribeRejected = (voter as any).rejectedBribeFrom === c.name;

                // 基础投票倾向（更缓和的机制）
                let voteScore = love;

                // 收买效果（降低影响）
                if (wasBribed) {
                  voteScore += 20; // 从30降到20
                }

                // 拒绝收买后的反对效果（降低影响）
                if (bribeRejected) {
                  voteScore -= 20; // 从40降到20
                }

                // 可信度影响（更温和）
                const credibilityFactor = (c.credibility - 50) / 3; // 从/2改为/3，影响更小
                voteScore += credibilityFactor;

                // 举报影响（降低影响）
                if ((c as any).wasReported) {
                  voteScore -= 30; // 从50降到30
                }

                // 随机波动（降低波动范围）
                voteScore += rand(-10, 10); // 从±15降到±10

                // 决定投票（降低阈值，更容易投票）
                if (voteScore >= 15) { // 从25降到15，更容易投同意票
                  yesVotes[c.name]++;
                } else if (voteScore <= 5) { // 从10降到5，更难投反对票
                  noVotes[c.name]++;
                }
              }
            });
          });

          // 结算：简单多数即可当选
          let winner: Character | null = null;
          let maxYesVotes = -1;

          for (const name in yesVotes) {
            const yes = yesVotes[name];
            const no = noVotes[name] || 0;

            // 更缓和的当选条件：同意票大于反对票，且至少有1票同意（从2票降到1票）
            if (yes > no && yes >= 1) {
              if (yes > maxYesVotes) {
                maxYesVotes = yes;
                winner = candidates.find(c => c.name === name) || null;
              }
            }
          }

          if (winner) {
            const roleName = b.jobs[0];
            winner.job = { buildingId: b.id, role: roleName };
            b.staff.push(winner.name);
            const noCount = noVotes[winner.name] || 0;
            winner.credibility = Math.min(100, winner.credibility + 15);
            
            // 初始化工作满意度
            winner.jobSatisfaction = 70;
            
            // 初始化摸鱼记录
            if (!winner.slackingOffCount[b.id]) {
              winner.slackingOffCount[b.id] = 0;
            }
            
            if (winner.electionFailures && winner.electionFailures[b.id]) {
              delete winner.electionFailures[b.id];
            }
            if (winner.electionCooldown && winner.electionCooldown[b.id]) {
              delete winner.electionCooldown[b.id];
            }
            this.log(`[🗳️选举] 经全民投票，**${winner.name}** (${maxYesVotes}同意/${noCount}反对) 当选为 **${b.name}** 的${roleName}！`, 'build');
          } else {
            // 没有人获得足够票数
            const topCandidate = candidates.reduce((best, c) => {
              const yes = yesVotes[c.name] || 0;
              const bestYes = yesVotes[best.name] || 0;
              return yes > bestYes ? c : best;
            }, candidates[0]);

            if (topCandidate) {
              const yes = yesVotes[topCandidate.name] || 0;
              const no = noVotes[topCandidate.name] || 0;

              if (!topCandidate.electionFailures) topCandidate.electionFailures = {};
              topCandidate.electionFailures[b.id] = (topCandidate.electionFailures[b.id] || 0) + 1;
              const failureCount = topCandidate.electionFailures[b.id];

              this.log(`[🗳️选举] **${b.name}** 选举失败，**${topCandidate.name}** 仅获得 ${yes}同意/${no}反对 票，未达到要求。`, 'reject');

              // 如果失败7次，进入冷却期（从5次增加到7次，更宽容）
              if (failureCount >= 7) {
                if (!topCandidate.electionCooldown) topCandidate.electionCooldown = {};
                topCandidate.electionCooldown[b.id] = this.getAbsoluteTime() + 2880; // 2天（从3天降到2天）
                this.log(`[⏸️冷却期] **${topCandidate.name}** 在 **${b.name}** 的竞选中连续失败7次，进入2天冷却期。在此期间需要通过社区服务提升可信度才能重新参选。`, 'reject');
              }
            }
          }

          // 清理收买状态
          this.state.chars.forEach(c => {
            delete (c as any).bribedBy;
            delete (c as any).rejectedBribeFrom;
          });
          candidates.forEach(c => {
            delete (c as any).wasReported;
          });
        }
      }
      // 2. 如果有管理者，但人手不够 -> 管理者招聘
      else if (b.staff.length < b.jobs.length) {
        const managerName = b.staff[0];
        const manager = this.state.chars.find(c => c.name === managerName);
        if (manager) {
          const roleName = b.jobs[b.staff.length];
          const candidates = this.state.chars.filter(c => !c.job) as Character[];

          // 经理选人：选好感度最高的
          let bestC: Character | null = null;
          let maxLove = -999;

          candidates.forEach(c => {
            const rel = manager.relationships[c.name];
            const love = rel ? rel.love : 0;
            if (love > maxLove) {
              maxLove = love;
              bestC = c;
            }
          });

          if (bestC !== null) {
            const employee = bestC as Character;
            employee.job = { buildingId: b.id, role: roleName };
            b.staff.push(employee.name);
            
            // 初始化工作满意度
            employee.jobSatisfaction = 70;
            
            // 初始化摸鱼记录
            if (!employee.slackingOffCount[b.id]) {
              employee.slackingOffCount[b.id] = 0;
            }
            
            this.log(`[🤝招聘] ${b.name}的经理 **${manager.name}** 录用了熟人 **${employee.name}** 担任 ${roleName}。`, 'info');
          }
        }
      }

      // 3. 洗脚店老板拉皮条（招聘卖银者）
      if (b.id === 'footshop' && b.isBuilt && b.staff.length > 0) {
        const bossName = b.staff[0];
        const boss = this.state.chars.find(c => c.name === bossName);
        if (boss && b.prostitutes.length < 3) { // 最多3个卖银者
          const candidates = this.state.chars.filter(c =>
            !c.job &&
            !c.prostitute &&
            c.hasTrait('promiscuous') &&
            c.age > 17 // 1到17岁不可以卖银
          );

          if (candidates.length > 0 && Math.random() < 0.1) { // 10%概率拉皮条
            const target = choose(candidates);
            target.prostitute = { buildingId: b.id };
            b.prostitutes.push(target.name);
            this.log(`[💋拉皮条] **${boss.name}** 说服了 **${target.name}** 在洗脚店卖银...`, 'drama');
          }
        }
      }
    });
  }

  // 收买机制
  attemptBribery(briber: Character, building: Building) {
    // 检查是否在冷却期
    if (briber.electionCooldown && briber.electionCooldown[building.id] &&
      this.getAbsoluteTime() < briber.electionCooldown[building.id]) {
      return;
    }

    // 选择收买目标（排除自己，优先收买缺钱的人）
    const targets = this.state.chars.filter(c =>
      c.name !== briber.name
    ).sort((a, b) => a.money - b.money);

    if (targets.length === 0) return;

    const target = choose(targets);
    const bribeAmount = rand(15, 30);

    if (briber.money < bribeAmount) return;

    // 检查是否有目击者
    const witnesses = this.state.chars.filter(c =>
      c.name !== briber.name &&
      c.name !== target.name &&
      Math.random() < 0.3
    );

    // 检查目击者是否会举报
    witnesses.forEach(witness => {
      const rel = witness.relationships[briber.name];
      const love = rel ? rel.love : 0;
      const reportChance = love < 30 ? 0.4 : 0.1;

      if (Math.random() < reportChance) {
        // 如果目击者爱钱，可以花钱收买目击者
        if (witness.hasTrait('money-loving') && briber.money >= 20) {
          const witnessBribeAmount = rand(10, 20);
          if (briber.money >= witnessBribeAmount) {
            briber.money -= witnessBribeAmount;
            witness.money += witnessBribeAmount;
            this.log(`[💰封口费] **${briber.name}** 花费 💰${witnessBribeAmount} 收买了目击者 **${witness.name}**，成功封口！`, 'drama');
            return;
          }
        }
        // 没有被收买，正常举报
        (briber as any).wasReported = true;
        this.log(`[🚨举报] **${witness.name}** 目击了 **${briber.name}** 的贿赂行为并举报！`, 'drama');
      }
    });

    // 目标决定是否接受收买
    const rel = target.relationships[briber.name];
    const love = rel ? rel.love : 0;
    let acceptChance = 0.3 + (love / 100) * 0.3;

    if (target.hasTrait('money-loving')) {
      acceptChance *= 1.8;
    } else {
      acceptChance *= 0.6;
    }

    if ((briber as any).wasReported) {
      acceptChance *= 0.5;
    }

    if (Math.random() < acceptChance) {
      // 接受收买
      briber.money -= bribeAmount;
      target.money += bribeAmount;
      (target as any).bribedBy = briber.name;
      this.log(`[💰收买] **${briber.name}** 花费 💰${bribeAmount} 收买了 **${target.name}** 的选票！`, 'drama');
    } else {
      // 拒绝收买
      (target as any).rejectedBribeFrom = briber.name;
      briber.credibility = Math.max(0, briber.credibility - 5);
      this.log(`[❌拒绝收买] **${target.name}** 拒绝了 **${briber.name}** 的收买，**${briber.name}** 的可信度下降了！`, 'reject');
    }
  }

  log(msg: string, type: string = '') {
    const time = this.formatTime(this.state.gameTime);
    this.state.logs.unshift({
      id: Date.now() + Math.random(),
      time,
      message: msg,
      type
    });
    if (this.state.logs.length > 60) this.state.logs.pop();
  }

  formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // 存档相关
  autoSave() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      this.lastSaveTime = Date.now();
      const saveData = this.toJSON();
      const saveKey = `happyTownV2_Save_Slot${this.currentSlot}`;
      localStorage.setItem(saveKey, saveData);
      // 静默保存，不显示日志（避免刷屏）
    } catch (e) {
      console.error('自动存档失败', e);
      // 自动存档失败时不显示给用户，避免干扰游戏体验
    }
  }

  manualSave() {
    this.autoSave();
    this.log('💾 手动存档成功', 'info');
  }

  toJSON(): string {
    return JSON.stringify({
      version: GAME_VERSION,
      saveTime: new Date().toISOString(),
      chars: this.state.chars,
      buildings: this.state.buildings,
      townMoney: this.state.townMoney,
      gameTime: this.state.gameTime,
      gameDay: this.state.gameDay,
      totalDaysPassed: this.state.totalDaysPassed,
      timeSpeed: this.state.timeSpeed,
      lastNewCharDay: this.lastNewCharDay, // 保存上次添加新居民的时间
      townName: this.state.townName, // 保存城镇名称
      customCharacterNames: this.state.customCharacterNames, // 保存自定义居民名称
      observerName: this.state.observerName // 保存旁观者名称
    });
  }

  loadFromJSON(jsonStr: string): { success: boolean; message?: string } {
    try {
      const data = JSON.parse(jsonStr);
      
      // 版本检查
      const saveVersion = data.version || '0.0.0';
      if (!this.isVersionCompatible(saveVersion)) {
        return {
          success: false,
          message: `存档版本 (${saveVersion}) 与当前版本 (${GAME_VERSION}) 不兼容`
        };
      }

      // 版本迁移（如果需要）
      const migratedData = this.migrateSaveData(data, saveVersion);
      
      // 重建 Character 和 Building 对象
      this.state.chars = (migratedData.chars || []).map((c: any) => {
        const char = new Character(c.name);
        Object.assign(char, c);
        return char;
      });
      
      // 加载建筑数据
      if (migratedData.buildings && Array.isArray(migratedData.buildings) && migratedData.buildings.length > 0) {
        this.state.buildings = migratedData.buildings.map((b: any) => {
          // 兼容旧存档格式（b.id）和新格式（b.blueprint.id）
          const blueprint = BUILDINGS_BLUEPRINT.find(bl => 
            bl.id === (b.blueprint?.id || b.id)
          );
          if (!blueprint) {
            console.warn(`找不到建筑蓝图: ${b.blueprint?.id || b.id}`);
            return null;
          }
          const building = new Building(blueprint);
          // 恢复建筑状态
          Object.assign(building, {
            ...b,
            blueprint: blueprint, // 确保 blueprint 引用正确
            // 确保新字段存在
            companyFunds: b.companyFunds ?? 0,
            level: b.level ?? 1,
            baseSalary: b.baseSalary ?? 10,
            // 确保 products 从 blueprint 中恢复（如果存档中没有或为空）
            products: b.products && b.products.length > 0 ? b.products : (blueprint.products || [])
          });
          return building;
        }).filter((b: any) => b !== null) as Building[];
      } else {
        // 如果存档中没有建筑数据，重新初始化建筑
        console.warn('存档中没有建筑数据，重新初始化建筑');
        this.state.buildings = BUILDINGS_BLUEPRINT.map(b => new Building(b));
        // 默认公园是建好的
        const park = this.state.buildings.find(b => b.id === 'park');
        if (park) {
          park.isBuilt = true;
          park.currentProgress = park.totalCost;
        }
      }
      
      this.state.townMoney = migratedData.townMoney || 0;
      this.state.gameTime = migratedData.gameTime || 480;
      this.state.gameDay = migratedData.gameDay || 1;
      this.state.totalDaysPassed = migratedData.totalDaysPassed || 0;
      this.state.timeSpeed = migratedData.timeSpeed || 1;
      
      // 恢复城镇名称和自定义居民名称（如果存档中没有，使用默认值）
      this.state.townName = migratedData.townName || '猫果镇';
      this.state.customCharacterNames = migratedData.customCharacterNames || [];
      
      // 恢复旁观者名称（如果旧存档没有，随机生成一个）
      if (migratedData.observerName && migratedData.observerName.trim()) {
        this.state.observerName = migratedData.observerName;
      } else {
        // 随机生成一个旁观者名称
        this.state.observerName = this.generateRandomName() + rand(1, 999);
        this.log(`[🎲随机] 为你的存档随机生成了旁观者名称：${this.state.observerName}`, 'system');
      }
      
      // 恢复新居民添加时间（如果存档中没有，使用总天数）
      this.lastNewCharDay = migratedData.lastNewCharDay || this.state.totalDaysPassed;
      
      return { success: true };
    } catch (e) {
      console.error('加载存档失败', e);
      return {
        success: false,
        message: `存档文件损坏：${e instanceof Error ? e.message : '未知错误'}`
      };
    }
  }

  // 检查版本兼容性
  isVersionCompatible(saveVersion: string): boolean {
    if (!saveVersion || saveVersion === '0.0.0') {
      // 旧版本存档（无版本号），尝试兼容
      return true;
    }
    
    // 简单的版本比较（主版本号和次版本号必须匹配）
    const saveParts = saveVersion.split('.');
    const currentParts = GAME_VERSION.split('.');
    const minParts = MIN_SUPPORTED_VERSION.split('.');
    
    // 主版本号必须匹配
    if (saveParts[0] !== currentParts[0]) {
      return false;
    }
    
    // 次版本号不能低于最低支持版本
    const saveMinor = parseInt(saveParts[1] || '0');
    const minMinor = parseInt(minParts[1] || '0');
    if (saveMinor < minMinor) {
      return false;
    }
    
    return true;
  }

  // 版本迁移逻辑
  migrateSaveData(data: any, fromVersion: string): any {
    let migrated = { ...data };
    
    // 从 0.7.0 或更早版本迁移
    if (!fromVersion || fromVersion.startsWith('0.7.0') || fromVersion === '0.0.0') {
      // 确保建筑有正确的 blueprint 引用和新字段
      if (migrated.buildings) {
        migrated.buildings = migrated.buildings.map((b: any) => {
          if (!b.blueprint && b.id) {
            const blueprint = BUILDINGS_BLUEPRINT.find(bl => bl.id === b.id);
            if (blueprint) {
              b.blueprint = blueprint;
            }
          }
          // 确保新字段存在
          if (b.companyFunds === undefined) b.companyFunds = 0;
          if (b.level === undefined) b.level = 1;
          if (b.baseSalary === undefined) b.baseSalary = 10;
          if (!b.staffIncomeHistory) b.staffIncomeHistory = [];
          if (b.dailyStaffIncome === undefined) b.dailyStaffIncome = 0;
          return b;
        });
      }
      
              // 确保所有角色都有必需的关系字段
              if (migrated.chars) {
                migrated.chars = migrated.chars.map((c: any) => {
                  // 确保关系对象存在
                  if (!c.relationships) {
                    c.relationships = {};
                  }
                  // 确保其他必需字段存在
                  if (!c.incomeStats) {
                    c.incomeStats = {
                      work: 0,
                      oddJob: 0,
                      streetwalking: 0,
                      prostitution: 0,
                      construction: 0,
                      total: 0
                    };
                  }
                  // 确保摸鱼记录存在
                  if (!c.slackingOffCount) {
                    c.slackingOffCount = {};
                  }
                  // 确保工作满意度存在
                  if (c.jobSatisfaction === undefined) {
                    c.jobSatisfaction = 70;
                  }
                  // 确保吵架次数存在
                  if (c.fightCount === undefined) {
                    c.fightCount = 0;
                  }
                  // 确保睡觉时间存在
                  if (c.totalSleepTime === undefined) {
                    c.totalSleepTime = 0;
                  }
                  // 确保性欲相关字段存在
                  if (c.sexualDesire === undefined) {
                    c.sexualDesire = rand(20, 60);
                  }
                  if (c.isRelieving === undefined) {
                    c.isRelieving = false;
                  }
                  if (c.relievingWith === undefined) {
                    c.relievingWith = undefined;
                  }
                  if (c.relievingEndTime === undefined) {
                    c.relievingEndTime = undefined;
                  }
                  if (c.fwbList === undefined) {
                    c.fwbList = [];
                  }
                  // 确保辞职相关字段存在
                  if (c.resignationCooldown === undefined) {
                    c.resignationCooldown = undefined;
                  }
                  if (c.lastResignedBuilding === undefined) {
                    c.lastResignedBuilding = undefined;
                  }
                  if (c.lastResignedTime === undefined) {
                    c.lastResignedTime = undefined;
                  }
                  // 确保扣录和打炮次数存在
                  if (c.masturbationCount === undefined) {
                    c.masturbationCount = 0;
                  }
                  if (c.sexCount === undefined) {
                    c.sexCount = 0;
                  }
                  // 确保酒量相关字段存在
                  if (c.alcoholTolerance === undefined) {
                    c.alcoholTolerance = rand(30, 90);
                  }
                  if (c.isDrunk === undefined) {
                    c.isDrunk = false;
                  }
                  if (c.drunkEndTime === undefined) {
                    c.drunkEndTime = undefined;
                  }
                  // 确保建筑收入记录存在
                  if (!c.buildingIncome) {
                    c.buildingIncome = {};
                  }
                  return c;
                });
              }
    }
    
    // 未来可以添加更多迁移逻辑
    // 例如：从 0.7.2 迁移到 0.8.0 时的数据转换
    
    return migrated;
  }

  // 打断互动关系
  breakInteraction(c: Character) {
    if (c.interactingWith) {
      const partner = this.state.chars.find(x => x.name === c.interactingWith);
      if (partner) {
        partner.interactingWith = null;
        partner.currentAction = "发呆";
        
        // 如果正在发泄性欲，也会被打断
        if (partner.isRelieving) {
          this.handleSexualRelief(partner);
        }
        
        // 如果一起在酒店，清除酒店状态
        if (partner.isInHotel && partner.hotelWith === c.name) {
          partner.isInHotel = false;
          partner.hotelWith = undefined;
        }
      }
      c.interactingWith = null;
      
      // 如果正在发泄性欲，也会被打断
      if (c.isRelieving) {
        this.handleSexualRelief(c);
      }
      
      // 如果一起在酒店，清除酒店状态
      if (c.isInHotel && c.hotelWith) {
        const hotelPartner = this.state.chars.find(x => x.name === c.hotelWith);
        if (hotelPartner && hotelPartner.isInHotel && hotelPartner.hotelWith === c.name) {
          hotelPartner.isInHotel = false;
          hotelPartner.hotelWith = undefined;
        }
        c.isInHotel = false;
        c.hotelWith = undefined;
      }
    } else if (c.isInHotel) {
      // 如果没有互动对象但还在酒店，清除酒店状态
      if (c.hotelWith) {
        const hotelPartner = this.state.chars.find(x => x.name === c.hotelWith);
        if (hotelPartner && hotelPartner.isInHotel && hotelPartner.hotelWith === c.name) {
          hotelPartner.isInHotel = false;
          hotelPartner.hotelWith = undefined;
        }
      }
      c.isInHotel = false;
      c.hotelWith = undefined;
    }
  }

  // 角色行为决策核心方法
  decideAction(p: Character) {
    // 行动前先结束上一段互动关系（如果有）
    this.breakInteraction(p);
    const hour = Math.floor(this.state.gameTime / 60);

    // S1. 睡觉优先
    const sleepSchedule = p.getSleepSchedule();
    let isSleepTime = false;
    if (sleepSchedule.start > sleepSchedule.end) {
      isSleepTime = hour >= sleepSchedule.start || hour < sleepSchedule.end;
    } else {
      isSleepTime = hour >= sleepSchedule.start && hour < sleepSchedule.end;
    }

    if (isSleepTime) {
      p.currentAction = "😴 睡觉";
      let recovery = 2;
      if (p.hasTrait('sleepy')) recovery += 2;
      p.happiness = Math.min(100, p.happiness + recovery);
      // 记录睡觉时间（每次 tick 约 10 分钟，转换为小时）
      p.totalSleepTime = (p.totalSleepTime || 0) + (10 / 60);
      return;
    }

    // 检查冷静期是否结束（优先检查）
    if (p.resignationCooldown && this.getAbsoluteTime() >= p.resignationCooldown) {
      p.resignationCooldown = undefined;
      if (!p.job) {
        p.currentAction = "失业中";
        this.log(`[💼冷静期结束] **${p.name}** 的辞职冷静期已结束，可以重新找工作了。`, 'info');
      }
    }

    // 年龄限制：1到17岁不可以参与任何工作，不可以站街或卖银
    if (p.age >= 1 && p.age <= 17) {
      // 如果有工作，强制失业
      if (p.job) {
        const building = this.state.buildings.find(b => b.id === p.job!.buildingId);
        if (building) {
          const index = building.staff.indexOf(p.name);
          if (index !== -1) {
            building.staff.splice(index, 1);
          }
        }
        p.job = null;
      }
      
      // 不能站街或打零工
      if (p.money < 20) {
        // 尝试获得零花钱
        this.tryGetAllowance(p);
        if (p.money < 20) {
          p.currentAction = "未成年（等待零花钱）";
          this.doRest(p, { name: "路边", effect: "none", price: 0 });
          return;
        }
      }
      
      // 跳过工作相关逻辑
    } else {
      // S2. 上班优先（检查冷静期）
      if (p.job) {
        // 检查是否在辞职冷静期内
        if (p.resignationCooldown && this.getAbsoluteTime() < p.resignationCooldown) {
          // 冷静期内不能工作，强制失业
          p.job = null;
          p.currentAction = "失业中（冷静期）";
          return;
        }
        
        const workplace = this.state.buildings.find(b => b.id === p.job!.buildingId);
        if (workplace && workplace.isOpen(hour, this.state.gameDay)) {
          const is24Hour = workplace.open === 0 && workplace.close === 24;
          const shouldWork = is24Hour ? Math.random() < 0.7 : true;
          if (shouldWork) {
            this.doWork(p, workplace);
            return;
          }
        }
      }

      // S3. 生存压力：无业且没钱时强制搬砖或站街（但冷静期内不能工作）
      if (!p.job && p.money < 20) {
        // 检查是否在辞职冷静期内
        if (p.resignationCooldown && this.getAbsoluteTime() < p.resignationCooldown) {
          // 冷静期内不能打零工或站街，只能休息
          p.currentAction = "失业中（冷静期）";
          this.doRest(p, { name: "路边", effect: "none", price: 0 });
          return;
        }
        
        if (p.hasTrait('promiscuous') && Math.random() < 0.6) {
          this.doStreetwalking(p);
        } else {
          this.doOddJob(p);
        }
        return;
      }
    }

    // 状态检查
    if (p.happiness < 20) {
      this.doRest(p, { name: "路边", effect: "none", price: 0 });
      return;
    }

    // 性欲处理：如果正在发泄性欲，检查是否被打断
    if (p.isRelieving) {
      this.handleSexualRelief(p);
      return; // 正在发泄时，不进行其他活动
    }

    // 性欲积累：每次行动时性欲会缓慢增加
    if (p.sexualDesire < 100) {
      p.sexualDesire = Math.min(100, p.sexualDesire + rand(0, 2));
    }

    // 性欲处理：性欲值高时优先处理
    if (p.sexualDesire > 70) {
      const reliefResult = this.trySexualRelief(p);
      if (reliefResult) {
        return; // 成功处理性欲，不再进行其他活动
      }
    }

    const roll = Math.random();
    // 选择可访问的场所（不再检查入门费用，因为已取消）
    const availableVenues = this.state.buildings.filter(b => 
      b.isBuilt && 
      b.isOpen(hour, this.state.gameDay)
    );
    
    // 多人模式：检查是否需要跨城镇消费
    if (this.isMultiplayerMode && availableVenues.length === 0) {
      // 如果本地没有可用建筑，尝试跨城镇消费
      if (this.tryCrossTownConsume(p)) {
        return; // 如果成功跨城镇消费，不再执行其他逻辑
      }
      // 如果跨城镇消费失败，继续执行其他逻辑（例如休息）
    }
    
    // 多人模式：特定需求时尝试跨城镇（例如需要酒店但没有）
    if (this.isMultiplayerMode && p.hasTrait('sleepy') && Math.random() < 0.3) {
      const localHotel = this.state.buildings.find(b => b.id === 'hotel' && b.isBuilt);
      if (!localHotel) {
        // 本地没有酒店，尝试去其他城镇
        if (this.tryCrossTownConsume(p, 'hotel')) {
          return; // 如果成功跨城镇消费，不再执行其他逻辑
        }
      }
    }
    
    let venue: any;
    if (availableVenues.length > 0) {
      // 有"淫乱"特质的人更倾向于去药店购买避孕用品
      let selectedBuilding: Building;
      if (p.hasTrait('promiscuous')) {
        const pharmacy = availableVenues.find(b => b.id === 'pharmacy');
        if (pharmacy && Math.random() < 0.4) {
          // 40%概率选择药店
          selectedBuilding = pharmacy;
        } else {
          // 其他情况随机选择
          selectedBuilding = choose(availableVenues);
        }
      } else {
        selectedBuilding = choose(availableVenues);
      }
      
      venue = {
        id: selectedBuilding.id,
        name: selectedBuilding.name,
        effect: selectedBuilding.effect || 'none',
        price: 0, // 已取消入门费用
        products: selectedBuilding.products || [] // 传递商品列表
      };
    } else {
      venue = { id: '', name: "路边", effect: "none", price: 0, products: [] };
    }

    // A. 建设/工作/打零工/站街 (30%，爱钱的人提高到50%)
    // 特质影响：淫乱特质的居民优先建造神秘洗脚店，喜欢睡觉的居民优先建造快捷酒店
    let pendingBuilding: Building | undefined;
    if (p.hasTrait('promiscuous')) {
      // 优先查找神秘洗脚店
      const footshop = this.state.buildings.find(b => b.id === 'footshop' && !b.isBuilt);
      if (footshop) {
        pendingBuilding = footshop;
      } else {
        // 如果没有洗脚店，再找其他建筑
        pendingBuilding = this.state.buildings.find(b => !b.isBuilt);
      }
    } else if (p.hasTrait('sleepy')) {
      // 喜欢睡觉的居民优先建造快捷酒店
      const hotel = this.state.buildings.find(b => b.id === 'hotel' && !b.isBuilt);
      if (hotel) {
        pendingBuilding = hotel;
      } else {
        // 如果没有快捷酒店，再找其他建筑
        pendingBuilding = this.state.buildings.find(b => !b.isBuilt);
      }
    } else {
      pendingBuilding = this.state.buildings.find(b => !b.isBuilt);
    }
    
    const buildChance = p.hasTrait('money-loving') && pendingBuilding ? 0.5 : 0.3;
    if (roll < buildChance) {
      if (pendingBuilding) {
        this.doBuild(p, pendingBuilding);
      } else if (!p.job) {
        if (p.hasTrait('promiscuous') && Math.random() < 0.6) {
          this.doStreetwalking(p);
        } else {
          this.doOddJob(p);
        }
      } else {
        this.doSocial(p, venue);
      }
    }
    // B. 社交/恋爱 (50%，提高社交频率)
    // 特质影响：社交达人更倾向社交，孤僻的人更倾向独处
    else if (roll < 0.85) { // 从0.8提高到0.85，增加社交概率
      let socialChance = 1.0; // 默认100%进行社交
      if (p.hasTrait('social')) {
        socialChance = 1.2; // 社交达人更倾向社交（即使roll稍高也会社交）
      } else if (p.hasTrait('loner')) {
        socialChance = 0.7; // 孤僻的人从60%提高到70%概率社交
      }
      
      if (Math.random() < socialChance) {
        this.doSocial(p, venue);
      } else {
        // 孤僻的人选择独处
        this.doRest(p, venue);
      }
    }
    // C. 休息 (20%)
    else {
      this.doRest(p, venue);
    }
  }

  // 分配收入：公司账户10%，老板50%，员工40%（所有员工平分，不包括老板）
  distributeRevenue(building: Building, revenue: number) {
    if (building.staff.length === 0) {
      // 没有员工，收入进入镇库
      this.state.townMoney += revenue;
      return;
    }
    
    // 确保收入是整数
    const revenueInt = Math.floor(revenue);
    
    // 公司账户：10%
    const companyShare = Math.floor(revenueInt * 0.1);
    building.companyFunds += companyShare;
    
    // 分配给员工的收入：90%（老板50% + 员工40%）
    const staffTotalIncome = revenueInt - companyShare; // 扣除公司账户后的收入
    building.dailyStaffIncome += staffTotalIncome; // 累计当天员工收入
    
    // 老板：50%（第一个员工是老板）
    const bossShare = Math.floor(revenueInt * 0.5);
    const bossName = building.staff[0];
    const boss = this.state.chars.find(c => c.name === bossName);
    if (boss) {
      boss.money += bossShare;
      boss.incomeStats.work += bossShare;
      boss.incomeStats.total += bossShare;
      // 记录从这个建筑获得的收入
      if (!boss.buildingIncome) {
        boss.buildingIncome = {};
      }
      boss.buildingIncome[building.id] = (boss.buildingIncome[building.id] || 0) + bossShare;
    }
    
    // 员工：40%（所有员工平分，不包括老板）
    const employeeShare = Math.floor(revenueInt * 0.4);
    const employees = building.staff.slice(1); // 排除老板，只计算其他员工
    if (employees.length > 0) {
      const sharePerEmployee = Math.floor(employeeShare / employees.length);
      employees.forEach(staffName => {
        const employee = this.state.chars.find(c => c.name === staffName);
        if (employee) {
          employee.money += sharePerEmployee;
          employee.incomeStats.work += sharePerEmployee;
          employee.incomeStats.total += sharePerEmployee;
          // 记录从这个建筑获得的收入
          if (!employee.buildingIncome) {
            employee.buildingIncome = {};
          }
          employee.buildingIncome[building.id] = (employee.buildingIncome[building.id] || 0) + sharePerEmployee;
        }
      });
    } else {
      // 如果只有老板没有其他员工，40%也归老板
      if (boss) {
        boss.money += employeeShare;
        boss.incomeStats.work += employeeShare;
        boss.incomeStats.total += employeeShare;
        // 记录从这个建筑获得的收入
        if (!boss.buildingIncome) {
          boss.buildingIncome = {};
        }
        boss.buildingIncome[building.id] = (boss.buildingIncome[building.id] || 0) + employeeShare;
      }
    }
  }

  doWork(p: Character, building: Building) {
    // 现在工资直接从收入分配中获得，不再需要单独发放
    // 但工作仍然会消耗心情
    p.happiness -= 1;
    
    // 特性学习机制：没有特性的居民在工作中可能学习特性
    this.tryLearnTrait(p, 'work', building);
    
    // 更新工作满意度（根据心情、工资等因素）
    this.updateJobSatisfaction(p, building);
    
    // 摸鱼判定：喜欢睡觉和懒惰的人会摸鱼，勤奋的人不容易摸鱼
    let isSlacking = false;
    let caughtSlacking = false;
    
    // 勤奋特性：不容易摸鱼（只有5%概率）
    if (p.hasTrait('hardworking')) {
      if (Math.random() < 0.05) {
        isSlacking = true;
      }
    }
    // 懒惰特性：更容易摸鱼（80%概率）
    else if (p.hasTrait('lazy')) {
      if (Math.random() < 0.8) {
        isSlacking = true;
      }
    }
    // 喜欢睡觉的人会摸鱼（70%概率）
    else if (p.hasTrait('sleepy')) {
      if (Math.random() < 0.7) {
        isSlacking = true;
      }
    }
    
    if (isSlacking) {
        // 摸鱼可能被老板发现（30%概率被发现）
        const bossName = building.staff[0]; // 第一个员工是老板
        if (bossName && bossName !== p.name) {
          const boss = this.state.chars.find(c => c.name === bossName);
        if (boss) {
          // 老板发现摸鱼的概率
          let catchChance = 0.3;
          // 机智特质：摸鱼时更难被老板抓到
          if (p.hasTrait('clever')) {
            catchChance *= 0.5; // 机智的人被抓概率降低50%
          }
          if (Math.random() < catchChance) {
              caughtSlacking = true;
              // 摸鱼被抓：心情下降更多
              p.happiness -= 2;
              
              // 记录被抓到摸鱼的次数
              if (!p.slackingOffCount[building.id]) {
                p.slackingOffCount[building.id] = 0;
              }
              p.slackingOffCount[building.id]++;
              
              this.log(`[😴摸鱼被抓] **${p.name}** 在 **${building.name}** 摸鱼被老板 **${bossName}** 发现！`, 'drama');
              
              // 检查是否应该被开除（被抓到3次以上）
              if (p.slackingOffCount[building.id] >= 3) {
                this.fireEmployee(p, building, bossName);
                return; // 被开除了，不再继续工作
              }
            }
          }
        }
      }
    
    // 工作满意度变化：野心勃勃的人满意度下降更快，知足常乐的人下降更慢
    if (!isSlacking || caughtSlacking) {
      // 正常工作或被抓到摸鱼时，满意度变化
      let satisfactionChange = -1; // 默认每次工作-1满意度
      if (p.hasTrait('ambitious')) {
        satisfactionChange = -2; // 野心勃勃的人满意度下降更快
      } else if (p.hasTrait('content')) {
        satisfactionChange = 0; // 知足常乐的人满意度不下降
      } else if (p.hasTrait('hardworking')) {
        satisfactionChange = 0; // 勤奋的人满意度不下降（因为努力工作）
      } else if (p.hasTrait('lazy')) {
        satisfactionChange = -2; // 懒惰的人满意度下降更快
      }
      
      p.jobSatisfaction = Math.max(0, Math.min(100, p.jobSatisfaction + satisfactionChange));
    }
    
    // 检查员工是否想辞职（工作满意度低）
    // 野心勃勃的人对工作满意度要求更高，知足常乐的人更容易满足
    let resignationThreshold = 30; // 默认阈值
    let resignationChance = 0.05; // 默认概率
    
    if (p.hasTrait('ambitious')) {
      resignationThreshold = 50; // 野心勃勃的人满意度要求更高
      resignationChance = 0.08; // 更容易辞职
    } else if (p.hasTrait('content')) {
      resignationThreshold = 20; // 知足常乐的人更容易满足
      resignationChance = 0.02; // 不太容易辞职
    }
    
    if (p.job && p.job.buildingId === building.id && p.jobSatisfaction < resignationThreshold && Math.random() < resignationChance) {
      this.resign(p, building);
      return;
    }
    
    if (isSlacking && !caughtSlacking) {
      p.currentAction = `[😴摸鱼] 在 ${building.name} 当${p.job!.role}（偷懒中）`;
    } else {
      p.currentAction = `[打工] 在 ${building.name} 当${p.job!.role}`;
    }
  }
  
  // 更新工作满意度
  updateJobSatisfaction(p: Character, building: Building) {
    if (!p.job || p.job.buildingId !== building.id) return;
    
    let satisfaction = p.jobSatisfaction;
    
    // 心情影响满意度（心情高则满意度上升，心情低则下降）
    if (p.happiness > 70) {
      satisfaction += 0.5;
    } else if (p.happiness < 40) {
      satisfaction -= 1;
    }
    
    // 工资影响满意度（根据工作收入统计）
    const workIncome = p.incomeStats?.work || 0;
    const daysWorked = this.state.totalDaysPassed || 1;
    const avgDailySalary = daysWorked > 0 ? workIncome / daysWorked : 0;
    
    // 如果平均日薪低于基础工资，满意度下降
    if (avgDailySalary < building.baseSalary) {
      satisfaction -= 0.5;
    } else if (avgDailySalary > building.baseSalary * 1.5) {
      satisfaction += 0.3;
    }
    
    // 被抓到摸鱼会降低满意度
    const slackCount = p.slackingOffCount[building.id] || 0;
    if (slackCount > 0) {
      satisfaction -= slackCount * 2;
    }
    
    // 限制满意度范围
    p.jobSatisfaction = Math.max(0, Math.min(100, satisfaction));
  }
  
  // 开除员工
  fireEmployee(employee: Character, building: Building, bossName: string) {
    if (!employee.job || employee.job.buildingId !== building.id) return;
    
    // 移除员工
    const staffIndex = building.staff.indexOf(employee.name);
    if (staffIndex !== -1) {
      building.staff.splice(staffIndex, 1);
    }
    
    // 清除员工的工作
    employee.job = null;
    employee.currentAction = "失业中（冷静期）";
    
    // 设置辞职冷静期（5天，和主动辞职一样）
    const cooldownDays = 5;
    const cooldownMinutes = cooldownDays * 24 * 60;
    employee.resignationCooldown = this.getAbsoluteTime() + cooldownMinutes;
    employee.lastResignedBuilding = building.id;
    employee.lastResignedTime = this.getAbsoluteTime();
    
    // 清除摸鱼记录
    delete employee.slackingOffCount[building.id];
    
    this.log(`[💼开除] **${bossName}** 开除了 **${employee.name}**，因为他在 **${building.name}** 多次摸鱼被抓！**${employee.name}** 进入5天冷静期，期间不能工作。`, 'drama');
    
    // 自动招聘新员工
    this.hireNewEmployee(building);
    
    // 自动保存
    this.autoSave();
  }
  
  // 员工辞职
  resign(employee: Character, building: Building) {
    if (!employee.job || employee.job.buildingId !== building.id) return;
    
    const role = employee.job.role;
    
    // 移除员工
    const staffIndex = building.staff.indexOf(employee.name);
    if (staffIndex !== -1) {
      building.staff.splice(staffIndex, 1);
    }
    
    // 记录辞职信息
    const currentTime = this.getAbsoluteTime();
    employee.lastResignedBuilding = building.id;
    employee.lastResignedTime = currentTime;
    // 设置5天冷静期（5 * 1440 = 7200 分钟）
    employee.resignationCooldown = currentTime + (5 * 1440);
    
    // 清除员工的工作
    employee.job = null;
    employee.currentAction = "失业中（冷静期）";
    employee.jobSatisfaction = 70; // 重置满意度
    
    // 清除摸鱼记录
    delete employee.slackingOffCount[building.id];
    
    this.log(`[💼辞职] **${employee.name}** 对 **${building.name}** 的 **${role}** 工作不满意，主动辞职了！需要5天冷静期。`, 'event');
    
    // 自动招聘新员工
    this.hireNewEmployee(building);
    
    // 自动保存
    this.autoSave();
  }
  
  // 自动招聘新员工
  hireNewEmployee(building: Building) {
    if (!building.isBuilt || building.jobs.length === 0) return;
    
    // 检查是否有空缺职位
    const vacancies = building.jobs.length - building.staff.length;
    if (vacancies <= 0) return;
    
    // 找到老板
    const bossName = building.staff[0];
    if (!bossName) return; // 没有老板，无法招聘
    
    const boss = this.state.chars.find(c => c.name === bossName);
    if (!boss) return;
    
    // 寻找合适的候选人（无工作的居民，不在冷静期，一个月内不能回到原岗位）
    const candidates = this.state.chars.filter(c => {
      if (c.job) return false; // 有工作的不能应聘
      if (c.prostitute) return false; // 卖银者不能应聘
      
      // 检查是否在辞职冷静期内（5天内不能工作）
      if (c.resignationCooldown && this.getAbsoluteTime() < c.resignationCooldown) {
        return false; // 还在冷静期
      }
      
      // 检查是否在一个月内不能回到原岗位（30 * 1440 = 43200 分钟）
      if (c.lastResignedBuilding === building.id && c.lastResignedTime) {
        const oneMonthInMinutes = 30 * 1440;
        if (this.getAbsoluteTime() < c.lastResignedTime + oneMonthInMinutes) {
          return false; // 一个月内不能回到原岗位
        }
      }
      
      return true;
    });
    
    if (candidates.length === 0) {
      this.log(`[💼招聘] **${building.name}** 需要招聘，但目前没有合适的候选人。`, 'info');
      return;
    }
    
    // 随机选择一个候选人
    const newEmployee = choose(candidates);
    
    // 确定职位（按顺序填补空缺）
    const roleIndex = building.staff.length; // 当前员工数量就是下一个职位的索引
    if (roleIndex >= building.jobs.length) return; // 职位已满
    
    const role = building.jobs[roleIndex];
    
    // 分配工作
    newEmployee.job = {
      buildingId: building.id,
      role: role
    };
    
    building.staff.push(newEmployee.name);
    
    // 初始化工作满意度
    newEmployee.jobSatisfaction = 70;
    
    // 初始化摸鱼记录
    if (!newEmployee.slackingOffCount[building.id]) {
      newEmployee.slackingOffCount[building.id] = 0;
    }
    
    this.log(`[💼招聘] **${bossName}** 在 **${building.name}** 招聘了 **${newEmployee.name}** 担任 **${role}**！`, 'event');
    
    // 自动保存
    this.autoSave();
  }

  doOddJob(p: Character) {
    const income = 4;
    p.money += income;
    p.happiness -= 3;
    const jobs = ["搬砖", "发传单", "送外卖", "通下水道", "洗盘子"];
    const jobName = choose(jobs);
    p.currentAction = `[零工] 辛苦${jobName}中...`;
    p.incomeStats.oddJob += income;
    p.incomeStats.total += income;
  }

  doStreetwalking(p: Character) {
    // 年龄限制：1到17岁不可以站街
    if (p.age >= 1 && p.age <= 17) {
      p.currentAction = "未成年（不能站街）";
      this.doRest(p, { name: "路边", effect: "none", price: 0 });
      return;
    }
    const income = rand(8, 15);
    p.money += income;
    p.happiness -= 4;
    p.currentAction = `[💋站街] 在路边拉客...`;
    p.incomeStats.streetwalking += income;
    p.incomeStats.total += income;
  }

  doBuild(p: Character, building: Building) {
    // 特性学习机制：没有特性的居民在建设中可能学习特性
    this.tryLearnTrait(p, 'build', building);
    
    // 基础工作功率
    let workPower = rand(5, 15);
    
    // 特质影响：勤奋的人工作更努力，懒惰和喜欢睡觉的人工作功率减少
    if (p.hasTrait('hardworking')) {
      // 勤奋：工作功率增加30%
      workPower = Math.floor(workPower * 1.3);
    } else if (p.hasTrait('lazy')) {
      // 懒惰：工作功率减少40%
      workPower = Math.floor(workPower * 0.6);
    } else if (p.hasTrait('sleepy')) {
      // 喜欢睡觉：工作功率减少30%
      workPower = Math.floor(workPower * 0.7);
    }
    
    // 特质影响：建设喜爱的建筑时更快且贡献更多
    const isFavoriteBuilding = this.isFavoriteBuilding(p, building);
    if (isFavoriteBuilding) {
      workPower = Math.floor(workPower * 1.5); // 增加50%的工作功率
    }
    
    // 特性影响：勤奋的人在建设时工作功率更高
    if (p.hasTrait('hardworking')) {
      workPower = Math.floor(workPower * 1.2); // 勤奋特性额外+20%工作功率
    }
    
    building.currentProgress += workPower;
    const subsidy = 5;
    p.money += subsidy;
    
    // 性格影响心情消耗
    const happinessChange = this.getConstructionHappinessChange(p);
    p.happiness = Math.max(0, p.happiness + happinessChange);
    
    p.currentAction = `建设: ${building.name}`;
    
    if (!p.constructionContribution[building.id]) {
      p.constructionContribution[building.id] = 0;
    }
    
    // 特性影响：建设喜爱的建筑时贡献值更多
    const contributionBonus = isFavoriteBuilding ? Math.floor(workPower * 0.3) : 0;
    p.constructionContribution[building.id] += workPower + contributionBonus;
    p.incomeStats.construction += subsidy;
    p.incomeStats.total += subsidy;
    
    if (building.currentProgress >= building.totalCost && !building.isBuilt) {
      building.isBuilt = true;
      this.log(`[🔨竣工] 喜讯！在大家的努力下，**${building.name}** 终于建成了！`, 'build');
      // 分发建设奖励
      this.distributeConstructionReward(building);
    }
  }

  // 判断是否是居民喜爱的建筑
  isFavoriteBuilding(p: Character, building: Building): boolean {
    // 淫乱特性的居民优先建造神秘洗脚店
    if (p.hasTrait('promiscuous') && building.id === 'footshop') {
      return true;
    }
    // 喜欢睡觉的居民喜爱快捷酒店
    if (p.hasTrait('sleepy') && building.id === 'hotel') {
      return true;
    }
    // 可以扩展其他特性对应的建筑偏好
    return false;
  }

  // 根据性格计算建设时的心情变化
  getConstructionHappinessChange(p: Character): number {
    const personality = p.personality;
    const chaosBonus = personality.chaosBonus || 0;
    
    // 急躁性格（易怒、刻薄等）：心情消耗更多
    // chaosBonus > 0 表示更容易产生冲突，属于急躁性格
    if (chaosBonus > 0.1) {
      // 易怒、刻薄等：-3 到 -4
      return -rand(3, 4);
    } else if (chaosBonus > 0) {
      // 内向、严肃等：-2 到 -3
      return -rand(2, 3);
    }
    // 稳健性格（沉着、温柔等）：心情消耗更少
    // chaosBonus < 0 表示不容易产生冲突，属于稳健性格
    else if (chaosBonus < -0.1) {
      // 沉着、温柔、开朗、幽默等：-1 到 0
      return -rand(0, 1);
    }
    // 中性性格：默认消耗
    else {
      return -2;
    }
  }

  distributeConstructionReward(building: Building) {
    let totalContribution = 0;
    this.state.chars.forEach(c => {
      if (c.constructionContribution[building.id]) {
        totalContribution += c.constructionContribution[building.id];
      }
    });
    
    if (totalContribution === 0) return;
    
    const totalReward = Math.floor(building.totalCost * 0.3);
    this.state.chars.forEach(c => {
      const contribution = c.constructionContribution[building.id] || 0;
      if (contribution > 0) {
        const percentage = contribution / totalContribution;
        const reward = Math.floor(totalReward * percentage);
        c.money += reward;
        if (reward > 0) {
          this.log(`[💰奖励] **${c.name}** 因建设 **${building.name}** 获得奖励 💰${reward}！`, 'build');
        }
      }
    });
  }

  // 检查并自动升级建筑（当公司账户资金足够时）
  checkAutoUpgrade() {
    this.state.buildings.forEach(building => {
      if (!building.isBuilt || building.staff.length === 0) return;
      
      // 计算升级费用
      const upgradeCost = Math.floor(building.totalCost * 0.5 * building.level);
      
      // 如果公司账户资金足够升级费用，自动升级
      if (building.companyFunds >= upgradeCost) {
        this.upgradeBuilding(building, true); // true 表示自动升级
      }
    });
  }

  // 升级建筑（使用公司账户资金）
  upgradeBuilding(building: Building, isAuto: boolean = false): boolean {
    if (!building.isBuilt) {
      if (!isAuto) {
        this.log('❌ 建筑尚未建成，无法升级！', 'error');
      }
      return false;
    }

    // 计算升级费用（基于建筑原始成本和当前等级）
    const upgradeCost = Math.floor(building.totalCost * 0.5 * building.level);
    
    if (building.companyFunds < upgradeCost) {
      if (!isAuto) {
        this.log(`❌ **${building.name}** 公司账户资金不足（需要 💰${upgradeCost}，当前 💰${building.companyFunds}）！`, 'error');
      }
      return false;
    }

    // 扣除升级费用
    building.companyFunds -= upgradeCost;
    
    // 升级建筑
    building.level += 1;
    
    // 提高基础工资（每级增加20%）
    building.baseSalary = Math.floor(10 * (1 + (building.level - 1) * 0.2));
    
    if (isAuto) {
      this.log(`[⬆️自动升级] **${building.name}** 公司账户资金充足，自动升级到 ${building.level} 级！基础工资提升至 💰${building.baseSalary}/次`, 'build');
    } else {
      this.log(`[⬆️升级] **${building.name}** 升级到 ${building.level} 级！基础工资提升至 💰${building.baseSalary}/次`, 'build');
    }
    
    // 自动保存
    this.autoSave();
    
    return true;
  }

  doRest(p: Character, venue: any) {
    // 特性学习机制：没有特性的居民在休息中可能学习特性
    this.tryLearnTrait(p, 'rest', venue);
    
    // 如果是在睡觉，记录睡觉时间
    if (p.currentAction.includes('睡觉') || venue.name.includes('酒店')) {
      p.totalSleepTime = (p.totalSleepTime || 0) + (10 / 60); // 每次约 10 分钟
    }
    let recovery = rand(5, 10);
    if (venue.effect === 'fun') recovery += 10;
    
    // 选择并购买商品（如果有商品）
    const products = venue.products || [];
    if (products.length > 0) {
      // 选择商品（根据性格和特性影响选择）
      let selectedProduct = this.chooseProduct(p, products);
      
      if (selectedProduct) {
        // 特性影响：爱钱和小气的人消费更谨慎，大方的人更舍得花钱
        let requiredMultiplier = 1.0;
        if (p.hasTrait('money-loving') || p.hasTrait('stingy')) {
          requiredMultiplier = 1.5; // 需要1.5倍的钱才愿意消费
        } else if (p.hasTrait('generous')) {
          requiredMultiplier = 0.7; // 大方的人只需要70%的钱就愿意消费
        }
        
        const productPrice = Math.floor(selectedProduct.price); // 确保价格是整数
        const requiredMoney = Math.floor(productPrice * requiredMultiplier);
        if (p.money >= requiredMoney) {
          p.money -= productPrice;
          
          // 分配顾客消费收入
          if (venue.id) {
            const building = this.state.buildings.find(b => b.id === venue.id);
            if (building && building.isBuilt && building.staff.length > 0) {
              // 有员工的建筑：按比例分配收入
              this.distributeRevenue(building, productPrice);
              building.totalRevenue += productPrice;
            } else {
              // 没有员工的建筑（如公园）：消费进入镇库
              this.state.townMoney += productPrice;
              if (building) {
                building.totalRevenue += productPrice;
              }
            }
          } else {
            // 没有建筑ID（如路边）：消费进入镇库
            this.state.townMoney += productPrice;
          }
          
          p.currentAction = `在 ${venue.name} 消费了${selectedProduct.name}`;
        } else {
          p.currentAction = `在 ${venue.name} 闲逛（舍不得花钱）`;
          return;
        }
      } else {
        // 没有选择商品（可能因为太贵）
        p.currentAction = `在 ${venue.name} 闲逛`;
      }
    } else {
      // 没有商品的场所（如公园）
      p.currentAction = `在 ${venue.name} 放松`;
    }
    
    p.happiness = Math.min(100, p.happiness + recovery);
  }
  
  // 选择商品（根据性格和特性影响选择）
  chooseProduct(p: Character, products: any[]): any | null {
    if (products.length === 0) return null;
    
    // 过滤出能买得起的商品
    const affordableProducts = products.filter(prod => p.money >= prod.price);
    if (affordableProducts.length === 0) return null;
    
    // 特性影响：淫乱特质的人在药店更倾向于购买避孕用品
    // 检查是否在药店（通过商品ID判断）
    const isPharmacy = affordableProducts.some(prod => 
      prod.id === 'birth_control_pills' || 
      prod.id === 'contraceptive_patch' || 
      prod.id === 'condoms'
    );
    
    if (isPharmacy && p.hasTrait('promiscuous')) {
      // 有"淫乱"特质的人在药店：80%概率购买避孕用品
      if (Math.random() < 0.8) {
        // 优先选择避孕用品
        const contraceptives = affordableProducts.filter(prod => 
          prod.id === 'birth_control_pills' || 
          prod.id === 'contraceptive_patch' || 
          prod.id === 'condoms'
        );
        if (contraceptives.length > 0) {
          // 优先选择最便宜的避孕用品（更实用）
          const cheapest = contraceptives.reduce((min, prod) => 
            prod.price < min.price ? prod : min
          );
          return cheapest;
        }
      }
    }
    
    // 特性影响：爱钱和小气的人倾向于选择便宜的商品
    if (p.hasTrait('money-loving') || p.hasTrait('stingy')) {
      // 优先选择最便宜的商品
      const cheapest = affordableProducts.reduce((min, prod) => 
        prod.price < min.price ? prod : min
      );
      return cheapest;
    }
    
    // 特性影响：大方的人倾向于选择贵的商品
    if (p.hasTrait('generous')) {
      // 优先选择最贵的商品
      const mostExpensive = affordableProducts.reduce((max, prod) => 
        prod.price > max.price ? prod : max
      );
      return mostExpensive;
    }
    
    // 默认随机选择
    return choose(affordableProducts);
  }

  doSocial(p: Character, venue: any) {
    // 年龄限制：1到17岁不可以喝酒也不可以去买银
    if (p.age >= 1 && p.age <= 17) {
      // 检查是否在酒吧或洗脚店
      if (venue.id === 'bar' || venue.id === 'footshop') {
        p.currentAction = `在 ${venue.name} 外（未成年禁止入内）`;
        this.doRest(p, { id: '', name: "路边", effect: "none", price: 0, products: [] });
        return;
      }
    }
    
    // 教堂门槛费检查
    if (venue.id === 'church') {
      const church = this.state.buildings.find(b => b.id === 'church' && b.isBuilt);
      if (church) {
        // 检查是否是等级结婚（已经有partner且关系是spouse或lover）
        const isGettingMarried = p.partner && 
          (p.relationships[p.partner]?.status === 'spouse' || 
           p.relationships[p.partner]?.status === 'lover');
        
        if (isGettingMarried) {
          // 等级结婚：需要办理结婚费用300元
          const marriageFee = 300;
          if (p.money >= marriageFee) {
            p.money -= marriageFee;
            
            // 分配收入：神父获得90%，10%用来升级教堂
            if (church.staff.length > 0) {
              const priestName = church.staff[0];
              const priest = this.state.chars.find(c => c.name === priestName);
              if (priest) {
                const priestIncome = Math.floor(marriageFee * 0.9);
                priest.money += priestIncome;
                priest.incomeStats.work += priestIncome;
                priest.incomeStats.total += priestIncome;
                if (!priest.buildingIncome) {
                  priest.buildingIncome = {};
                }
                priest.buildingIncome[church.id] = (priest.buildingIncome[church.id] || 0) + priestIncome;
              }
            }
            
            // 10%用来升级教堂
            const upgradeFund = Math.floor(marriageFee * 0.1);
            church.companyFunds += upgradeFund;
            church.totalRevenue += marriageFee;
            
            this.log(`[💒结婚费用] **${p.name}** 在教堂办理结婚手续，支付了 💰${marriageFee}元（神父获得90%，10%用于升级教堂）`, 'event');
          } else {
            // 没钱办理结婚，不能进入
            p.currentAction = `在 ${venue.name} 外（没钱办理结婚手续）`;
            this.doRest(p, { id: '', name: "路边", effect: "none", price: 0, products: [] });
            return;
          }
        } else {
          // 普通进入：需要200元门槛费
          const entranceFee = 200;
          if (p.money >= entranceFee) {
            p.money -= entranceFee;
            
            // 分配收入：神父获得90%，10%用来升级教堂
            if (church.staff.length > 0) {
              const priestName = church.staff[0];
              const priest = this.state.chars.find(c => c.name === priestName);
              if (priest) {
                const priestIncome = Math.floor(entranceFee * 0.9);
                priest.money += priestIncome;
                priest.incomeStats.work += priestIncome;
                priest.incomeStats.total += priestIncome;
                if (!priest.buildingIncome) {
                  priest.buildingIncome = {};
                }
                priest.buildingIncome[church.id] = (priest.buildingIncome[church.id] || 0) + priestIncome;
              }
            }
            
            // 10%用来升级教堂
            const upgradeFund = Math.floor(entranceFee * 0.1);
            church.companyFunds += upgradeFund;
            church.totalRevenue += entranceFee;
            
            this.log(`[💒门槛费] **${p.name}** 进入教堂，支付了 💰${entranceFee}元门槛费（神父获得90%，10%用于升级教堂）`, 'event');
          } else {
            // 没钱支付门槛费，不能进入
            p.currentAction = `在 ${venue.name} 外（没钱支付门槛费）`;
            this.doRest(p, { id: '', name: "路边", effect: "none", price: 0, products: [] });
            return;
          }
        }
      }
    }
    
    // 特质学习机制：没有特质的居民在社交中可能学习特质
    this.tryLearnTrait(p, 'social', venue);
    
    // 检查是否已经喝晕（如果已经喝晕，只处理喝晕事件，不进行其他活动）
    if (p.isDrunk && p.drunkEndTime && this.getAbsoluteTime() < p.drunkEndTime) {
      // 还在喝晕状态，处理喝晕事件
      this.handleDrunkEvent(p);
      return;
    } else if (p.isDrunk) {
      // 喝晕状态已结束
      p.isDrunk = false;
      p.drunkEndTime = undefined;
    }
    
    // 选择并购买商品（如果有商品）
    // 注意：即使后续会喝晕，也要先购买商品并分配收入
    const products = venue.products || [];
    if (products.length > 0) {
      // 选择商品（根据性格和特性影响选择）
      let selectedProduct = this.chooseProduct(p, products);
      
      if (selectedProduct) {
        // 特性影响：爱钱和小气的人消费更谨慎，大方的人更舍得花钱
        let requiredMultiplier = 1.0;
        if (p.hasTrait('money-loving') || p.hasTrait('stingy')) {
          requiredMultiplier = 1.5; // 需要1.5倍的钱才愿意消费
        } else if (p.hasTrait('generous')) {
          requiredMultiplier = 0.7; // 大方的人只需要70%的钱就愿意消费
        }
        
        const productPrice = Math.floor(selectedProduct.price); // 确保价格是整数
        const requiredMoney = Math.floor(productPrice * requiredMultiplier);
        if (p.money < requiredMoney) {
          this.doRest(p, { id: '', name: "路边", effect: "none", price: 0, products: [] });
          return;
        }
        
        // 先扣除费用
        p.money -= productPrice;
        
        // 立即分配顾客消费收入（在检查喝晕之前，确保收入被分配）
        if (venue.id) {
          const building = this.state.buildings.find(b => b.id === venue.id);
          if (building && building.isBuilt) {
            if (building.staff.length > 0) {
              // 有员工的建筑：按比例分配收入
              this.distributeRevenue(building, productPrice);
            } else {
              // 没有员工的建筑（如公园）：消费进入镇库
              this.state.townMoney += productPrice;
            }
            building.totalRevenue += productPrice;
          } else {
            // 建筑不存在：消费进入镇库
            this.state.townMoney += productPrice;
          }
        } else {
          // 没有建筑ID：消费进入镇库
          this.state.townMoney += productPrice;
        }
        
        // 药店购买避孕用品：增加避孕用品数量
        if (venue.id === 'pharmacy' && selectedProduct.id) {
          if (selectedProduct.id === 'birth_control_pills') {
            p.contraceptives += 20; // 一盒20个
          } else if (selectedProduct.id === 'contraceptive_patch') {
            p.contraceptives += 1; // 一个
          } else if (selectedProduct.id === 'condoms') {
            p.contraceptives += 12; // 一盒12个
          }
        }
        
        // 酒吧喝酒事件：如果是在酒吧喝酒，检查是否喝晕（在收入分配之后）
        if (venue.id === 'bar' && (selectedProduct.id.includes('beer') || selectedProduct.id.includes('gin_tonic') || selectedProduct.id.includes('cuba_libre'))) {
          this.checkDrunk(p, selectedProduct);
        }
      } else {
        // 没有选择商品（可能因为太贵），转为休息
        this.doRest(p, { id: '', name: "路边", effect: "none", price: 0, products: [] });
        return;
      }
    }

    const targets = this.state.chars.filter(c => c.name !== p.name);
    if (targets.length === 0) {
      p.currentAction = `在 ${venue.name} 独自一人`;
      return;
    }

    const t = choose(targets);
    if (!p.relationships[t.name]) {
      p.relationships[t.name] = { love: 0, status: 'stranger' };
    }
    if (!t.relationships[p.name]) {
      t.relationships[p.name] = { love: 0, status: 'stranger' };
    }

    const pRel = p.relationships[t.name];
    const tRel = t.relationships[p.name];

    p.currentAction = `和 ${t.name} 在 ${venue.name}`;
    t.currentAction = `和 ${p.name} 在 ${venue.name}`;
    p.interactingWith = t.name;
    t.interactingWith = p.name;

    const pPersonality = p.personality;
    const tPersonality = t.personality;
    const chaosFactor = (pPersonality.chaosBonus || 0) + (tPersonality.chaosBonus || 0);

    // 先检查浪漫事件（表白、求婚、小三关系、酒店交欢等）
    const isRomance = this.checkRomanceEvent(p, t, pRel, tRel, venue);
    if (isRomance) return; // 如果发生了重大事件，跳过普通聊天

    // 普通互动
    // 降低吵架频率：基础概率从0.1降到0.03
    const fightChance = Math.max(0, Math.min(1, 0.03 + chaosFactor * 0.3));
    if (Math.random() < fightChance) {
      // 吵架
      pRel.love = Math.max(0, pRel.love - 5);
      tRel.love = Math.max(0, tRel.love - 5);
      // 记录吵架次数（主动发起的一方）
      if (pPersonality.chaosBonus > tPersonality.chaosBonus) {
        p.fightCount = (p.fightCount || 0) + 1;
      } else {
        t.fightCount = (t.fightCount || 0) + 1;
      }
      const reason = pPersonality.name === "易怒" || tPersonality.name === "易怒" 
        ? `（${pPersonality.name === "易怒" ? p.name : t.name}的暴脾气）` 
        : "";
      this.log(`[💢争吵] ${p.name} 和 ${t.name} 在 ${venue.name} 吵了一架${reason}。`, 'reject');
    } else {
      // 增进感情（提高好感度提升幅度）
      let boost = rand(2, 5); // 从1-3提高到2-5，增加基础好感度提升
      if (venue.effect === 'romance') boost += 3; // 浪漫场所额外加成从+2提高到+3
      if (venue.effect === 'chaos' || venue.effect === 'ntr') boost += 2; // 刺激场所加成从+1提高到+2
      
      // 特性影响：社交达人更容易交朋友，孤僻的人好感度提升较慢
      if (p.hasTrait('social') || t.hasTrait('social')) {
        boost += 3; // 社交达人额外加成从+2提高到+3
      }
      if (p.hasTrait('loner') || t.hasTrait('loner')) {
        boost = Math.floor(boost * 0.8); // 孤僻的人好感度提升减少从30%改为20%
      }
      
      // 特性影响：浪漫特性在浪漫场所额外加成
      if (venue.effect === 'romance' && (p.hasTrait('romantic') || t.hasTrait('romantic'))) {
        boost += 4; // 浪漫特性在浪漫场所额外加成从+3提高到+4
      }
      
      // 性格加成：双方性格的loveGain叠加（增强影响）
      boost += (pPersonality.loveGain || 0) * 2 + (tPersonality.loveGain || 0) * 2; // 性格影响翻倍
      boost = Math.max(0, Math.round(boost));
      
      // 如果已经是朋友或更高关系，好感度提升更快
      if (pRel.status !== 'stranger') {
        boost = Math.floor(boost * 1.3); // 朋友关系提升从20%提高到30%
      }
      
      // 陌生人之间互动也能提升好感度（即使好感度为0）
      if (pRel.status === 'stranger' && pRel.love === 0) {
        pRel.love = 1; // 初次互动至少建立1点好感度
        tRel.love = 1;
      }
      
      pRel.love = Math.min(100, pRel.love + boost);
      tRel.love = Math.min(100, tRel.love + boost);

      // 关系升级逻辑
      this.updateRelationshipStatus(p, t, pRel, tRel);
    }
  }
  
  // 检查是否喝晕（酒吧喝酒时）
  checkDrunk(p: Character, product: any) {
    // 计算喝晕概率
    // 基础概率：根据酒量，酒量越低越容易喝晕
    let drunkChance = (100 - p.alcoholTolerance) / 100; // 酒量30时概率70%，酒量90时概率10%
    
    // 鸡尾酒更容易喝晕（金汤力、古巴达）
    if (product.id === 'gin_tonic' || product.id === 'cuba_libre') {
      drunkChance *= 1.5; // 鸡尾酒概率增加50%
    }
    
    // 性格影响：冲动的人更容易喝多
    if (p.personality.name === '冲动') {
      drunkChance *= 1.3;
    }
    // 性格影响：理性的人更不容易喝多
    if (p.personality.name === '理性') {
      drunkChance *= 0.7;
    }
    
    // 特质影响：保守的人不太容易喝多
    if (p.hasTrait('conservative')) {
      drunkChance *= 0.8;
    }
    
    // 特质影响：胆小的人通常不会喝晕
    if (p.hasTrait('coward')) {
      drunkChance *= 0.3; // 胆小的人喝晕概率大幅降低
    }
    
    // 随机波动
    drunkChance += (Math.random() - 0.5) * 0.2; // ±10%波动
    drunkChance = Math.max(0, Math.min(1, drunkChance)); // 限制在0-1之间
    
    if (Math.random() < drunkChance) {
      // 喝晕了
      p.isDrunk = true;
      // 喝晕持续时间：60-180分钟
      const drunkDuration = rand(60, 180);
      p.drunkEndTime = this.getAbsoluteTime() + drunkDuration;
      p.currentAction = '🍺 喝晕了';
      this.log(`[🍺喝晕] **${p.name}** 在酒吧喝多了，已经晕了...`, 'drama');
      
      // 立即处理喝晕事件
      this.handleDrunkEvent(p);
    }
  }
  
  // 处理喝晕事件
  handleDrunkEvent(p: Character) {
    if (!p.isDrunk) return;
    
    // 检查是否还在喝晕状态
    if (p.drunkEndTime && this.getAbsoluteTime() >= p.drunkEndTime) {
      // 喝晕状态结束
      p.isDrunk = false;
      p.drunkEndTime = undefined;
      p.currentAction = '发呆';
      
      // 如果还在酒店，清除酒店状态
      if (p.isInHotel) {
        if (p.hotelWith) {
          const hotelPartner = this.state.chars.find(x => x.name === p.hotelWith);
          if (hotelPartner && hotelPartner.isInHotel && hotelPartner.hotelWith === p.name) {
            hotelPartner.isInHotel = false;
            hotelPartner.hotelWith = undefined;
            hotelPartner.currentAction = '发呆';
          }
        }
        p.isInHotel = false;
        p.hotelWith = undefined;
      }
      
      this.log(`[✅清醒] **${p.name}** 酒醒了，恢复了意识。`, 'event');
      return;
    }
    
    // 处理喝晕后的情况
    // 如果已经在酒店开房，不能再被其他人带走
    if (p.isInHotel) {
      // 已经在酒店，不再处理
      return;
    }
    
    // 如果睡在马路上，可以被其他人带回家或带去开房
    if (p.currentAction.includes('睡在马路上')) {
      // 睡在马路上，可以被其他人带走
      const availableChars = this.state.chars.filter(c => 
        c.name !== p.name && 
        !c.isDrunk && 
        !c.interactingWith &&
        !c.isInHotel // 已经在酒店的人不能带走别人
      );
      
      if (availableChars.length > 0 && Math.random() < 0.5) {
        // 50%概率被其他人带走
        const taker = choose(availableChars);
        this.takeDrunkHomeOrHotel(p, taker);
        return;
      }
      // 继续睡在马路上
      return;
    }
    
    // 如果已经被带回家，不能再被其他人带走
    if (p.interactingWith && p.currentAction.includes('被') && p.currentAction.includes('带回家')) {
      // 已经被带回家，不再处理
      return;
    }
    
    // 刚喝晕：70%概率被其他人带走开房或回家，30%概率睡在马路上
    if (Math.random() < 0.7) {
      // 被其他人带走开房或回家
      const availableChars = this.state.chars.filter(c => 
        c.name !== p.name && 
        !c.isDrunk && 
        !c.interactingWith &&
        !c.isInHotel && // 已经在酒店的人不能带走别人
        !p.interactingWith // 如果已经被其他人带走，不能再被带走
      );
      
      if (availableChars.length > 0) {
        const taker = choose(availableChars);
        this.takeDrunkHomeOrHotel(p, taker);
      } else {
        // 没有其他人，睡在马路上
        this.handleSleepOnStreet(p);
      }
    } else {
      // 睡在马路上
      this.handleSleepOnStreet(p);
    }
  }
  
  // 带喝晕的人回家或去酒店
  takeDrunkHomeOrHotel(p: Character, taker: Character) {
    // 如果已经在酒店，不能再被带走
    if (p.isInHotel || taker.isInHotel) {
      return;
    }
    
    // 如果已经被其他人带回家，不能再被带走
    if (p.interactingWith && p.interactingWith !== taker.name && p.currentAction.includes('被') && p.currentAction.includes('带回家')) {
      return;
    }
    
    // 建立关系（如果还没有）
    if (!p.relationships[taker.name]) {
      p.relationships[taker.name] = { love: 0, status: 'stranger' };
    }
    if (!taker.relationships[p.name]) {
      taker.relationships[p.name] = { love: 0, status: 'stranger' };
    }
    
    const pRel = p.relationships[taker.name];
    const tRel = taker.relationships[p.name];
    
    // 增加好感度（被带走的人对带走的人好感度增加）
    pRel.love = Math.min(100, pRel.love + rand(5, 15));
    tRel.love = Math.min(100, tRel.love + rand(3, 10));
    
    // 更新关系状态
    if (pRel.status === 'stranger' && pRel.love > 10) {
      pRel.status = 'friend';
      tRel.status = 'friend';
    }
    
    // 决定是带回家还是去酒店开房
    const hotel = this.state.buildings.find(b => b.id === 'hotel' && b.isBuilt);
    const canGoToHotel = hotel && hotel.isOpen(Math.floor(this.state.gameTime / 60), this.state.gameDay);
    
    // 如果有酒店且有钱，60%概率去酒店，40%概率带回家
    // 如果没有酒店或没钱，100%带回家
    let goToHotel = false;
    if (canGoToHotel) {
      const rooms = hotel!.products || [];
      if (rooms.length > 0) {
        const affordableRooms = rooms.filter(r => taker.money >= r.price);
        if (affordableRooms.length > 0 && Math.random() < 0.6) {
          goToHotel = true;
        }
      }
    }
    
    if (goToHotel) {
      // 去酒店开房
      const rooms = hotel!.products || [];
      const affordableRooms = rooms.filter(r => taker.money >= r.price);
      const selectedRoom = choose(affordableRooms);
      const roomPrice = Math.floor(selectedRoom.price);
      taker.money -= roomPrice;
      
      // 分配收入
      if (hotel!.staff.length > 0) {
        this.distributeRevenue(hotel!, roomPrice);
        hotel!.totalRevenue += roomPrice;
      }
      
      // 设置酒店状态
      p.isInHotel = true;
      p.hotelWith = taker.name;
      taker.isInHotel = true;
      taker.hotelWith = p.name;
      
      // 可能发生关系（根据性格和特质）
      let intimacyChance = 0.3; // 基础概率30%
      if (p.hasTrait('promiscuous') || taker.hasTrait('promiscuous')) {
        intimacyChance = 0.6; // 淫乱特质概率更高
      }
      // 胆小特质大幅降低概率（抗拒酒店挨操）
      if (p.hasTrait('coward') || taker.hasTrait('coward')) {
        intimacyChance *= 0.2; // 胆小的人抗拒酒店，概率大幅降低
      }
      if (pRel.love > 50) {
        intimacyChance += 0.2; // 好感度高概率更高
      }
      
      if (Math.random() < intimacyChance) {
        // 发生关系
        p.sexCount = (p.sexCount || 0) + 1;
        taker.sexCount = (taker.sexCount || 0) + 1;
        p.happiness = Math.min(100, p.happiness + rand(10, 20));
        taker.happiness = Math.min(100, taker.happiness + rand(8, 15));
        
        // 被发生方非淫乱特质发生关系会降低发生者的好感
        if (!p.hasTrait('promiscuous')) {
          // 非淫乱特质：降低发生者的好感
          tRel.love = Math.max(0, tRel.love - rand(10, 20));
          pRel.love = Math.min(100, pRel.love + rand(3, 8)); // 被发生方可能稍微增加好感（因为被照顾）
          this.log(`[💔开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}，并发生了关系，但 **${p.name}** 对此感到不满，**${taker.name}** 的好感度下降了。`, 'drama');
        } else {
          // 淫乱特质：有小的概率降低对方的好感，也有概率发展成炮友
          if (Math.random() < 0.3) {
            // 30%概率降低对方的好感
            tRel.love = Math.max(0, tRel.love - rand(5, 10));
            pRel.love = Math.min(100, pRel.love + rand(3, 8));
            this.log(`[💔开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}，并发生了关系，但 **${p.name}** 对此感到不满，**${taker.name}** 的好感度下降了。`, 'drama');
          } else {
            // 70%概率增加好感
            pRel.love = Math.min(100, pRel.love + rand(5, 10));
            tRel.love = Math.min(100, tRel.love + rand(5, 10));
            
            // 有概率发展成炮友
            if (Math.random() < 0.4 && !p.fwbList.includes(taker.name) && !taker.fwbList.includes(p.name)) {
              p.fwbList.push(taker.name);
              taker.fwbList.push(p.name);
              this.log(`[💋开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}，并发生了关系，两人发展成了炮友关系！`, 'drama');
            } else {
              this.log(`[🔥开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}，并发生了关系...`, 'drama');
            }
          }
        }
        
        // 可能怀孕
        if (Math.random() < 0.3 && !p.pregnant && !taker.pregnant) {
          const whoGetsPregnant = Math.random() < 0.5 ? p : taker;
          const other = whoGetsPregnant === p ? taker : p;
          if (whoGetsPregnant.contraceptives <= 0) {
            // 怀孕280天（约9个月）
            const pregnancyDuration = 280 * 24 * 60; // 转换为分钟
            whoGetsPregnant.pregnant = {
              father: other.name,
              dueDate: this.getAbsoluteTime() + pregnancyDuration
            };
            this.log(`[🤰怀孕] **${whoGetsPregnant.name}** 在酒店和 **${other.name}** 发生关系后怀孕了！`, 'drama');
          }
        }
      } else {
        this.log(`[🏨开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}休息。`, 'event');
      }
      
      p.currentAction = `🍺 被 ${taker.name} 带到酒店`;
      taker.currentAction = `🏨 和 ${p.name} 在酒店`;
      p.interactingWith = taker.name;
      taker.interactingWith = p.name;
    } else {
      // 带回家：可以照顾或发生关系
      // 决定是照顾还是发生关系
      let intimacyChance = 0.3; // 基础概率30%
      if (p.hasTrait('promiscuous') || taker.hasTrait('promiscuous')) {
        intimacyChance = 0.6; // 淫乱特质概率更高
      }
      // 胆小特质大幅降低概率
      if (p.hasTrait('coward') || taker.hasTrait('coward')) {
        intimacyChance *= 0.2; // 胆小的人抗拒，概率大幅降低
      }
      if (pRel.love > 50) {
        intimacyChance += 0.2; // 好感度高概率更高
      }
      
      if (Math.random() < intimacyChance) {
        // 发生关系
        p.sexCount = (p.sexCount || 0) + 1;
        taker.sexCount = (taker.sexCount || 0) + 1;
        p.happiness = Math.min(100, p.happiness + rand(10, 20));
        taker.happiness = Math.min(100, taker.happiness + rand(8, 15));
        
        // 被发生方非淫乱特质发生关系会降低发生者的好感
        if (!p.hasTrait('promiscuous')) {
          // 非淫乱特质：降低发生者的好感
          tRel.love = Math.max(0, tRel.love - rand(10, 20));
          this.log(`[💔发生关系] **${taker.name}** 把喝晕的 **${p.name}** 带回家并发生了关系，但 **${p.name}** 对此感到不满，**${taker.name}** 的好感度下降了。`, 'drama');
        } else {
          // 淫乱特质：有小的概率降低对方的好感，也有概率发展成炮友
          if (Math.random() < 0.3) {
            // 30%概率降低对方的好感
            tRel.love = Math.max(0, tRel.love - rand(5, 10));
            this.log(`[💔发生关系] **${taker.name}** 把喝晕的 **${p.name}** 带回家并发生了关系，但 **${p.name}** 对此感到不满，**${taker.name}** 的好感度下降了。`, 'drama');
          } else {
            // 70%概率增加好感
            pRel.love = Math.min(100, pRel.love + rand(5, 10));
            tRel.love = Math.min(100, tRel.love + rand(5, 10));
            
            // 有概率发展成炮友
            if (Math.random() < 0.4 && !p.fwbList.includes(taker.name) && !taker.fwbList.includes(p.name)) {
              p.fwbList.push(taker.name);
              taker.fwbList.push(p.name);
              this.log(`[💋发展炮友] **${taker.name}** 把喝晕的 **${p.name}** 带回家并发生了关系，两人发展成了炮友关系！`, 'drama');
            } else {
              this.log(`[🔥发生关系] **${taker.name}** 把喝晕的 **${p.name}** 带回家并发生了关系...`, 'drama');
            }
          }
        }
        
        // 可能怀孕
        if (Math.random() < 0.3 && !p.pregnant && !taker.pregnant) {
          const whoGetsPregnant = Math.random() < 0.5 ? p : taker;
          const other = whoGetsPregnant === p ? taker : p;
          if (whoGetsPregnant.contraceptives <= 0) {
            // 怀孕280天（约9个月）
            const pregnancyDuration = 280 * 24 * 60; // 转换为分钟
            whoGetsPregnant.pregnant = {
              father: other.name,
              dueDate: this.getAbsoluteTime() + pregnancyDuration
            };
            this.log(`[🤰怀孕] **${whoGetsPregnant.name}** 在家中和 **${other.name}** 发生关系后怀孕了！`, 'drama');
          }
        }
        
        p.currentAction = `🏠 被 ${taker.name} 带回家`;
        taker.currentAction = `🏠 带 ${p.name} 回家`;
        p.interactingWith = taker.name;
        taker.interactingWith = p.name;
      } else {
        // 带回家照顾：增加彼此好感
        p.currentAction = `🏠 被 ${taker.name} 带回家`;
        taker.currentAction = `🏠 带 ${p.name} 回家`;
        p.interactingWith = taker.name;
        taker.interactingWith = p.name;
        p.happiness = Math.min(100, p.happiness + rand(5, 10));
        taker.happiness = Math.min(100, taker.happiness + rand(3, 8));
        // 增加彼此好感度
        pRel.love = Math.min(100, pRel.love + rand(8, 15));
        tRel.love = Math.min(100, tRel.love + rand(5, 10));
        this.log(`[🏠带回家] **${taker.name}** 把喝晕的 **${p.name}** 带回了家照顾，彼此的好感度增加了。`, 'event');
      }
    }
  }

  // 处理睡在马路上
  handleSleepOnStreet(p: Character) {
    p.currentAction = '😴 睡在马路上';
    p.happiness = Math.max(0, p.happiness - rand(5, 15)); // 降低心情
    
    // 可能被其他人发现并带走（增加戏剧性）
    if (Math.random() < 0.3) {
      const availableChars = this.state.chars.filter(c => 
        c.name !== p.name && 
        !c.isDrunk && 
        !c.interactingWith &&
        !c.isInHotel // 已经在酒店的人不能带走别人
      );
      
      if (availableChars.length > 0) {
        const discoverer = choose(availableChars);
        // 50%概率被带走，50%概率只是发现
        if (Math.random() < 0.5) {
          // 被带走
          this.takeDrunkHomeOrHotel(p, discoverer);
          return;
        } else {
          // 只是发现
          // 建立关系（如果还没有）
          if (!p.relationships[discoverer.name]) {
            p.relationships[discoverer.name] = { love: 0, status: 'stranger' };
          }
          if (!discoverer.relationships[p.name]) {
            discoverer.relationships[p.name] = { love: 0, status: 'stranger' };
          }
          
          const pRel = p.relationships[discoverer.name];
          const dRel = discoverer.relationships[p.name];
          
          // 发现者可能帮助或嘲笑
          if (Math.random() < 0.5) {
            // 帮助（增加好感度）
            pRel.love = Math.min(100, pRel.love + rand(3, 8));
            dRel.love = Math.min(100, dRel.love + rand(2, 5));
            p.happiness = Math.min(100, p.happiness + rand(3, 8));
            this.log(`[💚帮助] **${discoverer.name}** 发现了睡在马路上的 **${p.name}**，并帮助了他。`, 'event');
          } else {
            // 嘲笑（降低好感度）
            pRel.love = Math.max(0, pRel.love - rand(2, 5));
            dRel.love = Math.max(0, dRel.love - rand(1, 3));
            this.log(`[😄嘲笑] **${discoverer.name}** 发现了睡在马路上的 **${p.name}**，并嘲笑了他。`, 'drama');
          }
        }
      }
    } else {
      this.log(`[😴睡马路] **${p.name}** 喝晕后睡在了马路上...`, 'drama');
    }
  }

  // 关系状态升级
  updateRelationshipStatus(p: Character, t: Character, pRel: Relationship, tRel: Relationship) {
    // 陌生人 -> 朋友 (好感度 > 10)
    if (pRel.status === 'stranger' && pRel.love > 10) {
      pRel.status = 'friend';
      tRel.status = 'friend';
    }
    // 朋友 -> 挚友 (好感度 > 60 且当前状态是朋友)
    else if (pRel.status === 'friend' && pRel.love > 60) {
      // 确保没有发展为恋人/配偶/小三关系
      if (pRel.status === 'friend' && tRel.status === 'friend') {
        pRel.status = 'bestfriend';
        tRel.status = 'bestfriend';
      }
    }
  }

  // 检查浪漫事件（表白、求婚、小三关系、酒店交欢等）
  checkRomanceEvent(p: Character, t: Character, pRel: Relationship, tRel: Relationship, venue: any): boolean {
    // --- 表白 (单身) ---
    // 降低表白门槛：好感度 > 65（从70降到65），提高尝试概率到25%（从20%提高到25%）
    if (!p.partner && !t.partner && pRel.love > 65 && pRel.status !== 'spouse' && pRel.status !== 'lover') {
      let confessChance = 0.25; // 基础25%概率
      // 浪漫场所增加表白概率
      if (venue.effect === 'romance') confessChance = 0.4; // 公园等浪漫场所40%概率
      
      // 特性影响：浪漫特性大幅增加表白概率，冲动特性也增加，保守特性减少
      if (p.hasTrait('romantic')) {
        confessChance *= 1.8; // 浪漫特性增加80%概率
      }
      if (p.hasTrait('impulsive')) {
        confessChance *= 1.5; // 冲动特性增加50%概率
      }
      if (p.hasTrait('conservative')) {
        confessChance *= 0.5; // 保守特性减少50%概率
      }
      if (p.hasTrait('rational')) {
        confessChance *= 0.7; // 理性特性减少30%概率
      }
      
      confessChance = Math.min(0.9, confessChance); // 最高不超过90%
      
      if (Math.random() < confessChance) {
        // 特性影响：浪漫特性更容易接受表白，保守特性更难接受
        let acceptBonus = 0;
        if (t.hasTrait('romantic')) acceptBonus += 15; // 浪漫特性+15接受度
        if (t.hasTrait('impulsive')) acceptBonus += 10; // 冲动特性+10接受度
        if (t.hasTrait('conservative')) acceptBonus -= 15; // 保守特性-15接受度
        if (t.hasTrait('rational')) acceptBonus -= 10; // 理性特性-10接受度
        
        // 临时修改好感度来影响接受判定
        const originalLove = tRel.love;
        tRel.love = Math.min(100, Math.max(0, tRel.love + acceptBonus));
        const accepted = t.decideProposal(p.name, 'confess');
        tRel.love = originalLove; // 恢复原始好感度
        
        if (accepted) {
          p.partner = t.name;
          t.partner = p.name;
          pRel.status = "lover";
          tRel.status = "lover";
          p.happiness = Math.min(100, p.happiness + 20);
          t.happiness = Math.min(100, t.happiness + 20);
          this.log(`[❤️表白] 在 ${venue.name}，${p.name} 鼓起勇气向 ${t.name} 表白... **成功了！**`, 'love');
        } else {
          p.happiness = Math.max(0, p.happiness - 20); // 心碎
          pRel.love = Math.max(0, pRel.love - 10); // 尴尬
          this.log(`[💔拒绝] ${p.name} 向 ${t.name} 表白，但被发了好人卡...`, 'reject');
        }
        return true;
      }
    }

    // --- 发展小三关系 (一方或双方已婚) ---
    // 注意：炮友关系可以和小三关系并存，所以这里不排除fwb状态
    if ((p.partner || t.partner) && pRel.love > 60 && pRel.status !== 'lover' && pRel.status !== 'spouse' && pRel.status !== 'mistress') {
      // 需要特殊场所（酒吧、酒店）且概率较低
      let mistressChance = 0.05;
      // 淫乱特性增加概率
      if (p.hasTrait('promiscuous') || t.hasTrait('promiscuous')) {
        mistressChance *= 3; // 淫乱的人概率翻3倍
      }
      if ((venue.effect === 'chaos' || venue.effect === 'ntr') && Math.random() < mistressChance) {
        if (t.decideProposal(p.name, 'confess')) {
          // 建立小三关系
          pRel.status = "mistress";
          tRel.status = "mistress";
          p.happiness = Math.min(100, p.happiness + 15);
          t.happiness = Math.min(100, t.happiness + 15);
          const pSpouse = p.partner ? `（${p.name}已有伴侣${p.partner}）` : '';
          const tSpouse = t.partner ? `（${t.name}已有伴侣${t.partner}）` : '';
          this.log(`[💋偷情] 在 ${venue.name}，${p.name} 和 ${t.name} 发展成了情人关系${pSpouse}${tSpouse}！`, 'drama');
          return true;
        }
      }
    }

    // --- 求婚 ---
    if (p.partner === t.name && pRel.love > 90 && pRel.status !== 'spouse') {
      let chance = 0.1;
      if (venue.effect === 'marriage') chance = 0.5; // 教堂极大增加求婚率

      if (Math.random() < chance) {
        if (t.decideProposal(p.name, 'propose')) {
          pRel.status = "spouse";
          tRel.status = "spouse";
          p.happiness = 100;
          t.happiness = 100;
          this.state.townMoney += 1000; // 份子钱
          this.log(`[💍结婚] 恭喜！${p.name} 和 ${t.name} 终于修成正果！全镇欢腾！`, 'drama');
        } else {
          p.happiness = Math.max(0, p.happiness - 30);
          this.log(`[🖐拒绝] ${p.name} 居然求婚失败了！${t.name} 表示还想再等等。`, 'reject');
        }
        return true;
      }
    }

    // --- 酒店交欢事件 (需要一定好感度) ---
    if (venue.effect === 'ntr' && pRel.love > 50) {
      // 概率较低，不要太频繁 (2%基础概率)
      let intimacyChance = 0.02;
      // 如果是情侣/夫妻/小三，概率稍高
      if (pRel.status === 'lover' || pRel.status === 'spouse' || pRel.status === 'mistress') {
        intimacyChance = 0.05;
      }
      // 好感度越高，概率越高
      intimacyChance += (pRel.love - 50) / 2000; // 最多再+2.5%
      // 淫乱特质大幅增加概率
      if (p.hasTrait('promiscuous') || t.hasTrait('promiscuous')) {
        intimacyChance *= 2.5; // 淫乱的人概率翻2.5倍
      }
      
      // 胆小特质大幅降低概率（害怕被草）
      if (p.hasTrait('coward') || t.hasTrait('coward')) {
        intimacyChance *= 0.2; // 胆小的人概率大幅降低
      }
      
      if (Math.random() < intimacyChance) {
        // 记录交欢次数（需要扩展 Relationship 接口）
        (pRel as any).intimacyCount = ((pRel as any).intimacyCount || 0) + 1;
        (tRel as any).intimacyCount = ((tRel as any).intimacyCount || 0) + 1;
        
        // 增加打炮次数（情人交欢）
        p.sexCount = (p.sexCount || 0) + 1;
        t.sexCount = (t.sexCount || 0) + 1;
        
        // 增加好感度
        pRel.love = Math.min(100, pRel.love + 3);
        tRel.love = Math.min(100, tRel.love + 3);
        p.happiness = Math.min(100, p.happiness + 10);
        t.happiness = Math.min(100, t.happiness + 10);
        
        const relationText = pRel.status === 'spouse' ? '夫妻' : 
                            pRel.status === 'lover' ? '情侣' : 
                            pRel.status === 'mistress' ? '情人' : '朋友';
        this.log(`[🔥交欢] ${p.name} 和 ${t.name} 在酒店共度良宵... (${relationText}关系，第${(pRel as any).intimacyCount}次)`, 'drama');
        
        // 怀孕判定（只有一方可能怀孕，随机选择）
        const whoGetsPregnant = Math.random() < 0.5 ? p : t;
        const other = whoGetsPregnant === p ? t : p;
        
        // 检查是否使用避孕用品
        let usedContraceptive = false;
        if (whoGetsPregnant.contraceptives > 0) {
          // 非恋爱关系通常选择避孕
          const isInRelationship = (whoGetsPregnant.partner === other.name) || 
                                  (pRel.status === 'lover' || pRel.status === 'spouse');
          if (!isInRelationship || Math.random() < 0.3) {
            whoGetsPregnant.contraceptives--;
            usedContraceptive = true;
          }
        }
        
        // 如果没有使用避孕用品，可能怀孕
        if (!usedContraceptive && !whoGetsPregnant.pregnant) {
          const pregnancyChance = 0.15; // 15%基础怀孕概率
          if (Math.random() < pregnancyChance) {
            const pregnancyDays = rand(7, 14); // 怀孕7-14天
            whoGetsPregnant.pregnant = {
              father: other.name,
              dueDate: this.getAbsoluteTime() + (pregnancyDays * 1440)
            };
            this.log(`[🤰怀孕] ${whoGetsPregnant.name} 怀孕了！孩子的父亲是 ${other.name}...`, 'drama');
          }
        }
        
        // 如果是出轨，有被发现的风险
        if (p.partner && p.partner !== t.name) {
          if (Math.random() < 0.3) {
            const partner = this.state.chars.find(c => c.name === p.partner);
            if (partner) {
              partner.happiness = 0;
              p.partner = null;
              partner.partner = null; // 分手
              p.relationships[partner.name].status = "ex";
              partner.relationships[p.name].status = "ex";
              partner.relationships[p.name].love = 0;
              this.log(`[✂️决裂] ${partner.name} 发现了真相！两人彻底完了！`, 'reject');
            }
          }
        }
        return true;
      }
    }

    // --- 出轨 (需要场所刺激) ---
    if (p.partner && p.partner !== t.name && pRel.love > 60) {
      if (venue.effect === 'chaos' || venue.effect === 'ntr') {
        if (Math.random() < 0.05) {
          this.log(`[🔥偷情] 天哪！${p.name} 背着 ${p.partner}，在 ${venue.name} 和 ${t.name} 发生了不可描述的事！`, 'drama');
          // 伴侣发现判定
          if (Math.random() < 0.4) {
            const partner = this.state.chars.find(c => c.name === p.partner);
            if (partner) {
              partner.happiness = 0;
              p.partner = null;
              partner.partner = null; // 分手
              p.relationships[partner.name].status = "ex";
              partner.relationships[p.name].status = "ex";
              partner.relationships[p.name].love = 0;
              this.log(`[✂️决裂] ${partner.name} 发现了真相！两人彻底完了！`, 'reject');
            }
          }
          return true;
        }
      }
    }
    
    return false;
  }

  updateTimeSpeed(speed: number) {
    if (speed < 0.1) {
      this.log('❌ 速度必须大于等于0.1！', 'error');
      return;
    }
    if (speed > 1000) {
      this.log('❌ 速度不能超过1000倍！', 'error');
      return;
    }
    this.state.timeSpeed = speed;
    this.log(`⏱️ 时间速度已调整为 ${speed}x`, 'info');
  }

  exportSave() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined' || typeof document === 'undefined') {
      this.log('❌ 导出功能仅在浏览器环境中可用！', 'error');
      return;
    }
    
    try {
      // 先保存一次当前进度
      this.manualSave();
      
      // 获取存档数据
      const saveKey = `happyTownV2_Save_Slot${this.currentSlot}`;
      const saveStr = localStorage.getItem(saveKey);
      if (!saveStr) {
        this.log('❌ 没有找到存档数据！', 'error');
        return;
      }
      
      // 解析并添加元数据
      const data = JSON.parse(saveStr);
      const exportData = {
        ...data,
        exportTime: new Date().toISOString(),
        version: GAME_VERSION,
        gameName: "猫果镇物语",
        exportVersion: GAME_VERSION // 导出时的版本
      };
      
      // 创建Blob对象
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      
      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.href = url;
      a.download = `catcandy-town-save-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.log(`✅ 存档已导出！文件名: catcandy-town-save-${timestamp}.json (版本 ${GAME_VERSION})`, 'info');
    } catch (e: any) {
      console.error("导出存档失败", e);
      this.log(`❌ 导出存档失败：${e.message}`, 'error');
    }
  }

  importSave(file: File) {
    if (!file.name.endsWith('.json')) {
      this.log('❌ 请选择JSON格式的存档文件！', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const result = this.loadFromJSON(content);
        
        if (result.success) {
          // 停止游戏
          this.stop();
          
          // 检查并添加新角色
          this.checkAndAddNewChars();
          
          // 保存到 localStorage（使用更新后的数据）
          this.autoSave();
          
          this.log('📂 存档导入成功！', 'info');
          
          // 重新启动游戏
          this.start();
        } else {
          this.log(`❌ 导入存档失败：${result.message}`, 'error');
        }
      } catch (e: any) {
        console.error("导入存档失败", e);
        this.log(`❌ 导入存档失败：${e.message}\n请确保文件格式正确！`, 'error');
      }
    };
    
    reader.onerror = () => {
      this.log('❌ 读取文件失败！', 'error');
    };
    
    reader.readAsText(file);
  }

  resetData(preserveCustomization: boolean = false) {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      this.log('❌ 重置功能仅在浏览器环境中可用！', 'error');
      return;
    }
    
    if (confirm('确定要重置游戏吗？所有进度将丢失！')) {
      // 保存自定义设置（如果需要保留）
      const savedTownName = preserveCustomization ? this.state.townName : '猫果镇';
      const savedCustomNames = preserveCustomization ? [...this.state.customCharacterNames] : [];
      
      // 删除当前槽位的存档
      const saveKey = `happyTownV2_Save_Slot${this.currentSlot}`;
      localStorage.removeItem(saveKey);
      this.stop();
      
      // 恢复自定义设置
      this.state.townName = savedTownName;
      this.state.customCharacterNames = savedCustomNames;
      
      // 清空所有游戏状态，让游戏回到开始页面
      this.state.chars = [];
      this.state.buildings = [];
      this.state.townMoney = 0;
      this.state.gameTime = 480;
      this.state.gameDay = 1;
      this.state.totalDaysPassed = 0;
      this.state.logs = [];
      this.state.isPlaying = false;
      this.state.timeSpeed = 1;
      
      this.log('🗑 游戏已重置到初始状态', 'info');
      
      // 重置时清除调试模式标志
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.removeItem('debug_mode');
        window.dispatchEvent(new CustomEvent('debug-mode-disabled'));
      }
      
      // 重置后不自动启动，等待开始页面
      // 触发自定义事件，通知 UI 显示开始页面
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('game-reset'));
      }
    }
  }

  // 存档重roll：重新随机生成所有居民的特质（personality和traits）
  rollCurrentSave() {
    if (this.state.chars.length === 0) {
      this.log('❌ 没有居民可以重roll！', 'error');
      return;
    }
    
    // 保存游戏运行状态，确保roll后游戏继续运行
    const wasPlaying = this.state.isPlaying;
    
    let rolledCount = 0;
    
    // 遍历所有居民，重新随机生成特质
    this.state.chars.forEach(char => {
      // 重新随机生成性格
      char.personality = choose(PERSONALITIES);
      
      // 重新随机生成特质
      char.traits = [];
      const existingTraitIds: string[] = [];
      
      // 第一步：较大概率获得第一个特质（70%）
      if (Math.random() < 0.7) {
        const availableTraits = TRAITS.filter(t => 
          !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
        );
        if (availableTraits.length > 0) {
          const selectedTrait = choose(availableTraits);
          char.traits.push(selectedTrait);
          existingTraitIds.push(selectedTrait.id);
        }
      }
      
      // 第二步：大概率再获得一个特质（80%）
      if (Math.random() < 0.8 && existingTraitIds.length > 0) {
        const availableTraits = TRAITS.filter(t => 
          !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
        );
        if (availableTraits.length > 0) {
          const selectedTrait = choose(availableTraits);
          char.traits.push(selectedTrait);
          existingTraitIds.push(selectedTrait.id);
        }
      }
      
      // 第三步：小概率额外获得一个特质（20%）
      if (Math.random() < 0.2 && existingTraitIds.length > 0) {
        const availableTraits = TRAITS.filter(t => 
          !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
        );
        if (availableTraits.length > 0) {
          const selectedTrait = choose(availableTraits);
          char.traits.push(selectedTrait);
          existingTraitIds.push(selectedTrait.id);
        }
      }
      
      // 第四步：极小概率额外获得一个特质（5%）
      if (Math.random() < 0.05 && existingTraitIds.length > 0) {
        const availableTraits = TRAITS.filter(t => 
          !existingTraitIds.includes(t.id) && !hasTraitConflict(existingTraitIds, t.id)
        );
        if (availableTraits.length > 0) {
          const selectedTrait = choose(availableTraits);
          char.traits.push(selectedTrait);
          existingTraitIds.push(selectedTrait.id);
        }
      }
      
      rolledCount++;
    });
    
    // 重置游戏时间到存档的默认起始时间（与initNewGame相同）
    this.state.gameTime = 480; // minutes, start at 8:00
    this.state.gameDay = 1; // 0-6, default Monday
    this.state.totalDaysPassed = 0;
    
    // 恢复游戏运行状态，确保时间继续流动
    this.state.isPlaying = wasPlaying;
    
    this.log(`🎲 已重新随机生成 ${rolledCount} 名居民的特质和性格！游戏时间已重置到第0天8:00。`, 'info');
    
    // 自动保存
    this.autoSave();
  }

  // 性欲处理系统
  trySexualRelief(p: Character): boolean {
    // 只处理淫乱特性的居民
    if (!p.hasTrait('promiscuous')) {
      return false;
    }

    // 检查是否内向或自卑（内向性格或孤僻特性）
    const isIntroverted = p.personality.name === '内向' || p.hasTrait('loner');
    const isShy = p.personality.name === '胆小' || p.personality.name === '内向';

    // 淫乱但内向/自卑的人：更大概率选择扣扣或鹿观
    if (isIntroverted || isShy) {
      if (Math.random() < 0.7) {
        // 70%概率扣扣/鹿观
        this.doMasturbation(p);
        return true;
      }
    }

    // 淫乱的人：寻找炮友
    if (Math.random() < 0.6) {
      // 60%概率寻找炮友
      const fwb = this.findFWB(p);
      if (fwb) {
        this.startFWBRelief(p, fwb);
        return true;
      }
    }

    // 如果找不到炮友，也可能扣扣或鹿观
    if (Math.random() < 0.4) {
      this.doMasturbation(p);
      return true;
    }

    return false;
  }

  // 扣扣或鹿观
  doMasturbation(p: Character) {
    p.isRelieving = true;
    // 随机选择扣扣或鹿观
    const method = Math.random() < 0.5 ? '扣扣' : '鹿观';
    p.currentAction = `🔞 ${method}中`;
    p.sexualDesire = Math.max(0, p.sexualDesire - 50); // 减少性欲
    // 增加扣扣/鹿观次数
    p.masturbationCount = (p.masturbationCount || 0) + 1;
    // 设置结束时间（30-60分钟后）
    const duration = rand(30, 60); // 分钟
    p.relievingEndTime = this.getAbsoluteTime() + duration;
    // 将选择的方法存储在 relievingWith 中（如果是自慰，存储方法名）
    (p as any).masturbationMethod = method;
    this.log(`[🔞${method}] **${p.name}** 选择了${method}来发泄性欲...`, 'drama');
  }

  // 寻找炮友
  findFWB(p: Character): Character | null {
    // 优先从已有炮友列表中选择
    if (p.fwbList.length > 0) {
      const availableFWBs = p.fwbList
        .map(name => this.state.chars.find(c => c.name === name))
        .filter((c): c is Character => 
          c !== undefined && 
          !c.isRelieving && 
          c.name !== p.name
        );
      
      if (availableFWBs.length > 0) {
        return choose(availableFWBs);
      }
    }

    // 寻找新的炮友：优先寻找淫乱特性且好感度>40的居民
    const promiscuousCandidates = this.state.chars.filter(c => 
      c.name !== p.name &&
      c.hasTrait('promiscuous') &&
      !c.isRelieving &&
      !p.fwbList.includes(c.name) &&
      (p.relationships[c.name]?.love || 0) > 40
    );

    if (promiscuousCandidates.length > 0) {
      const newFWB = choose(promiscuousCandidates);
      // 建立炮友关系（可以和小三关系并存）
      if (!p.fwbList.includes(newFWB.name)) {
        p.fwbList.push(newFWB.name);
      }
      if (!newFWB.fwbList.includes(p.name)) {
        newFWB.fwbList.push(p.name);
      }
      // 更新关系状态（如果还不是炮友关系）
      if (!p.relationships[newFWB.name]) {
        p.relationships[newFWB.name] = { love: 0, status: 'stranger' };
      }
      if (!newFWB.relationships[p.name]) {
        newFWB.relationships[p.name] = { love: 0, status: 'stranger' };
      }
      const pRel = p.relationships[newFWB.name];
      const newFWBRel = newFWB.relationships[p.name];
      if (pRel.status !== 'fwb' && pRel.status !== 'mistress' && pRel.status !== 'lover' && pRel.status !== 'spouse') {
        pRel.status = 'fwb';
        newFWBRel.status = 'fwb';
      }
      this.log(`[💋新炮友] **${p.name}** 和 **${newFWB.name}** 建立了炮友关系！`, 'drama');
      return newFWB;
    }

    // 劝良从娼：如果找不到淫乱特性的炮友，尝试说服非淫乱特性的居民
    // 30%概率尝试劝良从娼
    if (Math.random() < 0.3) {
      const normalCandidates = this.state.chars.filter(c => 
        c.name !== p.name &&
        !c.hasTrait('promiscuous') && // 非淫乱特性
        !c.isRelieving &&
        !p.fwbList.includes(c.name) &&
        (p.relationships[c.name]?.love || 0) > 30 // 好感度要求稍低
      );

      if (normalCandidates.length > 0) {
        const target = choose(normalCandidates);
        const persuaded = this.persuadeToFWB(p, target);
        if (persuaded) {
          return target;
        }
      }
    }

    return null;
  }

  // 劝良从娼：说服非淫乱特性的居民成为炮友
  persuadeToFWB(persuader: Character, target: Character): boolean {
    // 计算说服概率
    let persuadeChance = 0;

    // 基础概率：好感度影响（好感度越高越容易被说服）
    const love = (persuader.relationships[target.name]?.love || 0);
    persuadeChance += love * 0.3; // 好感度贡献30%

    // 说服者的性格影响（说服能力）
    const persuaderPersonality = persuader.personality;
    let persuaderBonus = 0;
    switch (persuaderPersonality.name) {
      case '热情': persuaderBonus = 20; break;
      case '开朗': persuaderBonus = 15; break;
      case '幽默': persuaderBonus = 15; break;
      case '温柔': persuaderBonus = 10; break;
      case '狡猾': persuaderBonus = 25; break; // 狡猾的人更擅长说服
      case '冷漠': persuaderBonus = -10; break;
      case '刻薄': persuaderBonus = -15; break;
      case '内向': persuaderBonus = -10; break;
      default: persuaderBonus = 0;
    }
    persuadeChance += persuaderBonus;

    // 被说服者的性格影响（被说服的难易程度）
    const targetPersonality = target.personality;
    let targetModifier = 0;
    switch (targetPersonality.name) {
      case '冲动': targetModifier = 20; break; // 冲动的人容易被说服
      case '浪漫': targetModifier = 15; break; // 浪漫的人容易被说服
      case '胆小': targetModifier = -30; break; // 胆小的人害怕被草，很难被说服成为炮友
      case '乐观': targetModifier = 10; break; // 乐观的人容易被说服
      case '保守': targetModifier = -25; break; // 保守的人很难被说服
      case '理性': targetModifier = -20; break; // 理性的人很难被说服
      case '严肃': targetModifier = -15; break; // 严肃的人很难被说服
      case '诚实': targetModifier = -10; break; // 诚实的人不太容易被说服
      case '悲观': targetModifier = -5; break;
      default: targetModifier = 0;
    }
    persuadeChance += targetModifier;

    // 特质影响
    // 说服者的特质
    if (persuader.hasTrait('social')) {
      persuadeChance += 10; // 社交达人更容易说服别人
    }
    if (persuader.hasTrait('impulsive')) {
      persuadeChance += 5; // 冲动的人说服时更直接
    }

    // 被说服者的特质
    if (target.hasTrait('impulsive')) {
      persuadeChance += 15; // 冲动的人容易被说服
    }
    if (target.hasTrait('romantic')) {
      persuadeChance += 10; // 浪漫的人容易被说服
    }
    if (target.hasTrait('conservative')) {
      persuadeChance -= 20; // 保守的人很难被说服
    }
    if (target.hasTrait('rational')) {
      persuadeChance -= 15; // 理性的人很难被说服
    }
    if (target.hasTrait('loner')) {
      persuadeChance -= 10; // 孤僻的人不太容易被说服
    }
    // 胆小特质：害怕被草，成为炮友的可能性比其他人更低
    if (target.hasTrait('coward')) {
      persuadeChance -= 40; // 胆小的人大幅降低成为炮友的概率
    }

    // 心情影响（心情好更容易被说服）
    persuadeChance += (target.happiness - 50) * 0.2;

    // 性欲值影响（性欲高更容易被说服）
    if (target.sexualDesire > 50) {
      persuadeChance += (target.sexualDesire - 50) * 0.3;
    }

    // 随机波动
    persuadeChance += rand(-10, 10);

    // 基础阈值：50（需要一定的说服概率才能成功）
    const threshold = 50;

    if (persuadeChance >= threshold) {
      // 说服成功
      // 建立炮友关系
      if (!persuader.fwbList.includes(target.name)) {
        persuader.fwbList.push(target.name);
      }
      if (!target.fwbList.includes(persuader.name)) {
        target.fwbList.push(persuader.name);
      }
      
      // 更新关系状态
      if (!persuader.relationships[target.name]) {
        persuader.relationships[target.name] = { love: 0, status: 'stranger' };
      }
      if (!target.relationships[persuader.name]) {
        target.relationships[persuader.name] = { love: 0, status: 'stranger' };
      }
      const pRel = persuader.relationships[target.name];
      const tRel = target.relationships[persuader.name];
      if (pRel.status !== 'fwb' && pRel.status !== 'mistress' && pRel.status !== 'lover' && pRel.status !== 'spouse') {
        pRel.status = 'fwb';
        tRel.status = 'fwb';
      }
      
      // 增加好感度（说服成功会增进关系）
      pRel.love = Math.min(100, pRel.love + rand(3, 8));
      tRel.love = Math.min(100, tRel.love + rand(3, 8));
      
      // 被说服者心情可能略微下降（因为做了违背本性的决定）
      target.happiness = Math.max(0, target.happiness - rand(3, 8));
      
      this.log(`[💋劝良从娼] **${persuader.name}** 成功说服了 **${target.name}** 成为炮友！`, 'drama');
      return true;
    } else {
      // 说服失败
      // 降低好感度（被拒绝会尴尬）
      if (persuader.relationships[target.name]) {
        persuader.relationships[target.name].love = Math.max(0, persuader.relationships[target.name].love - rand(5, 10));
      }
      if (target.relationships[persuader.name]) {
        target.relationships[persuader.name].love = Math.max(0, target.relationships[persuader.name].love - rand(3, 8));
      }
      
      // 说服者心情下降（被拒绝）
      persuader.happiness = Math.max(0, persuader.happiness - rand(3, 5));
      
      this.log(`[❌拒绝] **${persuader.name}** 试图说服 **${target.name}** 成为炮友，但被拒绝了...`, 'reject');
      return false;
    }
  }

  // 开始炮友性欲发泄
  startFWBRelief(p: Character, fwb: Character) {
    p.isRelieving = true;
    p.relievingWith = fwb.name;
    fwb.isRelieving = true;
    fwb.relievingWith = p.name;
    
    p.currentAction = `💋 和 ${fwb.name} 一起`;
    fwb.currentAction = `💋 和 ${p.name} 一起`;
    
    p.sexualDesire = Math.max(0, p.sexualDesire - 60);
    fwb.sexualDesire = Math.max(0, fwb.sexualDesire - 60);
    
    // 增加打炮次数（炮友）
    p.sexCount = (p.sexCount || 0) + 1;
    fwb.sexCount = (fwb.sexCount || 0) + 1;
    
    // 设置结束时间（40-80分钟后）
    const duration = rand(40, 80); // 分钟
    const endTime = this.getAbsoluteTime() + duration;
    p.relievingEndTime = endTime;
    fwb.relievingEndTime = endTime;
    
    // 增加好感度
    if (!p.relationships[fwb.name]) {
      p.relationships[fwb.name] = { love: 0, status: 'fwb' };
    }
    if (!fwb.relationships[p.name]) {
      fwb.relationships[p.name] = { love: 0, status: 'fwb' };
    }
    const pRel = p.relationships[fwb.name];
    const fwbRel = fwb.relationships[p.name];
    pRel.love = Math.min(100, pRel.love + rand(2, 5));
    fwbRel.love = Math.min(100, fwbRel.love + rand(2, 5));
    
    this.log(`[💋炮友] **${p.name}** 和 **${fwb.name}** 开始互相解决性欲...`, 'drama');
  }

  // 处理性欲发泄（检查是否完成或被打断）
  handleSexualRelief(p: Character) {
    // 检查是否完成
    if (p.relievingEndTime && this.getAbsoluteTime() >= p.relievingEndTime) {
      // 完成了
      p.isRelieving = false;
      if (p.relievingWith) {
        // 炮友关系
        const fwb = this.state.chars.find(c => c.name === p.relievingWith);
        if (fwb && fwb.isRelieving && fwb.relievingWith === p.name) {
          fwb.isRelieving = false;
          fwb.relievingWith = undefined;
          fwb.relievingEndTime = undefined;
          fwb.happiness = Math.min(100, fwb.happiness + rand(8, 15));
          fwb.currentAction = '发呆';
        }
        p.happiness = Math.min(100, p.happiness + rand(8, 15));
        this.log(`[✅完成] **${p.name}** 和 **${p.relievingWith}** 完成了性欲发泄，心情都提升了。`, 'event');
      } else {
        // 扣扣或鹿观
        const method = (p as any).masturbationMethod || (Math.random() < 0.5 ? '扣扣' : '鹿观');
        p.happiness = Math.min(100, p.happiness + rand(5, 10));
        this.log(`[✅完成] **${p.name}** 完成了${method}，心情提升了。`, 'event');
        // 清除临时存储的方法
        delete (p as any).masturbationMethod;
      }
      p.relievingWith = undefined;
      p.relievingEndTime = undefined;
      p.currentAction = '发呆';
      return;
    }
    
    // 检查是否被打断（被其他人互动）
    if (p.interactingWith && p.interactingWith !== p.relievingWith) {
      // 被打断了
      p.isRelieving = false;
      if (p.relievingWith) {
        const fwb = this.state.chars.find(c => c.name === p.relievingWith);
        if (fwb && fwb.isRelieving && fwb.relievingWith === p.name) {
          fwb.isRelieving = false;
          fwb.relievingWith = undefined;
          fwb.relievingEndTime = undefined;
          fwb.happiness = Math.max(0, fwb.happiness - rand(5, 10));
          fwb.currentAction = '发呆';
        }
      }
      p.relievingWith = undefined;
      p.relievingEndTime = undefined;
      p.happiness = Math.max(0, p.happiness - rand(5, 10));
      p.currentAction = '发呆';
      this.log(`[❌打断] **${p.name}** 的性欲发泄被打断了，心情下降。`, 'drama');
    }
  }

  // 特性学习机制：没有特性的居民在各种活动中可能学习第一个特性
  tryLearnTrait(p: Character, activityType: 'work' | 'social' | 'build' | 'rest', context?: any) {
    // 只针对没有特性的居民（从0到1）
    if (p.traits.length > 0) {
      return; // 已经有特性，不再学习
    }
    
    // 根据活动类型决定学习概率和推荐特性
    let learnChance = 0;
    let recommendedTraits: string[] = [];
    
    switch (activityType) {
      case 'work':
        // 工作中：5%概率学习，推荐工作相关特性
        learnChance = 0.05;
        recommendedTraits = ['hardworking', 'lazy', 'ambitious', 'content'];
        break;
      case 'social':
        // 社交中：8%概率学习，推荐社交相关特性
        learnChance = 0.08;
        recommendedTraits = ['social', 'loner', 'romantic', 'conservative', 'impulsive', 'rational'];
        break;
      case 'build':
        // 建设中：6%概率学习，推荐建设相关特性
        learnChance = 0.06;
        recommendedTraits = ['hardworking', 'money-loving', 'ambitious'];
        break;
      case 'rest':
        // 休息中：4%概率学习，推荐生活相关特性
        learnChance = 0.04;
        recommendedTraits = ['sleepy', 'content', 'generous', 'stingy'];
        break;
    }
    
    // 检查是否触发学习
    if (Math.random() < learnChance) {
      // 获取所有可用特性（排除冲突，虽然0个特性不会有冲突，但为了代码一致性）
      const availableTraits = TRAITS.filter(t => 
        !hasTraitConflict([], t.id)
      );
      
      if (availableTraits.length === 0) {
        return; // 没有可用特性
      }
      
      // 优先从推荐特性中选择，如果没有推荐特性或推荐特性不可用，则随机选择
      let selectedTrait;
      const recommendedAvailable = availableTraits.filter(t => 
        recommendedTraits.includes(t.id)
      );
      
      if (recommendedAvailable.length > 0) {
        // 70%概率选择推荐特性，30%概率随机选择
        if (Math.random() < 0.7) {
          selectedTrait = choose(recommendedAvailable);
        } else {
          selectedTrait = choose(availableTraits);
        }
      } else {
        // 没有推荐特性可用，随机选择
        selectedTrait = choose(availableTraits);
      }
      
      // 学习特性
      p.traits.push(selectedTrait);
      
      // 记录日志
      const activityNames: Record<string, string> = {
        'work': '工作中',
        'social': '社交中',
        'build': '建设中',
        'rest': '休息中'
      };
      
      this.log(`[✨特性觉醒] **${p.name}** 在${activityNames[activityType]}觉醒了特性：**${selectedTrait.name}**！`, 'event');
    }
  }

  // 启用多人模式
  enableMultiplayerMode(townId: string) {
    this.isMultiplayerMode = true;
    this.currentTownId = townId;
    
    // 设置所有角色的所属城镇
    this.state.chars.forEach(char => {
      if (!char.homeTown) {
        char.homeTown = townId;
        char.currentTown = townId;
      }
    });
  }

  // 禁用多人模式
  disableMultiplayerMode() {
    this.isMultiplayerMode = false;
    this.currentTownId = null;
  }

  // 尝试跨城镇消费（异步执行，但立即返回是否尝试）
  tryCrossTownConsume(p: Character, buildingType?: string): boolean {
    if (!this.isMultiplayerMode || typeof window === 'undefined') {
      return false;
    }

    // 检查旅行冷却
    const now = this.getAbsoluteTime();
    if (p.travelCooldown && now < p.travelCooldown) {
      return false; // 还在冷却期
    }

    // 30%概率尝试跨城镇消费
    if (Math.random() >= 0.3) {
      return false;
    }

    // 异步执行跨城镇消费
    import('./network').then(({ networkManager }) => {
      type TownInfo = import('./network').TownInfo;
      const towns = networkManager.getTowns();
      if (towns.length === 0) {
        return;
      }

      // 过滤掉自己的城镇
      const otherTowns = towns.filter(t => t.townId !== this.currentTownId);
      if (otherTowns.length === 0) {
        return;
      }

      // 如果指定了建筑类型，查找有该建筑的城镇
      let targetTown: TownInfo | null = null;
      if (buildingType) {
        targetTown = otherTowns.find(t => 
          t.buildings.some(b => b.id === buildingType)
        ) || null;
      }

      // 如果没有找到特定建筑，随机选择一个城镇
      if (!targetTown && otherTowns.length > 0) {
        targetTown = choose(otherTowns);
      }

      if (!targetTown) {
        return;
      }

      // 选择要消费的建筑
      let targetBuilding: { id: string; name: string } | null = null;
      if (buildingType) {
        targetBuilding = targetTown.buildings.find(b => b.id === buildingType) || null;
      } else if (targetTown.buildings.length > 0) {
        targetBuilding = choose(targetTown.buildings);
      }

      if (targetBuilding) {
        // 模拟消费金额（根据建筑类型）
        let amount = 10;
        if (targetBuilding.id === 'hotel') {
          amount = rand(20, 50); // 酒店消费更高
        } else if (targetBuilding.id === 'bar') {
          amount = rand(5, 15);
        }

        // 检查角色是否有足够的钱
        if (p.money >= amount) {
          p.money -= amount;
          p.currentTown = targetTown.townId;
          p.currentAction = `在 ${targetTown.townName} 的 ${targetBuilding.name}`;
          
          // 设置旅行冷却（2-4小时）
          const cooldown = rand(120, 240);
          p.travelCooldown = now + cooldown;

          // 发送跨城镇消费请求
          networkManager.crossTownConsume(
            p.name,
            targetTown.townId,
            targetBuilding.id,
            amount
          );

          this.log(`[🚶跨镇] **${p.name}** 前往 **${targetTown.townName}** 的 **${targetBuilding.name}** 消费了 💰${amount}`, 'event');
        }
      }
    }).catch(err => {
      console.error('跨城镇消费失败:', err);
    });

    // 立即返回true表示已尝试（实际结果异步处理）
    return true;
  }

  // 检查怀孕进度（分娩和堕胎）
  checkPregnancyProgress() {
    const currentTime = this.getAbsoluteTime();
    
    this.state.chars.forEach(char => {
      if (!char.pregnant) return;
      
      // 检查是否到了预产期
      if (currentTime >= char.pregnant.dueDate) {
        // 决定是分娩还是堕胎（基于幸福度和金钱）
        const wantsAbortion = char.happiness < 40 || (char.money < 1000 && Math.random() < 0.5);
        
        if (wantsAbortion) {
          // 尝试堕胎
          this.performAbortion(char);
        } else {
          // 尝试分娩
          this.performDelivery(char);
        }
      }
    });
  }

  // 执行堕胎
  performAbortion(char: Character) {
    const hospital = this.state.buildings.find(b => b.id === 'hospital' && b.isBuilt);
    const cost = 1000;
    
    if (hospital && char.money >= cost) {
      // 在医院堕胎
      char.money -= cost;
      
      // 分配收入给医院工作人员
      if (hospital.staff.length > 0) {
        this.distributeRevenue(hospital, cost);
      } else {
        // 没有员工，收入进入镇库
        this.state.townMoney += cost;
      }
      hospital.totalRevenue += cost;
      
      this.log(`[🏥手术] ${char.name} 在医院进行了堕胎手术，花费 💰${cost}`, 'event');
    } else {
      // 在家堕胎（免费但风险）
      this.log(`[⚠️风险] ${char.name} 在家中自行堕胎...`, 'drama');
    }
    
    // 清除怀孕状态
    char.pregnant = null;
  }

  // 执行分娩
  performDelivery(char: Character) {
    const hospital = this.state.buildings.find(b => b.id === 'hospital' && b.isBuilt);
    const cost = 3000;
    const fatherName = char.pregnant?.father || '未知';
    
    if (hospital && char.money >= cost) {
      // 在医院分娩
      char.money -= cost;
      
      // 分配收入给医院工作人员
      if (hospital.staff.length > 0) {
        this.distributeRevenue(hospital, cost);
      } else {
        // 没有员工，收入进入镇库
        this.state.townMoney += cost;
      }
      hospital.totalRevenue += cost;
      
      this.log(`[🏥手术] ${char.name} 在医院进行了分娩手术，花费 💰${cost}，孩子父亲是 ${fatherName}`, 'event');
    } else {
      // 在家分娩（免费但风险）
      this.log(`[⚠️风险] ${char.name} 在家中分娩，孩子父亲是 ${fatherName}...`, 'drama');
    }
    
    // 创建新角色（孩子）
    // 孩子会随父母姓，姓氏通常是名字的第一个字开头
    const father = this.state.chars.find(c => c.name === fatherName);
    const fatherSurname = father ? father.name.charAt(0) : null;
    const motherSurname = char.name.charAt(0);
    
    // 优先使用父亲的姓氏，如果没有父亲或父亲名字只有一个字，使用母亲的姓氏
    const surname = fatherSurname && father && father.name.length > 1 ? fatherSurname : motherSurname;
    
    // 生成名字（姓氏 + 随机名字）
    const givenNames = ['伟', '芳', '娜', '秀', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '兰', '霞', '平', '刚', '桂', '英'];
    let childName: string;
    if (Math.random() < 0.5) {
      // 单字名
      childName = surname + givenNames[rand(0, givenNames.length - 1)];
    } else {
      // 双字名
      childName = surname + givenNames[rand(0, givenNames.length - 1)] + givenNames[rand(0, givenNames.length - 1)];
    }
    
    // 确保名字不重复
    let attempts = 0;
    while (this.state.chars.some(c => c.name === childName) && attempts < 100) {
      if (Math.random() < 0.5) {
        childName = surname + givenNames[rand(0, givenNames.length - 1)];
      } else {
        childName = surname + givenNames[rand(0, givenNames.length - 1)] + givenNames[rand(0, givenNames.length - 1)];
      }
      attempts++;
    }
    if (attempts >= 100) {
      // 如果还是重复，添加数字后缀
      childName = surname + givenNames[rand(0, givenNames.length - 1)] + rand(1, 999);
    }
    
    const child = new Character(childName);
    child.age = 1; // 刚出生为1岁
    child.maxAge = 100; // 默认最大寿命
    child.parents = {
      mother: char.name,
      father: fatherName
    };
    child.birthTime = this.getAbsoluteTime();
    
    // 特质遗传：孩子会概率获得父母拥有的特质
    // 收集父母的所有特质
    const parentTraits = new Set<string>();
    if (father) {
      father.traits.forEach(t => parentTraits.add(t.id));
    }
    char.traits.forEach(t => parentTraits.add(t.id));
    
    // 获得1个到4个的概率为：70%，60%，10%，2%
    const traitCount = this.getInheritedTraitCount();
    const parentTraitArray = Array.from(parentTraits);
    
    if (parentTraitArray.length > 0 && traitCount > 0) {
      // 随机选择特质（不重复）
      const selectedTraits: string[] = [];
      const availableTraits = [...parentTraitArray];
      
      for (let i = 0; i < Math.min(traitCount, availableTraits.length); i++) {
        const randomIndex = rand(0, availableTraits.length - 1);
        const traitId = availableTraits[randomIndex];
        const trait = TRAITS.find(t => t.id === traitId);
        if (trait && !hasTraitConflict(child.traits.map(t => t.id), traitId)) {
          child.traits.push(trait);
          selectedTraits.push(traitId);
        }
        availableTraits.splice(randomIndex, 1);
      }
    }
    
    // 初始化关系
    this.state.chars.forEach(c => {
      child.relationships[c.name] = { love: 0, status: 'stranger' };
      c.relationships[childName] = { love: 0, status: 'stranger' };
    });
    
    // 设置与父母的关系
    child.relationships[char.name] = { love: 50, status: 'family' };
    child.relationships[fatherName] = { love: 50, status: 'family' };
    if (father) {
      father.relationships[childName] = { love: 50, status: 'family' };
      father.children.push(childName);
    }
    char.children.push(childName);
    
    // 多人模式：设置所属城镇
    if (this.isMultiplayerMode && this.currentTownId) {
      child.homeTown = this.currentTownId;
      child.currentTown = this.currentTownId;
    }
    
    // 添加到角色列表
    this.state.chars.push(child);
    this.log(`[👶出生] ${childName} 出生了！母亲是 ${char.name}，父亲是 ${fatherName}`, 'event');
    
    // 清除怀孕状态
    char.pregnant = null;
  }

  // 检查年龄增长和死亡
  checkAgeAndDeath() {
    const charsToRemove: Character[] = [];
    
    this.state.chars.forEach(char => {
      if (char.isDead) {
        charsToRemove.push(char);
        return;
      }
      
      // 每年增长1岁（每365天）
      if (char.birthTime) {
        const ageInDays = Math.floor((this.getAbsoluteTime() - char.birthTime) / 1440);
        char.age = Math.floor(ageInDays / 365);
      } else {
        // 如果没有出生时间，每天有1/365的概率增长1岁
        if (Math.random() < 1 / 365) {
          char.age++;
        }
      }
      
      // 检查是否超过最大寿命
      if (char.age >= char.maxAge) {
        char.isDead = true;
        this.log(`[💀死亡] ${char.name} 因年老去世，享年 ${char.age} 岁`, 'event');
        
        // 移除工作
        if (char.job) {
          const building = this.state.buildings.find(b => b.id === char.job!.buildingId);
          if (building) {
            const index = building.staff.indexOf(char.name);
            if (index !== -1) {
              building.staff.splice(index, 1);
            }
          }
          char.job = null;
        }
        
        // 移除关系
        this.state.chars.forEach(c => {
          if (c.name !== char.name) {
            delete c.relationships[char.name];
          }
        });
        
        charsToRemove.push(char);
      }
    });
    
    // 移除已死亡的角色
    charsToRemove.forEach(char => {
      const index = this.state.chars.indexOf(char);
      if (index !== -1) {
        this.state.chars.splice(index, 1);
      }
    });
  }

  // 检查人口流失和城镇幸福感
  checkPopulationFlow() {
    const population = this.state.chars.filter(c => !c.isDead).length;
    
    // 更新城镇幸福感（基于个人幸福感、工作满意度、关系等）
    this.state.chars.forEach(char => {
      if (char.isDead) return;
      
      // 基础幸福感来自个人幸福感
      let townHappiness = char.happiness * 0.5;
      
      // 工作满意度影响
      if (char.job) {
        townHappiness += char.jobSatisfaction * 0.3;
      }
      
      // 关系影响（有伴侣或朋友）
      if (char.partner) {
        townHappiness += 10;
      }
      const friendsCount = Object.values(char.relationships).filter(r => r.status === 'friend').length;
      townHappiness += Math.min(20, friendsCount * 2);
      
      // 人口过多惩罚（>100时）
      if (population > 100) {
        const excess = population - 100;
        townHappiness -= excess * 0.5; // 每多1人减少0.5幸福感
      }
      
      // 限制在0-100之间
      char.townHappiness = Math.max(0, Math.min(100, townHappiness));
      
      // 如果城镇幸福感很低，有概率离开
      if (char.townHappiness < 30 && Math.random() < 0.1) { // 10%概率
        this.leaveTown(char);
      }
    });
  }

  // 检查抢劫事件
  checkRobbery() {
    const aliveChars = this.state.chars.filter(c => !c.isDead);
    if (aliveChars.length < 2) return; // 至少需要2个人
    
    // 计算平均财富
    const totalMoney = aliveChars.reduce((sum, c) => sum + c.money, 0);
    const avgMoney = totalMoney / aliveChars.length;
    
    // 找出财富远高于平均的居民（超过平均值的3倍）
    const richTargets = aliveChars.filter(c => c.money > avgMoney * 3 && c.money > 100);
    
    if (richTargets.length === 0) return;
    
    // 对每个富有的目标，检查是否被抢劫
    richTargets.forEach(target => {
      // 计算被抢劫的基础概率（财富越高，概率越高）
      const wealthRatio = target.money / avgMoney;
      let robberyChance = Math.min(0.3, (wealthRatio - 3) * 0.05); // 最高30%概率
      
      // 每小时检查一次，所以概率要除以60（约1.67%每小时）
      robberyChance = robberyChance / 60;
      
      if (Math.random() < robberyChance) {
        // 尝试抢劫
        this.attemptRobbery(target, aliveChars);
      }
    });
  }
  
  // 尝试抢劫
  attemptRobbery(target: Character, allChars: Character[]) {
    // 找出可能的抢劫者：爱钱且无业的人更容易去抢劫
    const potentialRobbers = allChars.filter(c => 
      c.name !== target.name &&
      !c.isDead &&
      c.hasTrait('money-loving') &&
      !c.job && // 无业
      c.money < target.money * 0.5 // 比目标穷很多
    );
    
    // 如果没有符合条件的，也允许其他无业的人尝试（但概率更低）
    if (potentialRobbers.length === 0) {
      const otherRobbers = allChars.filter(c => 
        c.name !== target.name &&
        !c.isDead &&
        !c.job &&
        c.money < target.money * 0.5
      );
      if (otherRobbers.length === 0) return;
      
      // 非爱钱的人概率更低
      if (Math.random() < 0.3) {
        const robber = choose(otherRobbers);
        this.executeRobbery(robber, target);
      }
    } else {
      // 爱钱且无业的人更可能抢劫
      const robber = choose(potentialRobbers);
      this.executeRobbery(robber, target);
    }
  }
  
  // 执行抢劫
  executeRobbery(robber: Character, target: Character) {
    // 计算抢劫成功概率
    let successChance = 0.5; // 基础成功率50%
    
    // 目标性格和特质影响：易怒且小气的人更不容易被抢劫
    if (target.personality.name === '易怒' && target.hasTrait('stingy')) {
      successChance *= 0.3; // 大幅降低成功率
    } else if (target.personality.name === '易怒') {
      successChance *= 0.6; // 易怒的人不容易被抢
    } else if (target.hasTrait('stingy')) {
      successChance *= 0.7; // 小气的人不容易被抢
    }
    
    // 抢劫者性格影响
    if (robber.personality.name === '勇敢') {
      successChance *= 1.3; // 勇敢的人更容易成功
    } else if (robber.personality.name === '胆小') {
      successChance *= 0.5; // 胆小的人不容易成功
    }
    
    if (Math.random() < successChance) {
      // 抢劫成功
      const robberyAmount = Math.floor(target.money * rand(1, 10) / 100); // 1%到10%
      target.money = Math.max(0, target.money - robberyAmount);
      robber.money += robberyAmount;
      
      // 降低好感度
      if (!target.relationships[robber.name]) {
        target.relationships[robber.name] = { love: 0, status: 'stranger' };
      }
      if (!robber.relationships[target.name]) {
        robber.relationships[target.name] = { love: 0, status: 'stranger' };
      }
      target.relationships[robber.name].love = Math.max(0, target.relationships[robber.name].love - 30);
      robber.relationships[target.name].love = Math.max(0, robber.relationships[target.name].love - 20);
      
      // 降低心情
      target.happiness = Math.max(0, target.happiness - rand(10, 20));
      robber.happiness = Math.min(100, robber.happiness + rand(5, 10));
      
      this.log(`[💰抢劫] **${robber.name}** 成功抢劫了 **${target.name}** 💰${robberyAmount}元！`, 'drama');
    } else {
      // 抢劫失败
      if (!target.relationships[robber.name]) {
        target.relationships[robber.name] = { love: 0, status: 'stranger' };
      }
      if (!robber.relationships[target.name]) {
        robber.relationships[target.name] = { love: 0, status: 'stranger' };
      }
      target.relationships[robber.name].love = Math.max(0, target.relationships[robber.name].love - 10);
      robber.relationships[target.name].love = Math.max(0, robber.relationships[target.name].love - 5);
      
      target.happiness = Math.max(0, target.happiness - rand(3, 8));
      robber.happiness = Math.max(0, robber.happiness - rand(5, 10));
      
      this.log(`[❌抢劫失败] **${robber.name}** 试图抢劫 **${target.name}**，但失败了！`, 'reject');
    }
  }

  // 检查零花钱（针对1-17岁的孩子）
  checkAllowance() {
    this.state.chars.forEach(child => {
      // 只处理1-17岁的孩子
      if (child.age < 1 || child.age > 17) return;
      if (!child.parents) return; // 没有父母信息
      
      // 每小时有10%概率获得零花钱
      if (Math.random() < 0.1) {
        this.giveAllowance(child);
      }
    });
  }
  
  // 给予零花钱
  giveAllowance(child: Character) {
    if (!child.parents) return;
    
    const mother = this.state.chars.find(c => c.name === child.parents!.mother);
    const father = this.state.chars.find(c => c.name === child.parents!.father);
    
    // 优先从母亲那里获得零花钱，如果母亲没钱则从父亲那里
    let giver: Character | null = null;
    if (mother && mother.money > 0) {
      giver = mother;
    } else if (father && father.money > 0) {
      giver = father;
    }
    
    if (giver) {
      const allowance = rand(5, 20); // 零花钱5-20元
      if (giver.money >= allowance) {
        giver.money -= allowance;
        child.money += allowance;
        this.log(`[💰零花钱] **${child.name}** 从 **${giver.name}** 那里获得了 💰${allowance}元零花钱`, 'event');
      }
    }
  }
  
  // 尝试获得零花钱（当孩子没钱时）
  tryGetAllowance(p: Character) {
    if (p.age < 1 || p.age > 17) return; // 只对1-17岁的孩子
    if (!p.parents) return;
    if (p.money >= 20) return; // 已经有足够的钱了
    
    // 每天最多尝试一次
    const lastAllowanceTime = (p as any).lastAllowanceTime || 0;
    const currentDay = Math.floor(this.state.totalDaysPassed);
    const lastAllowanceDay = Math.floor(lastAllowanceTime);
    
    if (currentDay === lastAllowanceDay) return; // 今天已经尝试过了
    
    (p as any).lastAllowanceTime = this.getAbsoluteTime();
    this.giveAllowance(p);
  }

  // 居民离开城镇
  leaveTown(char: Character) {
    // 如果有工作，辞职
    if (char.job) {
      const building = this.state.buildings.find(b => b.id === char.job!.buildingId);
      if (building) {
        const index = building.staff.indexOf(char.name);
        if (index !== -1) {
          building.staff.splice(index, 1);
        }
      }
      char.job = null;
    }
    
    this.log(`[🚪离开] ${char.name} 因为对城镇生活感到不幸福而离开了城镇`, 'event');
    
    // 移除关系
    this.state.chars.forEach(c => {
      if (c.name !== char.name) {
        delete c.relationships[char.name];
      }
    });
    
    // 从角色列表中移除
    const index = this.state.chars.indexOf(char);
    if (index !== -1) {
      this.state.chars.splice(index, 1);
    }
  }

  // 更改旁观者名称
  changeObserverName() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      this.log('❌ 更改旁观者名称功能仅在浏览器环境中可用！', 'error');
      return;
    }
    
    const currentName = this.state.observerName || '';
    const newName = prompt(`请输入新的旁观者名称（当前：${currentName || '未设置'}）：`, currentName);
    
    if (newName === null) {
      // 用户取消了
      return;
    }
    
    const trimmedName = newName.trim();
    if (trimmedName === '') {
      this.log('❌ 旁观者名称不能为空！', 'error');
      return;
    }
    
    if (trimmedName.length > 20) {
      this.log('❌ 旁观者名称不能超过20个字符！', 'error');
      return;
    }
    
    const oldName = this.state.observerName;
    this.state.observerName = trimmedName;
    this.log(`[✏️更改] 旁观者名称已从 "${oldName || '未设置'}" 更改为 "${trimmedName}"`, 'event');
    
    // 自动保存
    this.autoSave();
  }

  // 调试功能：快速跳天数
  jumpDays(days: number) {
    if (days <= 0) {
      this.log('❌ 跳天数必须大于0！', 'error');
      return;
    }
    
    const wasPlaying = this.state.isPlaying;
    this.stop(); // 暂停游戏以确保状态一致
    
    this.log(`⏰ 开始跳过 ${days} 天...`, 'system');
    
    // 记录开始时的天数
    const startDay = this.state.totalDaysPassed;
    const targetDay = startDay + days;
    
    // 逐天推进
    while (this.state.totalDaysPassed < targetDay) {
      // 记录前一天的建筑收入
      this.state.buildings.forEach(building => {
        if (building.isBuilt && building.lastRevenueDay < this.state.totalDaysPassed) {
          const previousTotal = building.revenueHistory.reduce((a, b) => a + b, 0);
          const dailyRevenue = building.totalRevenue - previousTotal;
          if (dailyRevenue >= 0) {
            building.revenueHistory.push(dailyRevenue);
            if (building.revenueHistory.length > 30) {
              building.revenueHistory.shift();
            }
          }
          
          if (building.dailyStaffIncome > 0) {
            building.staffIncomeHistory.push(building.dailyStaffIncome);
            if (building.staffIncomeHistory.length > 30) {
              building.staffIncomeHistory.shift();
            }
            building.dailyStaffIncome = 0;
          } else {
            building.staffIncomeHistory.push(0);
            if (building.staffIncomeHistory.length > 30) {
              building.staffIncomeHistory.shift();
            }
          }
          
          building.lastRevenueDay = this.state.totalDaysPassed;
        }
      });
      
      // 推进到下一天
      this.state.gameDay = (this.state.gameDay + 1) % 7;
      this.state.totalDaysPassed++;
      
      // 触发每日事件
      this.tryAddNewResident();
      this.checkAgeAndDeath();
      this.checkPopulationFlow();
      
      // 每小时事件（简化处理，每天执行24次）
      for (let hour = 0; hour < 24; hour++) {
        this.runElectionsAndHiring();
        
        // 可信度自然恢复
        this.state.chars.forEach(c => {
          if (c.credibility < 50) {
            c.credibility = Math.min(50, c.credibility + 1);
          }
        });
        
        // 检查建筑自动升级
        this.checkAutoUpgrade();
        
        // 检查怀孕进度
        this.checkPregnancyProgress();
        
        // 检查抢劫事件
        this.checkRobbery();
        
        // 检查零花钱
        this.checkAllowance();
      }
    }
    
    // 保持时间在8:00
    this.state.gameTime = 480;
    
    // 恢复游戏运行状态
    if (wasPlaying) {
      this.start();
    }
    
    this.log(`✅ 已跳过 ${days} 天！当前游戏日：第 ${this.state.totalDaysPassed} 天`, 'system');
    
    // 自动保存
    this.autoSave();
  }

  // 创建新角色
  createNewCharacter() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      this.log('❌ 创建角色功能仅在浏览器环境中可用！', 'error');
      return;
    }
    
    const name = prompt("请输入新角色的名称：");
    if (!name || name.trim() === '') {
      return;
    }
    const trimmedName = name.trim();
    
    // 检查名称是否已存在
    if (this.state.chars.find(c => c.name === trimmedName)) {
      this.log("❌ 该名称已存在，请使用其他名称！", 'error');
      return;
    }
    
    // 创建新角色
    const newChar = new Character(trimmedName);
    
    // 为新角色初始化与其他所有角色的关系
    this.state.chars.forEach(c => {
      newChar.relationships[c.name] = { love: 0, status: 'stranger' };
      c.relationships[trimmedName] = { love: 0, status: 'stranger' };
    });
    
    // 多人模式：设置所属城镇
    if (this.isMultiplayerMode && this.currentTownId) {
      newChar.homeTown = this.currentTownId;
      newChar.currentTown = this.currentTownId;
    }
    
    // 添加到角色列表
    this.state.chars.push(newChar);
    
    this.log(`[🎉新居民] 欢迎新邻居 **${trimmedName}** 入住猫果镇！`, 'event');
    
    // 自动保存
    this.autoSave();
  }
}

export const gameInstance = new GameEngine();
