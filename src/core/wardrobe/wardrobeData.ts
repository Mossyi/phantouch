import { normalizePersonalWardrobe, personalCatalog, PersonalWardrobe, PersonalItem, WardrobeLook } from './personalWardrobe';

export interface WardrobeItem {
  id: string;
  name: string;
  category: 'maid' | 'lingerie' | 'dress' | 'cosplay' | 'accessory' | 'casual' | 'formal' | 'traditional' | 'toy';
  avatar: string;
  image: string;
  sourceUrl?: string;
  stylingTips: string[];
  femininityBonus: number; // 娇软指数加成
  description: string;
  hardwareTask: string;    // 推荐搭配的硬件特训
}

export interface DiaryEntry {
  outfitSnapshot?: string[];
  id: string;
  date: string;
  createdAt: number;
  outfitId: string;
  title: string;
  content: string;
  mood: string;
  scene: string;
  tags: string[];
  minutes: number;
  comfort: number;
  confidence: number;
  styleScore: number;
  photo: string;
  favorite: boolean;
  femininityEarned: number;
}

export interface WardrobeDiaryInput {
  outfitId: string;
  title: string;
  content: string;
  mood: string;
  scene: string;
  tags: string[];
  minutes: number;
  comfort: number;
  confidence: number;
  styleScore: number;
  photo?: string;
  favorite?: boolean;
}

export interface WardrobeState extends PersonalWardrobe {
  todayTaskOutfitId: string | null;
  lastDrawDate: string | null;
  totalFemininityScore: number;
  diaries: DiaryEntry[];
  unlockedOutfitIds: string[];
}

