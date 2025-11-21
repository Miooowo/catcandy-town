import { BuildingBlueprint, Product } from '../data/blueprints';

export class Building {
  id: string;
  blueprint: BuildingBlueprint; // 保存蓝图引用
  name: string;
  totalCost: number;
  currentProgress: number;
  isBuilt: boolean;
  effect: string;
  desc: string;
  price: number; // 已废弃，保留用于兼容性
  open: number;
  close: number;
  jobs: string[];
  staff: string[]; // array of char names
  closedDays: number[];
  prostitutes: string[]; // array of char names (for footshop)
  totalRevenue: number; // 总收入
  revenueHistory: number[]; // 每日收入历史（用于计算日均收入）
  staffIncomeHistory: number[]; // 每日员工收入历史（扣除公司账户10%后的90%，用于计算员工日均收入）
  lastRevenueDay: number; // 上次记录收入的游戏日
  dailyStaffIncome: number; // 当天分配给员工的收入（累计）
  companyFunds: number; // 公司账户资金（由老板管理）
  level: number; // 建筑等级（影响最低薪资）
  baseSalary: number; // 基础工资（根据等级计算）
  products: Product[]; // 商品列表

  constructor(blueprint: BuildingBlueprint) {
    this.id = blueprint.id;
    this.blueprint = blueprint; // 保存蓝图引用
    this.name = blueprint.name;
    this.totalCost = blueprint.cost;
    this.currentProgress = 0;
    this.isBuilt = false;
    this.effect = blueprint.effect;
    this.desc = blueprint.desc;
    this.price = 0; // 取消入门费用
    this.open = blueprint.open;
    this.close = blueprint.close;
    this.jobs = blueprint.jobs || [];
    this.staff = [];
    this.closedDays = blueprint.closedDays || [];
    this.prostitutes = [];
    this.totalRevenue = 0;
    this.revenueHistory = [];
    this.staffIncomeHistory = [];
    this.lastRevenueDay = -1;
    this.dailyStaffIncome = 0;
    this.companyFunds = 0;
    this.level = 1; // 初始等级为1
    this.baseSalary = 10; // 初始基础工资
    this.products = blueprint.products || []; // 初始化商品列表
  }

  isOpen(hour: number, day: number): boolean {
    if (!this.isBuilt) return false;
    // 检查休息日
    if (this.closedDays.includes(day)) return false;

    // 检查员工 (如果有岗位需求但没人上班，则不开业)
    // 例外：公园没有岗位，不需要人也能开
    if (this.jobs.length > 0 && this.staff.length === 0) return false;

    if (this.open === 0 && this.close === 24) return true;
    if (this.close < this.open) { // 跨夜，如 18点到凌晨4点
      return hour >= this.open || hour < this.close;
    }
    return hour >= this.open && hour < this.close;
  }
}
