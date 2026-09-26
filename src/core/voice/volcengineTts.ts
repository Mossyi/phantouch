export const VOLCENGINE_TTS_VOICE_PRESETS = [
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小何 2.0', gender: '女声', category: '通用' },
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: '男声', category: '通用' },
  { id: 'zh_male_taocheng_uranus_bigtts', name: '小天 2.0', gender: '男声', category: '通用' },
  { id: 'zh_male_liufei_uranus_bigtts', name: '刘飞 2.0', gender: '男声', category: '通用' },
  { id: 'zh_female_sophie_uranus_bigtts', name: '魅力苏菲 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_qingxinnvsheng_uranus_bigtts', name: '清新女声 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_cancan_uranus_bigtts', name: '知性灿灿 2.0', gender: '女声', category: '角色' },
  { id: 'zh_female_sajiaoxuemei_uranus_bigtts', name: '撒娇学妹 2.0', gender: '女声', category: '角色' },
  { id: 'zh_female_tianmeixiaoyuan_uranus_bigtts', name: '甜美小源 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0', gender: '女声', category: '通用' },
  { id: 'zh_female_peiqi_uranus_bigtts', name: '佩奇猪 2.0', gender: '女声', category: '配音' },
  { id: 'zh_female_linjianvhai_uranus_bigtts', name: '邻家女孩 2.0', gender: '女声', category: '通用' },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0', gender: '男声', category: '通用' },
  { id: 'zh_male_sunwukong_uranus_bigtts', name: '猴哥 2.0', gender: '男声', category: '配音' },
  { id: 'zh_female_yingyujiaoxue_uranus_bigtts', name: 'Tina老师 2.0', gender: '女声', category: '教育' },
  { id: 'zh_female_kefunvsheng_uranus_bigtts', name: '暖阳女声 2.0', gender: '女声', category: '客服' },
  { id: 'zh_female_xiaoxue_uranus_bigtts', name: '儿童绘本 2.0', gender: '女声', category: '阅读' },
  { id: 'zh_male_dayi_uranus_bigtts', name: '大壹 2.0', gender: '男声', category: '配音' },
  { id: 'zh_female_mizai_uranus_bigtts', name: '黑猫咪仔 2.0', gender: '女声', category: '配音' },
  { id: 'zh_female_jitangnv_uranus_bigtts', name: '鸡汤女 2.0', gender: '女声', category: '配音' },
  { id: 'zh_female_meilinvyou_uranus_bigtts', name: '魅力女友 2.0', gender: '女声', category: '通用' },
  { id: 'zh_male_ruyayichen_uranus_bigtts', name: '儒雅逸辰 2.0', gender: '男声', category: '配音' },
] as const;

export type VolcengineTtsVoiceCategory = typeof VOLCENGINE_TTS_VOICE_PRESETS[number]['category'];

export const VOLCENGINE_TTS_VOICE_CATEGORIES = [
  '全部',
  ...Array.from(new Set(VOLCENGINE_TTS_VOICE_PRESETS.map((voice) => voice.category))),
] as const;