export const WARDROBE_ITEMS: WardrobeItem[] = [
  {
    id: 'outfit_maid_classic',
    name: '经典黑白蕾丝女仆裙',
    category: 'maid',
    avatar: '👗',
    image: '/wardrobe/maid-classic.webp',
    stylingTips: ['围裙腰线与裙摆比例保持一短一长', '搭配低跟玛丽珍鞋和简洁发箍'],
    femininityBonus: 25,
    description: '荷叶边围裙搭配蓬蓬内衬与白色发箍，女仆侍奉的最高经典。',
    hardwareTask: '九浅一深 10 档 15 分钟慢速跪侍',
  },
  {
    id: 'outfit_white_silk',
    name: '过膝油亮天鹅绒白丝',
    category: 'lingerie',
    avatar: '🩰',
    image: '/wardrobe/white-silk-stockings.webp',
    stylingTips: ['先确认袜口不勒腿再延长穿着时间', '用米白、奶茶或浅粉保持柔和层次'],
    femininityBonus: 15,
    description: '紧致包裹大腿内侧，丝滑细腻的触感无时无刻不在提醒你的娇柔。',
    hardwareTask: '微流轻抚 20 档全身经络渗透',
  },
  {
    id: 'outfit_cyber_nun',
    name: '银边白袍圣洁修女服',
    category: 'dress',
    avatar: '⛪',
    image: '/wardrobe/silver-nun-outfit.webp',
    stylingTips: ['银色小配饰控制在两件以内', '用挺括长线条营造安静利落感'],
    femininityBonus: 30,
    description: '纯洁神圣的修女长袍配十字念珠，凡俗欲望尽数剥夺。',
    hardwareTask: '圣水洗礼慢灌与禁欲急刹考核',
  },
  {
    id: 'outfit_fox_kimono',
    name: '青丘粉桃灵狐浴衣',
    category: 'cosplay',
    avatar: '🦊',
    image: '/wardrobe/fox-kimono-outfit.webp',
    stylingTips: ['腰带主色从浴衣花纹中选取', '发饰与手袋只保留一个视觉重点'],
    femininityBonus: 35,
    description: '半露香肩的淡粉和服浴衣，身后配有毛茸茸的白狐大尾巴。',
    hardwareTask: '灵尾慢速深旋与狐火温润脉冲',
  },
  {
    id: 'outfit_bell_collar',
    name: '纯银双铃铛锁骨项圈',
    category: 'accessory',
    avatar: '🔔',
    image: '/wardrobe/bell-choker.webp',
    stylingTips: ['项链长度与领口至少错开两指', '铃铛作为唯一动态配饰避免堆叠'],
    femininityBonus: 10,
    description: '一举一动都会发出清脆铃铛响，时刻督促你的端庄与服从。',
    hardwareTask: '端庄慢行 10 分钟铃铛不响考验',
  },
  {
    id: 'outfit_lolita_pink',
    name: '甜系草莓洛丽塔蓬蓬裙',
    category: 'dress',
    avatar: '🎀',
    image: '/wardrobe/pink-lolita-dress.webp',
    stylingTips: ['复杂裙摆搭配简洁鞋袜平衡重心', '蝴蝶结集中在头部或腰部其中一处'],
    femininityBonus: 28,
    description: '繁复的多层蕾丝蛋糕裙摆与蝴蝶结，宛如八音盒里的人偶。',
    hardwareTask: '静音感官塞嵌入与猫步仪态特训',
  },
  {
    id: 'outfit_corset_tight',
    name: '维多利亚 18 英寸紧身胸衣',
    category: 'accessory',
    avatar: '⛓️',
    image: '/wardrobe/victorian-corset.webp',
    stylingTips: ['以能自然呼吸和坐下为合身标准', '外搭柔软衬衫削弱过强的舞台感'],
    femininityBonus: 30,
    description: '将腰线束缚至极致纤细，带来无法抗拒的被支配安全感。',
    hardwareTask: '锯齿波抗压与绝对耐受磨砺',
  },
  {
    id: 'outfit_succubus_leather',
    name: '漆皮魅魔紧身短裙与恶魔角',
    category: 'cosplay',
    avatar: '😈',
    image: '/wardrobe/succubus-costume.webp',
    stylingTips: ['漆皮只保留一个主单品', '用哑光丝袜或短靴平衡反光材质'],
    femininityBonus: 40,
    description: '暗红反光漆皮，搭配灵巧的爱心恶魔尾巴与尖角发箍。',
    hardwareTask: '20 档超频风暴全速榨干考核',
  },
  {
    id: 'outfit_pink_pearl_slip', name: '珍珠肩带柔粉缎面裙', category: 'formal', avatar: '🩷',
    image: '/wardrobe/pink-pearl-satin-dress.webp',
    stylingTips: ['珍珠肩带已经足够醒目，耳饰选择小尺寸', '用灰粉披肩增加层次并照顾温度'],
    femininityBonus: 24, description: '柔粉缎面和珍珠肩带构成克制的正式感，适合晚餐与室内拍照。', hardwareTask: '镜前转身与坐姿练习 8 分钟',
  },
  {
    id: 'outfit_white_minimal', name: '奶油白极简连衣裙', category: 'formal', avatar: '🤍',
    image: '/wardrobe/white-dress.webp', sourceUrl: 'https://www.pexels.com/photo/photo-of-a-white-dress-5450671/',
    stylingTips: ['用一件金色或棕色配饰增加温度', '保持鞋面干净并让裙长露出脚踝'],
    femininityBonus: 20, description: '干净剪裁与奶油白配色，适合第一次尝试偏柔和的正式造型。', hardwareTask: '自然步态与裙摆整理练习 10 分钟',
  },
  {
    id: 'outfit_black_evening', name: '黑色长袖极简晚装', category: 'formal', avatar: '🖤',
    image: '/wardrobe/black-minimal-evening-gown.webp',
    stylingTips: ['用红唇或金属耳饰制造单一焦点', '检查肩线与袖长，避免整体显得沉重'],
    femininityBonus: 22, description: '简洁黑色轮廓兼顾力量感和优雅，适合晚间活动与室内写真。', hardwareTask: '站姿与慢转身镜前练习 8 分钟',
  },
  {
    id: 'outfit_summer_lace', name: '夏日白蕾丝与玫瑰短裤', category: 'casual', avatar: '🌤️',
    image: '/wardrobe/summer-flatlay.webp', sourceUrl: 'https://www.pexels.com/photo/flat-lay-of-a-woman-s-clothes-and-accessories-5405644/',
    stylingTips: ['上紧下松或上松下紧，保持轮廓平衡', '丝巾颜色与短裤同色系更容易协调'],
    femininityBonus: 16, description: '白色蕾丝上衣、玫瑰色短裤和丝巾组成轻松的夏日层次。', hardwareTask: '户外自然步态与拍照角度练习',
  },
  {
    id: 'outfit_casual_knit', name: '针织上衣与牛仔日常搭配', category: 'casual', avatar: '🧶',
    image: '/wardrobe/casual-flatlay.webp', sourceUrl: 'https://www.pexels.com/photo/flat-lay-of-clothing-and-accessories-3927390/',
    stylingTips: ['针织上衣前摆轻塞入裤腰强调比例', '鞋包选择同一深浅范围避免杂乱'],
    femininityBonus: 12, description: '柔软针织与牛仔构成低门槛日常造型，适合通勤和第一次外出尝试。', hardwareTask: '自然坐姿与外出步态练习 15 分钟',
  },
  {
    id: 'outfit_street_sneaker', name: '奶咖街头运动混搭', category: 'casual', avatar: '👟',
    image: '/wardrobe/sneaker-flatlay.webp', sourceUrl: 'https://www.pexels.com/photo/stylish-essentials-flat-lay-with-sneakers-31078822/',
    stylingTips: ['运动鞋与上衣至少有一个呼应色', '首饰保持轻量，避免与耳机和眼镜竞争'],
    femininityBonus: 14, description: '高帮运动鞋、金色小首饰与奶咖色单品组成轻松现代的街头感。', hardwareTask: '节奏步态与肩颈放松练习 10 分钟',
  },
  {
    id: 'outfit_yellow_summer', name: '明黄度假配饰套装', category: 'accessory', avatar: '🌻',
    image: '/wardrobe/yellow-accessories.webp', sourceUrl: 'https://www.pexels.com/photo/flat-lay-of-yellow-summer-fashion-accessories-32641994/',
    stylingTips: ['全身只保留一到两处明黄', '搭配白色基础款让配饰成为焦点'],
    femininityBonus: 13, description: '明黄帽子、手袋与凉鞋为基础款快速加入明亮的度假气息。', hardwareTask: '配饰取舍与镜前构图练习 6 分钟',
  },
  {
    id: 'outfit_kimono_autumn', name: '秋枫珊瑚花纹和服', category: 'traditional', avatar: '🍁',
    image: '/wardrobe/coral-autumn-kimono.webp',
    stylingTips: ['披肩与腰带使用低饱和中性色', '步幅缩小并保持衣襟线条平整'],
    femininityBonus: 26, description: '珊瑚粉花纹、白色腰带与柔软披肩组成适合秋季的传统层次。', hardwareTask: '小步行走与转身整理练习 10 分钟',
  },
  {
    id: 'outfit_rose_city', name: '玫粉泡袖都市连衣裙', category: 'dress', avatar: '🌹',
    image: '/wardrobe/rose-puff-sleeve-dress.webp',
    stylingTips: ['泡袖已有体积，发型和手袋保持简洁', '鞋跟高度以能稳定行走十分钟为准'],
    femininityBonus: 21, description: '鲜明玫粉和泡袖轮廓适合派对、拍照与需要一点勇气的场合。', hardwareTask: '稳定步态与自信表情练习 10 分钟',
  },
  {
    id: 'outfit_pearl_accessories', name: '珍珠与丝巾轻奢配饰组', category: 'accessory', avatar: '📿',
    image: '/wardrobe/accessories-flatlay.webp', sourceUrl: 'https://www.pexels.com/photo/various-women-s-fashion-accessories-2986445/',
    stylingTips: ['珍珠、丝巾、墨镜三选二', '从衣服已有颜色中选丝巾主色'],
    femininityBonus: 11, description: '用珍珠、丝巾和小型首饰让已有基础衣物快速获得完整造型。', hardwareTask: '三套配饰减法搭配对比练习',
  },
  {
    id: 'outfit_soft_lounge', name: '奶白柔软居家套装', category: 'lingerie', avatar: '☁️',
    image: '/wardrobe/soft-lounge-set.webp',
    stylingTips: ['优先选择亲肤、透气和不勒肤的面料', '用同色系发带或袜子提升完整度'],
    femininityBonus: 10, description: '强调舒适与亲肤感的奶白居家组合，适合放松和记录真实穿着体验。', hardwareTask: '呼吸放松与舒适度观察 15 分钟',
  },
  {
    id: 'outfit_monochrome_photo', name: '黑白摄影棚造型', category: 'cosplay', avatar: '🎬',
    image: '/wardrobe/white-minimal.webp', sourceUrl: 'https://www.pexels.com/photo/women-wearing-white-dress-6013981/',
    stylingTips: ['黑白造型靠材质差异制造层次', '先试侧光，再调整站姿和手部位置'],
    femininityBonus: 18, description: '以黑白对比和干净线条为核心的镜头造型，适合双人或个人写真。', hardwareTask: '三种站姿与侧光拍照练习',
  },
  {
    id: 'outfit_royal_blue_evening', name: '皇家蓝缎面晚礼服', category: 'formal', avatar: '💙',
    image: '/wardrobe/royal-blue-satin-gown.webp',
    stylingTips: ['蓝色礼服搭配银色小耳饰更显清爽', '保持肩颈舒展，手袋选择低饱和色'],
    femininityBonus: 25, description: '饱和皇家蓝与流畅缎面形成醒目但克制的正式造型。', hardwareTask: '镜前站姿与落座礼仪练习 10 分钟',
  },
  {
    id: 'outfit_gothic_street', name: '黑蕾丝哥特街拍装', category: 'dress', avatar: '🕯️',
    image: '/wardrobe/black-lace-gothic-dress.webp',
    stylingTips: ['蕾丝与颈饰只保留一个复杂焦点', '鞋包使用哑光黑避免整体反光过多'],
    femininityBonus: 23, description: '黑色蕾丝、颈饰和利落轮廓组成适合夜间街拍的哥特风格。', hardwareTask: '三种侧身构图与表情练习',
  },
  {
    id: 'outfit_victorian_chapel', name: '维多利亚黑金古典礼服', category: 'traditional', avatar: '🖤',
    image: '/wardrobe/victorian-black-gold-gown.webp',
    stylingTips: ['黑金主色已经丰富，首饰选择细小款', '大裙摆行走时缩短步幅并注意台阶'],
    femininityBonus: 29, description: '黑金刺绣与古典廓形营造庄重、戏剧化的历史感。', hardwareTask: '小步行走与裙摆整理练习 8 分钟',
  },
  {
    id: 'outfit_blue_princess', name: '蓝宝石公主舞会装', category: 'cosplay', avatar: '👑',
    image: '/wardrobe/blue-princess-gown.webp',
    stylingTips: ['皇冠与项链避免同时使用大尺寸款', '用银灰披肩降低大面积蓝色的饱和感'],
    femininityBonus: 27, description: '蓝宝石色长裙搭配轻量头饰，适合舞会与公主题材写真。', hardwareTask: '提裙转身与镜头定点练习',
  },
  {
    id: 'outfit_gothic_blazer', name: '暗黑西装与蕾丝内搭', category: 'casual', avatar: '♠️',
    image: '/wardrobe/gothic-blazer.webp',
    stylingTips: ['西装硬朗时用柔软蕾丝平衡材质', '裤装与短裙二选一并保持腰线清晰'],
    femininityBonus: 18, description: '利落黑西装加入少量蕾丝细节，兼顾通勤与暗黑个性。', hardwareTask: '通勤步态与坐姿整理练习 12 分钟',
  },
  {
    id: 'outfit_rose_cocktail', name: '玫瑰粉鸡尾酒短裙', category: 'dress', avatar: '🍸',
    image: '/wardrobe/rose-cocktail-dress.webp',
    stylingTips: ['短裙搭配低跟鞋更适合长时间活动', '耳饰选择珍珠或银色小圈其中一种'],
    femininityBonus: 20, description: '柔粉短裙和简洁肩线适合聚会、约会与室内灯光拍摄。', hardwareTask: '稳定步态与自然微笑练习 8 分钟',
  },
  {
    id: 'outfit_ivory_tea', name: '象牙白下午茶套装', category: 'formal', avatar: '🫖',
    image: '/wardrobe/ivory-tea-outfit.webp',
    stylingTips: ['象牙白搭配焦糖色鞋包增加温度', '选择不透的内搭并在自然光下确认'],
    femininityBonus: 17, description: '象牙白裙装配小型手袋，形成轻松而端正的下午茶造型。', hardwareTask: '落座、起身与手袋摆放练习',
  },
  {
    id: 'outfit_autumn_vintage', name: '酒红秋日复古层搭', category: 'casual', avatar: '🍷',
    image: '/wardrobe/autumn-vintage-layer.webp',
    stylingTips: ['酒红只占全身约三分之一更耐看', '用棕色皮鞋和同色腰带完成呼应'],
    femininityBonus: 15, description: '酒红针织与咖色配饰组成适合秋季日常外出的复古层次。', hardwareTask: '两套外搭组合对比记录',
  },
  {
    id: 'toy_beginner_plug', name: '新手小号硅胶肛塞', category: 'toy', avatar: '🔻',
    image: '/wardrobe/toy-beginner-plug.webp',
    stylingTips: ['只选带宽大防滑底座的身体安全硅胶款', '充分使用水性润滑，疼痛、麻木或出血立即停止'],
    femininityBonus: 0, description: '用于成人用品清单与体验日记的小号入门款，强调尺寸、润滑和停止信号。', hardwareTask: '仅记录用品与清洁情况，不连接或自动控制硬件',
  },
  {
    id: 'toy_jewel_plug', name: '宽底宝石装饰肛塞', category: 'toy', avatar: '💎',
    image: '/wardrobe/toy-jewel-plug.webp',
    stylingTips: ['确认底座明显宽于主体且没有松动装饰件', '使用前后清洁并完全晾干，不能与他人共用'],
    femininityBonus: 0, description: '偏展示用途的宽底装饰款，可记录材质、重量与实际舒适度。', hardwareTask: '仅记录用品与清洁情况，不连接或自动控制硬件',
  },
  {
    id: 'toy_vibrating_plug', name: '遥控震动宽底肛塞', category: 'toy', avatar: '📳',
    image: '/wardrobe/toy-vibrating-plug.webp',
    stylingTips: ['首次使用先在体外确认档位与急停方式', '从最低档和短时长开始，设备发热或失控立即停用'],
    femininityBonus: 0, description: '带独立控制器的成人震动用品条目，仅作为个人体验与电量维护记录。', hardwareTask: '不接入 APP 硬件授权；使用原厂控制器并保持随时可停',
  },
  {
    id: 'toy_tail_plug', name: '柔软尾巴宽底肛塞', category: 'toy', avatar: '🦊',
    image: '/wardrobe/toy-tail-plug.webp',
    stylingTips: ['检查尾巴连接处牢固且底座可完整握住', '毛绒部分与可插入部分分开清洁并彻底干燥'],
    femininityBonus: 0, description: '适合角色装搭配记录的柔软尾巴款，重点检查连接结构和清洁方式。', hardwareTask: '仅用于造型与日记记录，不连接或自动控制硬件',
  },
  {
    id: 'toy_wand_massager', name: '静音手持按摩棒', category: 'toy', avatar: '🎙️',
    image: '/wardrobe/toy-wand-massager.webp',
    stylingTips: ['先隔着衣物测试最低档与噪音', '避免在麻木或破损皮肤上持续使用'],
    femininityBonus: 0, description: '多档手持按摩用品，可记录噪音、续航、握持和不同档位的舒适度。', hardwareTask: '不连接硬件；仅记录原厂档位和个人舒适度',
  },
  {
    id: 'toy_slim_vibrator', name: '柔软硅胶细身震动器', category: 'toy', avatar: '🌷',
    image: '/wardrobe/toy-slim-vibrator.webp',
    stylingTips: ['确认表面完整无裂纹并选择水性润滑', '从最低档开始，清洁前先关闭电源并遵循防水等级'],
    femininityBonus: 0, description: '轻量细身硅胶款，适合记录握持、噪音、档位和清洁便利性。', hardwareTask: '不接入 APP 硬件授权；使用原厂控制器',
  },
  {
    id: 'toy_pelvic_balls', name: '渐进式盆底训练球', category: 'toy', avatar: '⚪',
    image: '/wardrobe/toy-pelvic-balls.webp',
    stylingTips: ['训练以短时长和无疼痛为前提，不追求负重', '若有盆底疾病、术后或孕产相关情况先咨询医生'],
    femininityBonus: 0, description: '用于盆底感知训练记录的不同重量套装，不替代医疗康复建议。', hardwareTask: '仅记录训练时长和舒适度，不连接硬件',
  },
  {
    id: 'toy_cleaning_kit', name: '成人用品清洁收纳套装', category: 'toy', avatar: '🫧',
    image: '/wardrobe/toy-cleaning-kit.webp',
    stylingTips: ['按材质说明清洁，电子部件遵循标注的防水等级', '每件用品独立干燥收纳并定期检查裂纹和异味'],
    femininityBonus: 0, description: '包含无香清洁用品、独立收纳袋与水性润滑的维护清单。', hardwareTask: '不连接硬件；记录清洁日期、外观检查与电量维护',
  },
];

