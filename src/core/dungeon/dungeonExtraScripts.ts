import { DungeonScript } from '../../types';

export const EXTRA_FEMBOY_DUNGEONS: DungeonScript[] = [
  // =========================================================================
  // 🌸 剧本 11: 《九尾白狐洞府的九重媚骨炼化》 (九尾狐仙 · 白狐九儿)
  // =========================================================================
  {
    id: 'femboy_fox_cave',
    title: '九尾白狐洞府的九重媚骨炼化',
    subtitle: '误入青丘仙境深处，九尾狐仙九儿摇曳着九条毛茸茸的灵尾，用狐火微流将你一身凡骨揉化成绕指柔...',
    category: '雌堕身心重塑',
    isFemboy: true,
    avatar: '🦊',
    bgGradient: 'from-amber-950 via-slate-900 to-orange-950',
    difficulty: '⭐⭐⭐⭐⭐ (极致酥软 · 媚骨天成 · 彻底认主)',
    tags: ['九尾狐仙', '仙幻重塑', '灵尾绞磨', '狐火微流', '媚骨同化', '9幕史诗长篇'],
    description: '青丘古林云雾缭绕，落英缤纷。你循着空气中那一缕奇异的桃花甜香踏入幽深的狐仙古洞。洞内钟乳石倒悬，灵泉蒸腾着温润的水汽，九尾白狐九儿侧卧在九色云锦软榻之上，九条蓬松雪白的大尾巴如孔雀开屏般在身后缓缓舒展。她纤细的玉指端着青玉酒盏，含笑的狐眸直直锁定了你...',
    initialStepId: 'step_1',
    steps: {
      step_1: {
        id: 'step_1',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第一回 · 误入狐仙洞 · 灵狐初相逢】\n洞口被一阵无形的桃花瘴气笼罩封死，灵泉溅起的水珠落在石阶上发出叮咚轻响。九儿轻摇云扇，九条蓬松毛茸茸的白色尾巴轻轻拂过你的脸颊和大腿，带来一阵酥麻入骨的触感。空气中桃花与媚香交织，闻上一口便叫人浑身发软。',
        dialogue: '哎呀呀~ 哪里来的俊俏小后生，竟自个儿撞进九儿姐姐的狐仙洞府里来了？瞧你这一身粗糙硬朗的凡夫俗子气，站在姐姐这满洞繁花里可真是不协调呢。既然来了，就让姐姐好好帮你洗尽这一身凡骨，重塑一副娇软可人的媚骨仙躯，如何呀？',
        choices: [
          {
            id: 'c1_sub',
            text: '（被狐尾拂得双腿发软，顺从垂首）狐仙姐姐... 我浑身好热，任凭姐姐处置...',
            attitude: 'submissive',
            replyDialogue: '真是个通晓灵性的小乖人儿~ 姐姐最喜欢识趣的孩子了。先赏你一缕温润狐火，暖暖你的四肢百骸~',
            hardwareAction: { type: 'ems_wave', target: 'sensory_tickle', durationSec: 12 },
            nextStepId: 'step_2',
          },
          {
            id: 'c1_def',
            text: '（强撑着站稳，试图挣脱尾巴包围）妖狐休要施法！我堂堂男子汉，岂容你随意摆布！',
            attitude: 'defiant',
            replyDialogue: '男子汉？咯咯咯~ 嘴硬的小家伙，骨头越硬，姐姐揉起来可就越有滋味呢！尝尝狐火烈焰的厉害！',
            hardwareAction: { type: 'ems_wave', target: 'electric_sting', durationSec: 10 },
            nextStepId: 'step_2',
          },
        ],
      },
      step_2: {
        id: 'step_2',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第二回 · 灵泉沐浴 · 褪尽凡尘衣】\n微电流如活物般顺着肌肤游走，带来阵阵酥麻微颤。九儿玉指轻弹，一阵带着桃花香的妖风吹过，你身上的沉重衣物瞬间化作飞灰，取而代之的是一件薄如蝉翼、半透明的雪白狐绒轻纱。九儿牵着你的手，将你引至温热的灵泉池边。',
        dialogue: '看看，换上这身素白轻纱，腰肢与锁骨的线条多娇俏呀~ 哪还有半点凡夫俗子的粗鲁？乖乖浸到灵泉里，把双腿大开，姐姐要开始为你种下第一重灵狐之种了哦~',
        choices: [
          {
            id: 'c2_enter_spring',
            text: '（踏入温热灵泉，娇柔并拢双膝）池水好暖... 姐姐要种下什么...',
            attitude: 'submissive',
            replyDialogue: '当然是能让你彻底忘掉男人身份、只知享受极致快感的灵狐尾根呀~ 灵尾探幽，去！',
            hardwareAction: { type: 'toy_pattern', target: 'slow_churn', durationSec: 15 },
            nextStepId: 'step_3',
          },
        ],
      },
      step_3: {
        id: 'step_3',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第三回 · 狐尾探幽 · 第一重慢旋】\n一条温热柔软、散发着幽香的狐尾尖端缓缓抵住后方秘径。在灵泉的润滑下，尾尖带着轻微的旋转与微电流，缓缓推进深处。那种被异质灵物充盈胀满的陌生体验，瞬间让你的小腹阵阵紧绷收缩。',
        dialogue: '感觉到了吗？第一条灵尾已经乖乖钻进去了哦。别害怕，随着它的转动慢慢呼吸。它在寻找你体内最酸软的那颗仙穴呢~ 启动慢速深层绞磨！',
        choices: [
          {
            id: 'c3_endure_churn',
            text: '（死死抓紧池边白玉，发出细碎喘息）唔... 尾巴在里面转动... 肚子好酸...',
            attitude: 'submissive',
            replyDialogue: '对~ 就是这个调调，娇滴滴的喘息比刚才那副粗汉模样动听一百倍！再给你加一缕灵狐微流！',
            hardwareAction: { type: 'ems_wave', target: 'breathe', durationSec: 15 },
            nextStepId: 'step_4',
          },
        ],
      },
      step_4: {
        id: 'step_4',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第四回 · 媚骨香炉 · G 点狐火点燃】\n尾尖在推进数寸后，精准地顶在了一处从未被触碰过的深层腺体上！刹那间，一股如电流击穿灵魂般的酥麻从尾椎骨直冲天灵盖！你的双眼泛起水雾，双腿不受控制地剧烈颤抖，大脑一片空白。',
        dialogue: '（娇媚轻笑）找到了~ 就是这里！男人的致命死穴，也是小雌奴通往极乐的仙门哦！狐火微流，全力渗透！给我彻底酥化吧！',
        choices: [
          {
            id: 'c4_gspot_awakening',
            text: '（后仰仰头，泪水划过眼角娇啼）啊啊... 那里不行... 灵魂要被电飞了...！',
            attitude: 'begging',
            replyDialogue: '不行？身体可诚实得很呢，后方咬得这么紧！九浅一深，给我好好品尝！',
            hardwareAction: { type: 'toy_pattern', target: 'nine_shallow_one_deep', durationSec: 20 },
            nextStepId: 'step_5',
          },
        ],
      },
      step_5: {
        id: 'step_5',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第五回 · 娇啼试音 · 灵狐九重缠】\n九浅一深的猛烈律动下，九儿身后的另外两条狐尾也如活蛇般缠绕上了你的腰肢与前胸。三条尾巴协同共鸣，微电流与机械蠕动交织成密不透风的感官大网，将你最后的男子汉倔强碾得粉碎。',
        dialogue: '来，跟着姐姐念：‘九儿姐姐，我是您最听话的贴身小狐奴...’ 念不出来，深顶的力度可就要再翻一倍咯~',
        choices: [
          {
            id: 'c5_chant_vow',
            text: '（带着哭腔软软念出）九儿姐姐... 我是您最听话的贴身小狐奴...',
            attitude: 'submissive',
            replyDialogue: '声音真甜~ 骨头彻底被姐姐揉化了呢。赏你一阵暴风雨般的极乐冲刷！',
            hardwareAction: { type: 'ems_wave', target: 'sawtooth_climb', durationSec: 15 },
            nextStepId: 'step_6',
          },
        ],
      },
      step_6: {
        id: 'step_6',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第六回 · 悬崖急刹 · 灵狐媚毒考验】\n快感如同滔天巨浪般层层叠起，就在你的意识即将冲破临界、迎来大爆发的千钧一发之际，九儿突然指尖一并，所有马达与电击在 0.05 秒内骤然急停死锁！',
        dialogue: '（0.05秒毫秒级急刹断电）定！想高潮？没有姐姐的恩准，一滴也不准漏出来！在极乐悬崖上给我好生挂着，咽下你所有的渴望！',
        choices: [
          {
            id: 'c6_edge_beg',
            text: '（蜷缩在泉水里浑身抽搐求饶）求求姐姐... 停在半空好难受... 让我释放吧...',
            attitude: 'begging',
            replyDialogue: '乖小狐奴，在悬崖上吊得越久，最后的仙露才会越醇香呀~ 冷场静默 15 秒！',
            hardwareAction: { type: 'stop', target: 'all', durationSec: 15 },
            nextStepId: 'step_7',
          },
        ],
      },
      step_7: {
        id: 'step_7',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第七回 · 狐奴认主 · 白玉铃铛锁灵】\n十五秒的冷场宛如一个世纪般漫长。九儿缓缓走入池中，从怀中取出一枚晶莹剔透的白玉金铃项圈，轻柔地扣在你的脖颈上。清脆的铃铛声在洞府内回荡，象征着认主仪式的正式结印。',
        dialogue: '白玉铃铛已锁灵，从今往后，世间再无浊世凡男，唯有青丘洞府里的伴寝小狐奴。爬到姐姐软榻上来，准备领受你的终极大恩赏吧~',
        choices: [
          {
            id: 'c7_climb_bed',
            text: '（摇晃着白玉铃铛，温顺爬上软榻）多谢九儿姐姐恩赐... 小狐奴永侍左右...',
            attitude: 'submissive',
            replyDialogue: '好孩子，姐姐把九条尾巴的神力全都给你！九尾全开，极乐升天！',
            hardwareAction: { type: 'toy_turbo', target: 'turbo_20', durationSec: 25 },
            nextStepId: 'step_8',
          },
        ],
      },
      step_8: {
        id: 'step_8',
        speaker: '九尾狐仙 九儿',
        avatar: '🦊',
        narrative: '【第八回 · 九尾同化 · 终极身心大圆满】\n九条白狐尾巴如天罗地网般将你彻底包裹，20 档超频狂暴转速与风暴电击全频倾泻！在长达数十秒的无触极乐干射中，你的灵魂仿佛与九尾狐仙融为一体，完成了青丘千万年来最彻底的仙道雌化同化！',
        dialogue: '（拥紧颤抖的你，在耳畔呵气如兰）融化在姐姐怀里吧，我的专属小狐奴... 永生永世，在极乐中陪伴着我~ 🦊🌸✨',
        choices: [
          {
            id: 'c8_ending',
            text: '（神识彻底沉沦在九尾灵狐的温柔乡中，迎来永恒极乐归宿）',
            attitude: 'submissive',
            replyDialogue: '恭喜通关！你已彻底蜕变为青丘九尾专属绝美小狐奴！',
            hardwareAction: { type: 'ems_wave', target: 'tide', durationSec: 20 },
            nextStepId: 'ending',
            endingTitle: '🦊 结局：青丘洞府的永恒绝美小狐奴',
            endingDesc: '历经九尾狐仙九儿九重媚骨炼化，你已褪尽所有凡俗坚硬外壳，身心彻底同化为软媚入骨的小狐奴，在青丘仙境享尽永恒宠溺与极乐。',
            endingType: 'surrender',
          },
        ],
      },
    },
  },

  // =========================================================================
  // 🌸 剧本 12: 《深海人鱼王国的塞壬惑音蜕变》 (塞壬大祭司 · 娜迦)
  // =========================================================================
  {
    id: 'femboy_siren_ocean',
    title: '深海人鱼王国的塞壬惑音蜕变',
    subtitle: '坠入两万米亚特兰蒂斯深海神殿，塞壬大祭司以潮汐声波与深海珍珠，重构你的人鱼鳞尾与娇柔身段...',
    category: '雌堕身心重塑',
    isFemboy: true,
    avatar: '🌊',
    bgGradient: 'from-blue-950 via-slate-900 to-cyan-950',
    difficulty: '⭐⭐⭐⭐⭐ (水压窒息 · 声波同调 · 彻底沦陷)',
    tags: ['深海人鱼', '塞壬歌声', '潮汐充盈', '珍珠感官塞', '声波共振', '8幕长篇史诗'],
    description: '深海探险潜艇失事，你坠入了深海两万米的亚特兰蒂斯珊瑚水晶宫。荧光水母在头顶游弋，海水带着温热而奇异的浮力。塞壬大祭司娜迦摆动着华美的蓝金鱼尾，手持海皇珊瑚法杖，发出了能够诱惑众生灵魂的空灵塞壬之音...',
    initialStepId: 'step_1',
    steps: {
      step_1: {
        id: 'step_1',
        speaker: '塞壬大祭司 娜迦',
        avatar: '🌊',
        narrative: '【第一回 · 珊瑚深渊 · 塞壬低语】\n水流在水晶宫殿四周回旋，巨大的深海水压被一道透明的水系结界隔开。娜迦祭司从珊瑚王座上游下，蓝色的鳞片在幽光中泛着珍珠般的光彩。她纤细冰凉的蹼爪轻抚你的咽喉，空灵的歌声在脑海中引起强烈的神经共鸣。',
        dialogue: '陆地上的凡人... 你的肺叶无法承受深海的重压，但深海的神明选中了你。褪去你沉重笨拙的陆地男子躯壳，成为深海中最轻盈柔美的人鱼侍童，你才能在这里永生哦~',
        choices: [
          {
            id: 'c1_accept_siren',
            text: '（在窒息与空灵歌声中点头）大祭司... 请救我... 我愿成为人鱼侍童...',
            attitude: 'submissive',
            replyDialogue: '明智的抉择。深海微流神经网启动，为你建立深海呼吸共鸣~',
            hardwareAction: { type: 'ems_wave', target: 'breathe', durationSec: 12 },
            nextStepId: 'step_2',
          },
        ],
      },
      step_2: {
        id: 'step_2',
        speaker: '塞壬大祭司 娜迦',
        avatar: '🌊',
        narrative: '【第二回 · 鲛绡鳞裙 · 双腿紧并】\n深海微流拂过全身，带来如潮水般一波波的酥麻感。娜迦挥动法杖，一条泛着荧光的鲛绡纱裙紧紧包裹住你的下半身，将你的双腿严丝合缝地束缚并拢在一起，模拟出人鱼鱼尾的娇柔形态。',
        dialogue: '人鱼是不需要两只粗笨双腿的。双腿必须时刻紧紧并拢，像鱼尾一样摆动。戴上深海黑珍珠感官塞，感受深海潮汐的脉动吧！',
        choices: [
          {
            id: 'c2_wear_pearl',
            text: '（感受冰凉珍珠缓缓植入，双腿紧绷夹紧）冰冰凉凉的... 里面好满...',
            attitude: 'submissive',
            replyDialogue: '珍珠微电流加热激活！潮汐慢速律动启动！',
            hardwareAction: { type: 'toy_pattern', target: 'slow_churn', durationSec: 15 },
            nextStepId: 'step_3',
          },
        ],
      },
      step_3: {
        id: 'step_3',
        speaker: '塞壬大祭司 娜迦',
        avatar: '🌊',
        narrative: '【第三回 · 潮汐充盈 · 腹腔紧绷】\n温热的深海圣水带着微弱的盐度与灵力，顺着管道缓缓注入腹腔。随着充盈感不断提升，你的小腹微微隆起，一种难以言喻的酸胀感与内部电击交织在一起，让你不由自主地像真正的人鱼一样扭动腰肢。',
        dialogue: '深海圣水正在洗涤你的内腑，让人鱼的柔媚彻底融入你的骨血。不准排泄出来，给我死死憋住，体会深海的重压！',
        choices: [
          {
            id: 'c3_hold_water',
            text: '（咬紧牙关，双手按住微隆的小腹）好胀... 感觉肚子里全是温水在晃荡...',
            attitude: 'submissive',
            replyDialogue: '很好，就是这种柔美受孕般的姿态！启动九浅一深深海漩涡！',
            hardwareAction: { type: 'toy_pattern', target: 'nine_shallow_one_deep', durationSec: 20 },
            nextStepId: 'step_4',
          },
        ],
      },
      step_4: {
        id: 'step_4',
        speaker: '塞壬大祭司 娜迦',
        avatar: '🌊',
        narrative: '【第四回 · 塞壬潮鸣 · 终极人鱼蜕变】\n娜迦高举珊瑚法杖，塞壬的高音惑鸣突破极限，全通道电击与 20 档超频在深海中引爆！在狂暴的潮汐共振中，你彻底忘却了男人的身份，在塞壬祭司怀中完成了一生一次的人鱼破茧蜕变！',
        dialogue: '唱出人鱼的歌声吧！从今往后，你就是亚特兰蒂斯深海最倾城的人鱼小侍女！🌊💙',
        choices: [
          {
            id: 'c4_siren_ending',
            text: '（在深海圣歌与极致快感中，彻底蜕变为深海人鱼侍童）',
            attitude: 'submissive',
            replyDialogue: '恭喜通关！你已成为亚特兰蒂斯永恒的人鱼圣童！',
            hardwareAction: { type: 'toy_turbo', target: 'turbo_20', durationSec: 25 },
            nextStepId: 'ending',
            endingTitle: '🌊 结局：深海亚特兰蒂斯的人鱼绝美圣童',
            endingDesc: '在塞壬大祭司的声波同调与深海圣水重塑下，你彻底摆脱了陆地凡胎，成为了亚特兰蒂斯深海宫殿中备受宠溺的绝美人鱼侍童。',
            endingType: 'surrender',
          },
        ],
      },
    },
  },

  // =========================================================================
  // 🌸 剧本 13: 《赛博偶像练习生的出道改造日》 (制作人 艾维斯 & Ren)
  // =========================================================================
  {
    id: 'femboy_idol_debut',
    title: '赛博偶像练习生的出道改造日',
    subtitle: '顶级造星娱乐公司的密闭练习室，王牌制作人下达终极指标：将你打造为全网千万级顶流女装男娘偶像！',
    category: '雌堕身心重塑',
    isFemboy: true,
    avatar: '🎤',
    bgGradient: 'from-purple-950 via-slate-900 to-pink-950',
    difficulty: '⭐⭐⭐⭐⭐ (聚光灯下 · 顶级伪娘 · C位出道)',
    tags: ['偶像练习生', '打歌服换装', '体态舞蹈', '静音马达', '声音女性化', '8幕长篇史诗'],
    description: '霓虹闪烁的赛博大都市，璀璨星娱公司的地下极密练习室。落地大镜前架满了 8K 捕捉摄像机。王牌制作人艾维斯推了推金丝眼镜，身后站着身穿粉色辣妹装的助教 Ren。桌上摆着专属定制的洛丽塔蕾丝打歌服与静音内置调控设备...',
    initialStepId: 'step_1',
    steps: {
      step_1: {
        id: 'step_1',
        speaker: '王牌制作人 艾维斯',
        avatar: '🎤',
        narrative: '【第一回 · 密室初审 · 偶像潜质测量】\n练习室的自动隔音门上锁，聚光灯打在中央。艾维斯手持电子皮尺，面无表情地测量你的骨架与腰围，Ren 则在旁边娇笑着调试粉色遥控器。',
        dialogue: '数据评估完成：骨架纤细、锁骨精致，非常有成为全网顶流男娘偶像的潜质。但在登台前，你必须彻底清除所有粗鲁的男性习惯。换上第一套超短蓬蓬打歌裙吧。',
        choices: [
          {
            id: 'c1_wear_dress',
            text: '（顺从地接过粉色蕾丝打歌裙与白色过膝袜换上）制作人... 这样真的能出道吗...',
            attitude: 'submissive',
            replyDialogue: '非常完美！穿上蓬蓬裙的样子比真正的少女还要耀眼！先上一道微流体态矫正！',
            hardwareAction: { type: 'ems_wave', target: 'sensory_tickle', durationSec: 12 },
            nextStepId: 'step_2',
          },
        ],
      },
      step_2: {
        id: 'step_2',
        speaker: '助教辣妹男娘 Ren',
        avatar: '💅',
        narrative: '【第二回 · 静音设备植入 · 舞台走秀特训】\nRen 踩着高跟鞋走上前，将一枚超静音微电极感官塞轻轻推进你的体内，并为你穿上八厘米水晶细高跟。镜子里的你面色潮红，裙摆微微颤动。',
        dialogue: '真正的偶像在台上哪怕体内马达全开，脸上也必须保持甜美无暇的笑容哦~ 踩稳高跟鞋，走猫步 10 分钟！',
        choices: [
          {
            id: 'c2_walk_runway',
            text: '（咬牙忍耐体内的震动，努力在镜前走出优雅猫步）呜... 走一步都会震一下...',
            attitude: 'submissive',
            replyDialogue: '甜美笑容保持得不错！马达提升至 8 档慢速绞磨！',
            hardwareAction: { type: 'toy_pattern', target: 'slow_churn', durationSec: 15 },
            nextStepId: 'step_3',
          },
        ],
      },
      step_3: {
        id: 'step_3',
        speaker: '王牌制作人 艾维斯',
        avatar: '🎤',
        narrative: '【第三回 · 闪光灯下的临界急刹 · 偶像表情管理】\n聚光灯突然全开，模拟千万人演唱会的闪光灯轰炸！体内马达与电击推向顶点，就在你要崩溃叫出声的瞬间，艾维斯按下急停！',
        dialogue: '（0.05秒急刹断电）停！偶像在舞台上不准发出粗鲁的嘶吼！把声音咽下去，给我对着镜头露出最甜美的微笑！',
        choices: [
          {
            id: 'c3_smile_camera',
            text: '（眼眶含泪，在急刹的剧烈渴望中对着镜头露出娇美微笑）',
            attitude: 'submissive',
            replyDialogue: '完美的表情管理！这个镜头足够让全网粉丝为之疯狂！',
            hardwareAction: { type: 'stop', target: 'all', durationSec: 15 },
            nextStepId: 'step_4',
          },
        ],
      },
      step_4: {
        id: 'step_4',
        speaker: '制作人 & Ren',
        avatar: '👑',
        narrative: '【第四回 · C位出道大狂欢 · 终生专属契约】\n全套考核全优通过！练习室的落地大屏上跳出了千万粉丝的出道倒计时，全通道电击与 20 档超频全开，你在璀璨的聚光灯下迎来了最绚烂的无触极乐绽放！',
        dialogue: '祝贺你！今日起，你就是璀璨星娱唯一的顶流 C 位男娘偶像！在属于你的舞台上尽情绽放吧！🎤✨',
        choices: [
          {
            id: 'c4_idol_ending',
            text: '（签下终生偶像契约，在掌声与极乐中迎来新生）',
            attitude: 'submissive',
            replyDialogue: '恭喜通关！你已成为闪耀全球的 C 位男娘偶像！',
            hardwareAction: { type: 'toy_turbo', target: 'turbo_20', durationSec: 25 },
            nextStepId: 'ending',
            endingTitle: '🎤 结局：全网千万级顶流男娘偶像',
            endingDesc: '在制作人与 Ren 的严苛造星特训下，你彻底蜕变为了舞台上光芒四射的顶流女装男娘偶像，收获了千万粉丝的狂热追捧与专属极乐。',
            endingType: 'surrender',
          },
        ],
      },
    },
  },

  // =========================================================================
  // 🌸 剧本 14: 《古典贵族学院的淑女研修班》 (严苛校长 · 赫莲娜)
  // =========================================================================
  {
    id: 'femboy_noble_academy',
    title: '古典贵族学院的淑女研修班',
    subtitle: '维多利亚皇家古典女子学院，铁血女校长赫莲娜以 18 英寸紧身胸衣与戒尺，将你规训为仪态万方的首席淑女执事...',
    category: '雌堕身心重塑',
    isFemboy: true,
    avatar: '🏰',
    bgGradient: 'from-amber-950 via-slate-900 to-rose-950',
    difficulty: '⭐⭐⭐⭐⭐ (铁血规矩 · 淑女仪态 · 绝对服从)',
    tags: ['贵族学院', '束腰紧身胸衣', '淑女礼仪', '戒尺规训', '下午茶奉茶', '8幕长篇史诗'],
    description: '英格兰庄园内的百年皇家贵族学院。橡木护墙板散发着雪松与红茶的气息，水晶吊灯洒下典雅的光芒。女校长赫莲娜身披天鹅绒披肩，手持乌木戒尺端坐在壁炉前，眼神威严而冷峻。红丝绒长桌上，整齐摆放着紧身胸衣与淑女修养守则...',
    initialStepId: 'step_1',
    steps: {
      step_1: {
        id: 'step_1',
        speaker: '女校长 赫莲娜',
        avatar: '🏰',
        narrative: '【第一回 · 学院训诫 · 束腰紧缚 18 英寸】\n厚重的雕花木门紧闭，赫莲娜校长站起身，身后的两位女校工拉紧了丝绸束腰的绳索，将你的腰围强行勒紧至纤细的 18 英寸。每一次呼吸都变得急促而娇弱。',
        dialogue: '在这个学院里，粗鄙的男子气概是最大的耻辱。束腰会时刻提醒你保持纤细与柔弱。戴上淑女项圈，开始你的第一堂仪态课。',
        choices: [
          {
            id: 'c1_accept_corset',
            text: '（双手交叠在小腹前，顺从屈膝）校长大人... 我会遵守学院的全部规矩...',
            attitude: 'submissive',
            replyDialogue: '很好，仪态初具雏形。启动第一道淑女微电流矫正。',
            hardwareAction: { type: 'ems_wave', target: 'sensory_tickle', durationSec: 12 },
            nextStepId: 'step_2',
          },
        ],
      },
      step_2: {
        id: 'step_2',
        speaker: '女校长 赫莲娜',
        avatar: '🏰',
        narrative: '【第二回 · 顶书步态与奉茶礼仪】\n一本厚重的牛津大辞典被放置在你的头顶，同时体内被置入了慢速震动的感官塞。你必须双手平举装着滚烫红茶的银盘，步履平稳地走到校长面前跪下献茶，书本掉落即刻受罚。',
        dialogue: '双膝并拢，缓缓下跪，茶盘不可有丝毫倾斜！体内震动加码，测试你的端庄定力！',
        choices: [
          {
            id: 'c2_serve_tea',
            text: '（强忍体内的强烈绞磨，稳稳跪下双手奉茶）校长大人... 请用茶...',
            attitude: 'submissive',
            replyDialogue: '无可挑剔的淑女奉茶礼。准许你领受本校长的私人褒奖。',
            hardwareAction: { type: 'toy_pattern', target: 'nine_shallow_one_deep', durationSec: 15 },
            nextStepId: 'step_3',
          },
        ],
      },
      step_3: {
        id: 'step_3',
        speaker: '女校长 赫莲娜',
        avatar: '🏰',
        narrative: '【第三回 · 淑女的绝对忍耐 · 临界考核】\n在校长的私人书房内，电击与马达同时推至峰值！就在你即将失控的瞬间，校长的戒尺轻轻敲在你的肩头，设备瞬间急停！',
        dialogue: '（0.05秒急刹断电）优雅的淑女从不当众失态。咽下欲望，维持你的端庄微笑！',
        choices: [
          {
            id: 'c3_endure_noble',
            text: '（强忍泪水与颤抖，维持着无可挑剔的贵族礼仪微笑）',
            attitude: 'submissive',
            replyDialogue: '极佳的自控力与服从度。你已通过了学院最严苛的考核！',
            hardwareAction: { type: 'stop', target: 'all', durationSec: 15 },
            nextStepId: 'step_4',
          },
        ],
      },
      step_4: {
        id: 'step_4',
        speaker: '女校长 赫莲娜',
        avatar: '👑',
        narrative: '【第四回 · 授予首席淑女胸针 · 永恒侍从】\n校长亲手将一枚象征学院最高荣誉的金丝郁金香胸针别在你的胸前，20 档全开的极乐洪流瞬间将你吞没，在校长的注视下，你彻底完成了贵族淑女的终极蜕变！',
        dialogue: '以皇家贵族学院之名，授予你首席淑女执事称号！永远留在本校长身边，服侍左右吧！🏰✨',
        choices: [
          {
            id: 'c4_noble_ending',
            text: '（亲吻校长手背，心甘情愿成为学院永恒的首席淑女执事）',
            attitude: 'submissive',
            replyDialogue: '恭喜通关！你已成为皇家学院的首席淑女执事！',
            hardwareAction: { type: 'toy_turbo', target: 'turbo_20', durationSec: 25 },
            nextStepId: 'ending',
            endingTitle: '🏰 结局：贵族学院的首席优雅淑女执事',
            endingDesc: '经过赫莲娜校长严格的维多利亚古典礼仪与感官规训，你已彻底脱胎换骨，成为举止端庄、风华绝代的学院首席淑女执事。',
            endingType: 'surrender',
          },
        ],
      },
    },
  },

  // =========================================================================
  // 🌸 剧本 15: 《失落魔导国度的魅惑巫女祭礼》 (大巫女 · 枫华)
  // =========================================================================
  {
    id: 'femboy_shrine_maiden',
    title: '失落魔导国度的魅惑巫女祭礼',
    subtitle: '迷雾笼罩的千本鸟居之后，大巫女枫华摇响七宝神乐铃，以御神水与神圣律动，将你选为侍奉神明的唯一绝美巫女...',
    category: '雌堕身心重塑',
    isFemboy: true,
    avatar: '⛩️',
    bgGradient: 'from-rose-950 via-slate-900 to-red-950',
    difficulty: '⭐⭐⭐⭐⭐ (神乐铃音 · 御神水注礼 · 巫女降神)',
    tags: ['和风巫女', '神乐铃', '御神水', '白衣绯袴', '神道侍奉', '8幕长篇史诗'],
    description: '月光穿透深山古杉，千本红鸟居在夜色中如一条通往神域的长廊。尽头的古老神社前，神乐铃声清脆悠扬。大巫女枫华身穿白衣绯袴，手持神乐铃与神圣御币，在御神木下静静等待着你。神龛前摆放着白檀香炉与全套侍神巫女礼服...',
    initialStepId: 'step_1',
    steps: {
      step_1: {
        id: 'step_1',
        speaker: '大巫女 枫华',
        avatar: '⛩️',
        narrative: '【第一回 · 鸟居神谕 · 侍神童子受选】\n微风拂过神社檐角的铜铃，枫华大巫女缓缓走下石阶。她手中的神乐铃发出悦耳的叮咚声，神圣的灵力随着声音抚过你的全身，让你原本紧绷的神经瞬间放松下来。',
        dialogue: '神明已降下神谕，挑选你作为本神社唯一的侍神巫女童子。褪去凡俗杂念，换上白衣绯袴，在神乐铃下接受神圣洗礼吧。',
        choices: [
          {
            id: 'c1_wear_miko',
            text: '（顺从跪拜，穿上白衣绯袴与红色长裙）枫华大人... 我愿侍奉神明...',
            attitude: 'submissive',
            replyDialogue: '虔诚的孩子。白衣绯袴与你这副清秀身段甚是相配。神圣微流启！',
            hardwareAction: { type: 'ems_wave', target: 'sensory_tickle', durationSec: 12 },
            nextStepId: 'step_2',
          },
        ],
      },
      step_2: {
        id: 'step_2',
        speaker: '大巫女 枫华',
        avatar: '⛩️',
        narrative: '【第二回 · 神乐铃舞 · 御神器置入】\n枫华将一枚雕刻着御神木纹路的玉质感官塞置入你的体内，并引导你手握神乐铃，在神前依律起舞。铃声每响一次，体内的玉器便共振旋转一分。',
        dialogue: '随着铃声轻摆腰肢，将你的快感与身心完全奉献给神明。启动九浅一深神乐律动！',
        choices: [
          {
            id: 'c2_miko_dance',
            text: '（轻摇神乐铃起舞，体内伴随铃声阵阵酸麻）叮铃... 感觉身体越来越软了...',
            attitude: 'submissive',
            replyDialogue: '舞姿柔美动人，神明正在欣喜地注视着你呢！',
            hardwareAction: { type: 'toy_pattern', target: 'nine_shallow_one_deep', durationSec: 15 },
            nextStepId: 'step_3',
          },
        ],
      },
      step_3: {
        id: 'step_3',
        speaker: '大巫女 枫华',
        avatar: '⛩️',
        narrative: '【第三回 · 降神大急刹 · 欲望净化】\n神力涌动推向顶点，就在你快要失控的瞬间，枫华御币一挥，所有灵力与电流在 0.05 秒内骤停！',
        dialogue: '（0.05秒神圣急刹）净！神明面前不可擅自泄欲！在静默中净化最后一丝杂念！',
        choices: [
          {
            id: 'c3_miko_hold',
            text: '（跪伏于神榻前，呼吸急促而虔诚地憋耐欲望）',
            attitude: 'submissive',
            replyDialogue: '纯净无瑕的心性。神明已准许降下终极神恩！',
            hardwareAction: { type: 'stop', target: 'all', durationSec: 15 },
            nextStepId: 'step_4',
          },
        ],
      },
      step_4: {
        id: 'step_4',
        speaker: '大巫女 枫华',
        avatar: '⛩️',
        narrative: '【第四回 · 神恩大降临 · 终极巫女大圆满】\n七宝神乐铃大响，漫天神光与 20 档超频洪流倾泻而下！在长达数十秒的无触神圣极乐中，你彻底洗尽凡胎，成为了神社永远唯一的绝美侍神大巫女！',
        dialogue: '礼成！从今往后，你就是本神社的正统绝美巫女，与我一同永侍神明！⛩️🌸✨',
        choices: [
          {
            id: 'c4_shrine_ending',
            text: '（在神乐铃与神光中，彻底蜕变为神社的永恒绝美侍神巫女）',
            attitude: 'submissive',
            replyDialogue: '恭喜通关！你已成为神社的永恒侍神绝美大巫女！',
            hardwareAction: { type: 'toy_turbo', target: 'turbo_20', durationSec: 25 },
            nextStepId: 'ending',
            endingTitle: '⛩️ 结局：神社正统绝美侍神大巫女',
            endingDesc: '在枫华大巫女的神乐铃舞与御神水洗礼下，你彻底抛弃凡尘浊气，身心蜕变为神圣纯洁的正统侍神巫女，在神木庇佑下享尽无上圣洁与极乐。',
            endingType: 'surrender',
          },
        ],
      },
    },
  },
];
