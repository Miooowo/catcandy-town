export interface Product {
  id: string;
  name: string;
  price: number;
}

export interface BuildingBlueprint {
  id: string;
  name: string;
  cost: number;
  desc: string;
  effect: string; // romance, chaos, fun, ntr, marriage, medical, contraceptive
  price: number; // 已废弃，保留用于兼容性，现在使用products
  open: number; // 营业开始时间 (小时)
  close: number; // 营业结束时间 (小时)
  jobs: string[]; // 岗位列表
  closedDays?: number[]; // 休息日 (0=周日, 1=周一...)
  products?: Product[]; // 商品列表
}

export const BUILDINGS_BLUEPRINT: BuildingBlueprint[] = [
  { 
    id: "park", name: "🌳 中心公园", cost: 200, desc: "免费休闲，适合约会", effect: "romance",
    price: 0, open: 0, close: 24, jobs: [], products: [] 
  },
  { 
    id: "bar", name: "🍺 深夜酒吧", cost: 500, desc: "酒后乱性，消费较高", effect: "chaos",
    price: 0, open: 18, close: 2, jobs: ["老板", "大厨", "跑堂"], closedDays: [0], // 周日休息
    products: [
      { id: "star_beer", name: "星星啤酒", price: 15 },
      { id: "starglow_beer", name: "星耀啤酒", price: 15 },
      { id: "battle_beer", name: "搏单啤酒", price: 18 },
      { id: "turia_beer", name: "图里亚啤酒", price: 18 },
      { id: "gin_tonic", name: "金汤力", price: 56 },
      { id: "cuba_libre", name: "古巴达", price: 56 }
    ]
  },
  { 
    id: "hotel", name: "🏩 快捷酒店", cost: 800, desc: "懂得都懂", effect: "ntr",
    price: 0, open: 0, close: 24, jobs: ["前台", "保洁"],
    products: [
      { id: "single_room", name: "单人房", price: 50 },
      { id: "double_room", name: "双人房", price: 120 },
      { id: "king_bed", name: "大床房", price: 210 },
      { id: "executive_room", name: "领导标间", price: 350 },
      { id: "suite", name: "高级套房", price: 670 }
    ]
  },
  { 
    id: "church", name: "⛪ 婚礼教堂", cost: 1200, desc: "神圣之地", effect: "marriage",
    price: 0, open: 8, close: 20, jobs: ["神父"], products: [] 
  },
  { id: "cinema", name: "🎬 电影院", cost: 400, desc: "恢复心情快", effect: "fun",
    price: 0, open: 10, close: 24, jobs: ["售票员"],
    products: [
      { id: "japan_action", name: "岛国动作片", price: 50 },
      { id: "hero_save", name: "英雄救世片", price: 40 },
      { id: "green_kids", name: "绿色儿童片", price: 20 },
      { id: "premium_anime", name: "高级动画片", price: 35 }
    ]
  },
  { 
    id: "footshop", name: "💆 神秘洗脚店", cost: 600, desc: "涩情交易场所", effect: "ntr",
    price: 0, open: 0, close: 24, jobs: ["老板"], products: [] 
  },
  { 
    id: "hospital", name: "🏥 医院", cost: 1500, desc: "分娩或堕胎", effect: "medical",
    price: 0, open: 0, close: 24, jobs: ["医生", "护士"], 
    products: [
      { id: "abortion", name: "堕胎手术", price: 1000 },
      { id: "delivery", name: "分娩手术", price: 3000 }
    ]
  },
  { 
    id: "pharmacy", name: "💊 药店", cost: 800, desc: "购买避孕用品", effect: "contraceptive",
    price: 0, open: 8, close: 22, jobs: ["药剂师"],
    products: [
      { id: "birth_control_pills", name: "避孕药", price: 103 }, // 一盒20个
      { id: "contraceptive_patch", name: "避孕贴", price: 75 }, // 一个
      { id: "condoms", name: "避孕套", price: 40 } // 一盒12个
    ]
  }
];