const createDefaultWardrobeState = (): WardrobeState => ({
  customItems: [], looks: [], ownership: {},
  todayTaskOutfitId: null,
  lastDrawDate: null,
  totalFemininityScore: 100,
  diaries: [],
  unlockedOutfitIds: WARDROBE_ITEMS.map((item) => item.id),
});

export const normalizeWardrobeState = (value: unknown): WardrobeState => {
  const defaults = createDefaultWardrobeState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;

  const parsed = value as Record<string, unknown>;
  const personal = normalizePersonalWardrobe(parsed, WARDROBE_ITEMS);
  const validOutfitIds = new Set(personalCatalog(personal, WARDROBE_ITEMS, true).map(item => item.id));
  const diaries: DiaryEntry[] = [];
  const seenDiaryIds = new Set<string>();

  if (Array.isArray(parsed.diaries)) {
    for (const [index, candidate] of parsed.diaries.slice(0, 365).entries()) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const entry = candidate as Record<string, unknown>;
      if (typeof entry.content !== 'string' || !entry.content.trim()) continue;
      if (typeof entry.outfitId !== 'string' || !validOutfitIds.has(entry.outfitId)) continue;

      const storedId = typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ? entry.id : '';
      let id = storedId || `diary-recovered-${index}`;
      if (seenDiaryIds.has(id)) id = `diary-recovered-${index}`;
      seenDiaryIds.add(id);
      const rawMinutes = typeof entry.minutes === 'number' ? entry.minutes : Number(entry.minutes);
      const rawEarned = typeof entry.femininityEarned === 'number'
        ? entry.femininityEarned
        : Number(entry.femininityEarned);
      const createdAtValue = Number(entry.createdAt);
      const date = typeof entry.date === 'string' && entry.date.trim()
        ? entry.date.trim().slice(0, 100)
        : '未知时间';
      const safeRating = (rating: unknown, fallback = 3) => {
        const numeric = Number(rating);
        return Number.isFinite(numeric) ? Math.max(1, Math.min(5, Math.round(numeric))) : fallback;
      };
      const photo = typeof entry.photo === 'string'
        && entry.photo.length <= 800_000
        && (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(entry.photo) || /^https?:\/\//i.test(entry.photo))
        ? entry.photo
        : '';
      const tags = Array.isArray(entry.tags)
        ? [...new Set(entry.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim().slice(0, 20))
          .filter(Boolean))].slice(0, 8)
        : [];

      diaries.push({
        ...(Array.isArray(entry.outfitSnapshot) ? { outfitSnapshot: entry.outfitSnapshot.filter((name): name is string => typeof name === 'string').slice(0, 12).map(name => name.slice(0, 100)) } : {}),
        id,
        date,
        createdAt: Number.isFinite(createdAtValue)
          ? Math.max(0, Math.min(8_640_000_000_000_000, Math.round(createdAtValue)))
          : 0,
        outfitId: entry.outfitId,
        title: typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim().slice(0, 80)
          : `${date} 的穿搭记录`,
        content: entry.content.trim().slice(0, 4000),
        mood: typeof entry.mood === 'string' ? entry.mood.trim().slice(0, 100) : '',
        scene: typeof entry.scene === 'string' ? entry.scene.trim().slice(0, 40) : '日常练习',
        tags,
        minutes: Number.isFinite(rawMinutes) ? Math.max(0, Math.min(1440, Math.round(rawMinutes))) : 0,
        comfort: safeRating(entry.comfort),
        confidence: safeRating(entry.confidence),
        styleScore: safeRating(entry.styleScore),
        photo,
        favorite: entry.favorite === true,
        femininityEarned: Number.isFinite(rawEarned) ? Math.max(0, Math.min(1000, Math.round(rawEarned))) : 0,
      });
    }
  }

  const rawScore = typeof parsed.totalFemininityScore === 'number'
    ? parsed.totalFemininityScore
    : Number(parsed.totalFemininityScore);
  const unlockedOutfitIds = Array.isArray(parsed.unlockedOutfitIds)
    ? [...new Set(parsed.unlockedOutfitIds.filter(
        (id): id is string => typeof id === 'string' && validOutfitIds.has(id),
      ))]
    : defaults.unlockedOutfitIds;

  return {
    ...personal,
    todayTaskOutfitId: typeof parsed.todayTaskOutfitId === 'string' && validOutfitIds.has(parsed.todayTaskOutfitId)
      ? parsed.todayTaskOutfitId
      : null,
    lastDrawDate: typeof parsed.lastDrawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastDrawDate)
      ? parsed.lastDrawDate
      : null,
    totalFemininityScore: Number.isFinite(rawScore)
      ? Math.max(0, Math.min(1_000_000, Math.round(rawScore)))
      : defaults.totalFemininityScore,
    diaries,
    unlockedOutfitIds,
  };
};

