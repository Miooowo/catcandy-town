import { reactive } from 'vue';
import { Character, Relationship } from './character';
import { Building } from './building';
import { NAMES, DAYS, rand, choose, TRAITS, hasTraitConflict } from '../data/constants';
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
      timeSpeed: 1
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
    
    const saveStr = localStorage.getItem('happyTownV2_Save');
    if (saveStr) {
      const loadResult = this.loadFromJSON(saveStr);
      if (loadResult.success) {
        this.checkAndAddNewChars();
        this.log("📂 读取存档成功！欢迎回来。");
      } else {
        this.log(`⚠️ ${loadResult.message}，已开始新游戏。`, 'error');
        this.initNewGame();
      }
    } else {
      this.initNewGame();
    }
    // 不再需要 renderUIStatic() - Vue 会自动渲染
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
  generateRandomName(): string {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗'];
    const givenNames = ['伟', '芳', '娜', '秀', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '兰', '霞', '平', '刚', '桂', '英'];
    
    // 50% 概率使用单字名，50% 概率使用双字名
    if (Math.random() < 0.5) {
      return surnames[rand(0, surnames.length - 1)] + givenNames[rand(0, givenNames.length - 1)];
    } else {
      return surnames[rand(0, surnames.length - 1)] + givenNames[rand(0, givenNames.length - 1)] + givenNames[rand(0, givenNames.length - 1)];
    }
  }

  // 自动添加新居民（定期调用）
  tryAddNewResident() {
    // 检查是否到了添加新居民的时间
    const daysSinceLastNewChar = this.state.totalDaysPassed - this.lastNewCharDay;
    
    if (daysSinceLastNewChar >= this.newCharInterval) {
      // 尝试从 NAMES 列表中添加
      const availableNames = NAMES.filter(name => !this.state.chars.find(c => c.name === name));
      
      let newName: string;
      if (availableNames.length > 0) {
        // 优先使用 NAMES 列表中的名字
        newName = choose(availableNames);
      } else {
        // NAMES 列表用完了，生成随机名字
        // 确保不重复
        let attempts = 0;
        do {
          newName = this.generateRandomName();
          attempts++;
          if (attempts > 100) {
            // 如果尝试100次都重复，添加数字后缀
            newName = this.generateRandomName() + rand(1, 999);
          }
        } while (this.state.chars.find(c => c.name === newName) && attempts <= 100);
      }
      
      // 创建新角色
      const newChar = new Character(newName);
      
      // 为新角色初始化与其他所有角色的关系
      this.state.chars.forEach(c => {
        newChar.relationships[c.name] = { love: 0, status: 'stranger' };
        c.relationships[newName] = { love: 0, status: 'stranger' };
      });
      
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
    
    // 初始化角色
    this.state.chars = NAMES.map(n => {
      const c = new Character(n);
      // 初始化关系网：所有人都是陌生人
      NAMES.forEach(target => {
        if (target !== n) c.relationships[target] = { love: 0, status: 'stranger' };
      });
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
      
      // TODO: 检查怀孕进度
      // this.checkPregnancyProgress();
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
            c.hasTrait('promiscuous')
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
      localStorage.setItem('happyTownV2_Save', saveData);
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
      lastNewCharDay: this.lastNewCharDay // 保存上次添加新居民的时间
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
            baseSalary: b.baseSalary ?? 10
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
      }
      c.interactingWith = null;
      
      // 如果正在发泄性欲，也会被打断
      if (c.isRelieving) {
        this.handleSexualRelief(c);
      }
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
    let venue: any;
    if (availableVenues.length > 0) {
      const selectedBuilding = choose(availableVenues);
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
    // 特性影响：淫乱特性的居民优先建造神秘洗脚店，喜欢睡觉的居民优先建造快捷酒店
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
    // 特性影响：社交达人更倾向社交，孤僻的人更倾向独处
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
            const catchChance = 0.3;
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
    employee.currentAction = "失业中";
    
    // 清除摸鱼记录
    delete employee.slackingOffCount[building.id];
    
    this.log(`[💼开除] **${bossName}** 开除了 **${employee.name}**，因为他在 **${building.name}** 多次摸鱼被抓！`, 'drama');
    
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
    
    // 特性影响：勤奋的人工作更努力，懒惰和喜欢睡觉的人工作功率减少
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
    
    // 特性影响：建设喜爱的建筑时更快且贡献更多
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
    // 特性学习机制：没有特性的居民在社交中可能学习特性
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
    
    // 特性影响：保守的人不太容易喝多
    if (p.hasTrait('conservative')) {
      drunkChance *= 0.8;
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
      this.log(`[✅清醒] **${p.name}** 酒醒了，恢复了意识。`, 'event');
      return;
    }
    
    // 处理喝晕后的情况
    // 70%概率被其他人带走开房，30%概率睡在马路上
    if (Math.random() < 0.7) {
      // 被其他人带走开房
      const availableChars = this.state.chars.filter(c => 
        c.name !== p.name && 
        !c.isDrunk && 
        !c.interactingWith
      );
      
      if (availableChars.length > 0) {
        const taker = choose(availableChars);
        
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
        
        // 检查是否去酒店开房
        const hotel = this.state.buildings.find(b => b.id === 'hotel' && b.isBuilt);
        if (hotel && hotel.isOpen(Math.floor(this.state.gameTime / 60), this.state.gameDay)) {
          // 去酒店开房
          // 选择房间（随机选择，但需要有钱）
          const rooms = hotel.products || [];
          if (rooms.length > 0) {
            const affordableRooms = rooms.filter(r => taker.money >= r.price);
            if (affordableRooms.length > 0) {
              const selectedRoom = choose(affordableRooms);
              const roomPrice = Math.floor(selectedRoom.price); // 确保价格是整数
              taker.money -= roomPrice;
              
              // 分配收入
              if (hotel.staff.length > 0) {
                this.distributeRevenue(hotel, roomPrice);
                hotel.totalRevenue += roomPrice;
              }
              
              // 可能发生关系（根据性格和特性）
              let intimacyChance = 0.3; // 基础概率30%
              if (p.hasTrait('promiscuous') || taker.hasTrait('promiscuous')) {
                intimacyChance = 0.6; // 淫乱特性概率更高
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
                pRel.love = Math.min(100, pRel.love + rand(5, 10));
                tRel.love = Math.min(100, tRel.love + rand(5, 10));
                
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
                
                this.log(`[🔥开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}，并发生了关系...`, 'drama');
              } else {
                this.log(`[🏨开房] **${taker.name}** 把喝晕的 **${p.name}** 带到了酒店，开了${selectedRoom.name}休息。`, 'event');
              }
              
              p.currentAction = `🍺 被 ${taker.name} 带到酒店`;
              taker.currentAction = `🏨 和 ${p.name} 在酒店`;
              p.interactingWith = taker.name;
              taker.interactingWith = p.name;
            } else {
              // 没钱开房，睡在马路上
              this.handleSleepOnStreet(p);
            }
          } else {
            // 没有房间，睡在马路上
            this.handleSleepOnStreet(p);
          }
        } else {
          // 酒店没开或不存在，睡在马路上
          this.handleSleepOnStreet(p);
        }
      } else {
        // 没有其他人，睡在马路上
        this.handleSleepOnStreet(p);
      }
    } else {
      // 睡在马路上
      this.handleSleepOnStreet(p);
    }
  }
  
  // 处理睡在马路上
  handleSleepOnStreet(p: Character) {
    p.currentAction = '😴 睡在马路上';
    p.happiness = Math.max(0, p.happiness - rand(5, 15)); // 降低心情
    
    // 可能被其他人发现（增加戏剧性）
    if (Math.random() < 0.3) {
      const discoverer = choose(this.state.chars.filter(c => c.name !== p.name));
      if (discoverer) {
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
      // 淫乱特性大幅增加概率
      if (p.hasTrait('promiscuous') || t.hasTrait('promiscuous')) {
        intimacyChance *= 2.5; // 淫乱的人概率翻2.5倍
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
      const saveStr = localStorage.getItem('happyTownV2_Save');
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

  resetData() {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      this.log('❌ 重置功能仅在浏览器环境中可用！', 'error');
      return;
    }
    
    if (confirm('确定要重置游戏吗？所有进度将丢失！')) {
      localStorage.removeItem('happyTownV2_Save');
      this.stop();
      this.initNewGame();
      this.log('🗑 游戏已重置到初始状态', 'info');
      // 重置后自动启动游戏
      setTimeout(() => {
        this.start();
      }, 100);
    }
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
      case '胆小': targetModifier = 10; break; // 胆小的人容易被说服
      case '乐观': targetModifier = 10; break; // 乐观的人容易被说服
      case '保守': targetModifier = -25; break; // 保守的人很难被说服
      case '理性': targetModifier = -20; break; // 理性的人很难被说服
      case '严肃': targetModifier = -15; break; // 严肃的人很难被说服
      case '诚实': targetModifier = -10; break; // 诚实的人不太容易被说服
      case '悲观': targetModifier = -5; break;
      default: targetModifier = 0;
    }
    persuadeChance += targetModifier;

    // 特性影响
    // 说服者的特性
    if (persuader.hasTrait('social')) {
      persuadeChance += 10; // 社交达人更容易说服别人
    }
    if (persuader.hasTrait('impulsive')) {
      persuadeChance += 5; // 冲动的人说服时更直接
    }

    // 被说服者的特性
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
    
    // 添加到角色列表
    this.state.chars.push(newChar);
    
    this.log(`[🎉新居民] 欢迎新邻居 **${trimmedName}** 入住猫果镇！`, 'event');
    
    // 自动保存
    this.autoSave();
  }
}

export const gameInstance = new GameEngine();
