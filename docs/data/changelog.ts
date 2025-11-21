export interface ChangelogEntry {
  version: string;
  date: string;
  added?: string[];
  removed?: string[];
  changed?: string[];
  fixed?: string[];
}

export const GAME_VERSION = '1.0.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2024-01-01',
    added: [
      '游戏初始版本发布',
      '居民系统：支持角色创建、性格设定、特性系统',
      '建筑系统：支持建筑建设、升级、营业时间管理',
      '关系系统：支持友谊、恋爱、婚姻等复杂人际关系',
      '工作系统：支持角色就业、收入统计',
      '日志系统：实时记录游戏事件',
      '存档系统：支持游戏进度保存和加载',
      '暗色模式：支持亮色/暗色主题切换',
      '移动端适配：优化手机浏览器显示效果'
    ]
  }
];