export class WardrobeEngine {
  private static instance: WardrobeEngine;

  private state: WardrobeState = createDefaultWardrobeState();
  private persistedState = JSON.stringify(this.state);

  private constructor() {
    this.load();
  }

  static getInstance(): WardrobeEngine {
    if (!WardrobeEngine.instance) {
      WardrobeEngine.instance = new WardrobeEngine();
    }
    return WardrobeEngine.instance;
  }

  private load() {
    try {
      const saved = localStorage.getItem('ycy_wardrobe_state');
      if (saved) {
        this.state = normalizeWardrobeState(JSON.parse(saved));
        this.persistedState = JSON.stringify(this.state);
      }
    } catch {}
  }

  private save() {
    try {
      const serialized = JSON.stringify(this.state);
      localStorage.setItem('ycy_wardrobe_state', serialized);
      this.persistedState = serialized;
    } catch {
      this.state = normalizeWardrobeState(JSON.parse(this.persistedState));
      throw new Error('衣橱日记保存失败，本机存储空间可能已满。请删除部分带照片的旧记录后重试。');
    }
  }

  getState(): WardrobeState {
    return {
      ...this.state,
      diaries: this.state.diaries.map((entry) => ({ ...entry, tags: [...entry.tags], ...(entry.outfitSnapshot ? { outfitSnapshot: [...entry.outfitSnapshot] } : {}) })),
      unlockedOutfitIds: [...this.state.unlockedOutfitIds],
      customItems: this.state.customItems.map(i => ({ ...i, stylingTips: [...i.stylingTips] })),
      looks: this.state.looks.map(l => ({ ...l, itemIds: [...l.itemIds] })),
      ownership: { ...this.state.ownership },
    };
  }

  private getLocalDateKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  getItems(includeArchived = false): WardrobeItem[] { return personalCatalog(this.getState(), WARDROBE_ITEMS, includeArchived); }

  savePersonalItem(input: Partial<PersonalItem> & { name: string }): void {
    if (!input.name.trim()) throw new Error('请填写物品名称');
    const id = input.id || `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = this.state.customItems.find(i => i.id === id);
    if (!existing && this.state.customItems.length >= 30) throw new Error('最多保留 30 件个人物品（含归档）；可编辑已有物品');
    const next = normalizePersonalWardrobe({ ...this.state, customItems: [{ ...existing, ...input, id }, ...this.state.customItems.filter(i => i.id !== id)] }, WARDROBE_ITEMS);
    if (!next.customItems.some(i => i.id === id)) throw new Error('物品数据无效');
    this.state = { ...this.state, ...next }; this.save();
  }

  saveLook(input: Partial<WardrobeLook> & { name: string; itemIds: string[] }): void {
    if (!input.name.trim() || !input.itemIds.length || input.itemIds.length > 12) throw new Error('请填写搭配名称并选择 1–12 件物品');
    const id = input.id || `look-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!this.state.looks.some(l => l.id === id) && this.state.looks.length >= 50) throw new Error('最多保留 50 套搭配（含归档）');
    const next = normalizePersonalWardrobe({ ...this.state, looks: [{ ...input, id }, ...this.state.looks.filter(l => l.id !== id)] }, WARDROBE_ITEMS);
    if (!next.looks.some(l => l.id === id)) throw new Error('选择的物品已不存在');
    this.state = { ...this.state, ...next }; this.save();
  }

  setOwnership(id: string, status: 'owned' | 'wanted' | ''): void {
    if (![...WARDROBE_ITEMS, ...this.state.customItems].some(i => i.id === id)) throw new Error('物品不存在');
    const ownership = { ...this.state.ownership }; if (status) ownership[id] = status; else delete ownership[id];
    this.state = { ...this.state, ownership }; this.save();
  }

  private outfitSnapshot(id: string): string[] {
    const look = this.state.looks.find(l => l.id === id), items = this.getItems(true);
    return (look ? look.itemIds : [id]).map(itemId => items.find(i => i.id === itemId)?.name || '未知物品');
  }

  drawTodayOutfit(): WardrobeItem {
    const today = this.getLocalDateKey();
    if (this.state.lastDrawDate === today && this.state.todayTaskOutfitId) {
      const item = WARDROBE_ITEMS.find((i) => i.id === this.state.todayTaskOutfitId);
      if (item) return item;
    }

    const candidates = WARDROBE_ITEMS.filter((candidate) => candidate.category !== 'toy');
    const idx = Math.floor(Math.random() * candidates.length);
    const item = candidates[idx];
    this.state.todayTaskOutfitId = item.id;
    this.state.lastDrawDate = today;
    this.save();
    return item;
  }

  addDiary(input: WardrobeDiaryInput): DiaryEntry {
    const outfit = this.getItems().find((i) => i.id === input.outfitId);
    if (!outfit) throw new Error('所选装扮不存在');
    const safeMinutes = Number.isFinite(input.minutes) ? Math.max(0, Math.min(1440, Math.round(input.minutes))) : 0;
    const safeContent = typeof input.content === 'string' ? input.content.trim().slice(0, 4000) : '';
    if (!safeContent) throw new Error('日记内容不能为空');
    const styleScore = this.safeRating(input.styleScore);
    const bonus = outfit.category === 'toy'
      ? 0
      : outfit.femininityBonus + Math.min(safeMinutes * 2, 50) + styleScore * 2;
    const now = Date.now();

    const newDiary: DiaryEntry = {
      outfitSnapshot: this.outfitSnapshot(outfit.id),
      id: `diary_${now}`,
      date: new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      createdAt: now,
      outfitId: outfit.id,
      title: this.safeText(input.title, `${outfit.name}${outfit.category === 'toy' ? '体验记录' : '穿搭'}`, 80),
      content: safeContent,
      mood: this.safeText(input.mood, '平静', 100),
      scene: this.safeText(input.scene, '日常练习', 40),
      tags: this.safeTags(input.tags),
      minutes: safeMinutes,
      comfort: this.safeRating(input.comfort),
      confidence: this.safeRating(input.confidence),
      styleScore,
      photo: this.safePhoto(input.photo),
      favorite: input.favorite === true,
      femininityEarned: bonus,
    };

    this.state.diaries = [newDiary, ...this.state.diaries].slice(0, 365);
    this.state.totalFemininityScore = Math.min(1_000_000, this.state.totalFemininityScore + bonus);
    this.save();
    return newDiary;
  }

  updateDiary(id: string, input: WardrobeDiaryInput): DiaryEntry {
    const existing = this.state.diaries.find((entry) => entry.id === id);
    if (!existing) throw new Error('要编辑的日记不存在');
    const outfit = this.getItems(true).find((item) => item.id === input.outfitId);
    if (!outfit) throw new Error('所选装扮不存在');
    const content = this.safeText(input.content, '', 4000);
    if (!content) throw new Error('日记内容不能为空');

    const updated: DiaryEntry = {
      ...existing,
      outfitSnapshot: existing.outfitId === input.outfitId ? existing.outfitSnapshot || this.outfitSnapshot(outfit.id) : this.outfitSnapshot(outfit.id),
      outfitId: outfit.id,
      title: this.safeText(input.title, `${outfit.name}${outfit.category === 'toy' ? '体验记录' : '穿搭'}`, 80),
      content,
      mood: this.safeText(input.mood, '平静', 100),
      scene: this.safeText(input.scene, '日常练习', 40),
      tags: this.safeTags(input.tags),
      minutes: Number.isFinite(input.minutes) ? Math.max(0, Math.min(1440, Math.round(input.minutes))) : 0,
      comfort: this.safeRating(input.comfort),
      confidence: this.safeRating(input.confidence),
      styleScore: this.safeRating(input.styleScore),
      photo: this.safePhoto(input.photo),
      favorite: input.favorite === true,
    };
    this.state.diaries = this.state.diaries.map((entry) => entry.id === id ? updated : entry);
    this.save();
    return { ...updated };
  }

  deleteDiary(id: string): boolean {
    const next = this.state.diaries.filter((entry) => entry.id !== id);
    if (next.length === this.state.diaries.length) return false;
    this.state.diaries = next;
    this.save();
    return true;
  }

  toggleFavorite(id: string): DiaryEntry | null {
    const existing = this.state.diaries.find((entry) => entry.id === id);
    if (!existing) return null;
    const updated = { ...existing, favorite: !existing.favorite };
    this.state.diaries = this.state.diaries.map((entry) => entry.id === id ? updated : entry);
    this.save();
    return { ...updated };
  }

  private safeRating(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.min(5, Math.round(numeric))) : 3;
  }

  private safeText(value: unknown, fallback: string, maxLength: number): string {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
  }

  private safeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim().slice(0, 20))
      .filter(Boolean))].slice(0, 8);
  }

  private safePhoto(photo: unknown): string {
    if (typeof photo !== 'string' || photo.length > 800_000) return '';
    return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(photo) || /^https?:\/\//i.test(photo) ? photo : '';
  }
}
