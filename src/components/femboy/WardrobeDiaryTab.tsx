import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Edit3,
  ExternalLink,
  Heart,
  ImagePlus,
  Plus,
  Search,
  Shirt,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  DiaryEntry,
  WardrobeDiaryInput,
  WardrobeEngine,
  WARDROBE_ITEMS,
  WardrobeItem,
} from '../../core/wardrobe/wardrobeData';
import { useAppStore } from '../../store/useAppStore';
import { parseApiBaseUrl } from '../../core/apiBaseUrl';
import { fetchTextWithTimeout } from '../../core/httpClient';
import { PersonalWardrobePanel } from './PersonalWardrobePanel';

const MOODS = ['轻松', '期待', '自信', '害羞', '惊喜', '需要调整'];
const SCENES = ['日常练习', '居家', '约会', '拍照', '派对', '角色扮演', '外出'];
const QUICK_TAGS = ['甜美', '优雅', '可爱', '酷感', '复古', '轻熟', '第一次尝试', '想再次穿'];
const CATEGORY_LABELS: Record<string, string> = {
  all: '全部',
  maid: '女仆',
  lingerie: '贴身',
  dress: '裙装',
  cosplay: '角色装',
  accessory: '配饰',
  casual: '日常',
  formal: '正式',
  traditional: '传统',
  toy: '玩具',
};

type DiaryDraft = WardrobeDiaryInput;

const createDraft = (outfitId = WARDROBE_ITEMS[0].id): DiaryDraft => ({
  outfitId,
  title: '',
  content: '',
  mood: MOODS[0],
  scene: SCENES[0],
  tags: [],
  minutes: 15,
  comfort: 3,
  confidence: 3,
  styleScore: 3,
  photo: '',
  favorite: false,
});

const draftFromEntry = (entry: DiaryEntry): DiaryDraft => ({
  outfitId: entry.outfitId,
  title: entry.title,
  content: entry.content,
  mood: entry.mood || MOODS[0],
  scene: entry.scene || SCENES[0],
  tags: [...entry.tags],
  minutes: entry.minutes,
  comfort: entry.comfort,
  confidence: entry.confidence,
  styleScore: entry.styleScore,
  photo: entry.photo,
  favorite: entry.favorite,
});

const resizeImageForLocalStorage = (file: File, maxLength = 800_000): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('请选择图片文件'));
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    reject(new Error('原图不能超过 10 MB'));
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('读取照片失败'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('图片格式无法识别'));
    image.onload = () => {
      const scale = Math.min(1, (maxLength < 200_000 ? 540 : 900) / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('设备不支持图片压缩'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.78;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > maxLength * 0.94 && quality > 0.35) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > maxLength) {
        reject(new Error('压缩后照片仍过大，请换一张尺寸更小的图片'));
        return;
      }
      resolve(dataUrl);
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
});

const RatingInput: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="rounded-2xl border border-[#eadde2] bg-white px-3 py-2.5">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[11px] font-bold text-[#344054]">{label}</span>
      <span className="text-[10px] font-black text-[#d94d7f]">{value}/5</span>
    </div>
    <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          aria-label={`${score} 分`}
          aria-pressed={score === value}
          onClick={() => onChange(score)}
          className={`h-7 flex-1 rounded-lg text-[11px] font-black transition ${score <= value ? 'bg-[#e96892] text-white' : 'bg-[#f5f6f8] text-[#667085]'}`}
        >
          {score}
        </button>
      ))}
    </div>
  </div>
);

export const WardrobeDiaryTab: React.FC = () => {
  const { llmConfig } = useAppStore();
  const engine = WardrobeEngine.getInstance();
  const [state, setState] = useState(engine.getState());
  const allItems = engine.getItems(true);
  const availableItems = engine.getItems();
  const [todayOutfit, setTodayOutfit] = useState<WardrobeItem | null>(() => {
    const current = engine.getState();
    return current.todayTaskOutfitId
      ? WARDROBE_ITEMS.find((item) => item.id === current.todayTaskOutfitId) || null
      : null;
  });
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DiaryDraft>(() => createDraft());
  const [formError, setFormError] = useState('');
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [isJudging, setIsJudging] = useState(false);
  const [visionReview, setVisionReview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visionRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => visionRequestRef.current?.abort(), []);

  const refresh = () => setState(engine.getState());
  const filteredOutfits = category === 'all'
    ? WARDROBE_ITEMS
    : WARDROBE_ITEMS.filter((item) => item.category === category);
  const filteredDiaries = state.diaries.filter((entry) => {
    if (onlyFavorites && !entry.favorite) return false;
    if (!deferredSearch) return true;
    const outfit = allItems.find((item) => item.id === entry.outfitId);
    return [entry.title, entry.content, entry.mood, entry.scene, ...entry.tags, ...(entry.outfitSnapshot || []), outfit?.name || '']
      .some((value) => value.toLowerCase().includes(deferredSearch));
  });
  const averageStyle = state.diaries.length
    ? (state.diaries.reduce((sum, entry) => sum + entry.styleScore, 0) / state.diaries.length).toFixed(1)
    : '0.0';
  const recentCount = state.diaries.filter((entry) => entry.createdAt > Date.now() - 7 * 86_400_000).length;
  const favoriteCount = state.diaries.filter((entry) => entry.favorite).length;
  const lowComfortCount = state.diaries.filter((entry) => entry.comfort <= 2).length;
  const insight = !state.diaries.length
    ? '完成第一条记录后，这里会根据你的评分给出穿搭复盘。'
    : lowComfortCount > state.diaries.length / 3
      ? '近期低舒适度记录偏多。下次先调整尺码、面料和穿戴时长，再考虑造型完成度。'
      : Number(averageStyle) >= 4
        ? '你的搭配完成度很稳定。可以从相近色过渡到一件对比色配饰，建立更鲜明的个人风格。'
        : '下一次只改变一个变量，例如鞋、发饰或配色，拍照对比会更容易找到适合自己的组合。';

  const openCreate = (outfitId = todayOutfit?.id || WARDROBE_ITEMS[0].id) => {
    setEditingId(null);
    setDraft(createDraft(outfitId));
    setVisionReview('');
    setFormError('');
    setShowEditor(true);
  };

  const openEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setDraft(draftFromEntry(entry));
    setVisionReview('');
    setFormError('');
    setShowEditor(true);
  };

  const closeEditor = () => {
    visionRequestRef.current?.abort();
    setShowEditor(false);
    setEditingId(null);
    setIsJudging(false);
  };

  const saveDiary = () => {
    setFormError('');
    try {
      if (editingId) engine.updateDiary(editingId, draft);
      else engine.addDiary(draft);
      refresh();
      closeEditor();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '日记保存失败');
    }
  };

  const deleteDiary = (entry: DiaryEntry) => {
    if (!window.confirm(`确定删除“${entry.title}”吗？此操作不能撤销。`)) return;
    try {
      engine.deleteDiary(entry.id);
      refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const toggleFavorite = (id: string) => {
    try {
      engine.toggleFavorite(id);
      refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '收藏状态保存失败');
    }
  };

  const handlePhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsReadingPhoto(true);
    setFormError('');
    try {
      const photo = await resizeImageForLocalStorage(file);
      setDraft((current) => ({ ...current, photo }));
      setVisionReview('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '照片处理失败');
    } finally {
      setIsReadingPhoto(false);
    }
  };

  const reviewPhoto = async () => {
    if (!draft.photo) {
      setFormError('请先上传照片或填写图片网址');
      return;
    }
    if (!llmConfig.apiKey) {
      setFormError('请先在【系统设置】中配置支持视觉识别的模型与 API Key');
      return;
    }

    visionRequestRef.current?.abort();
    const controller = new AbortController();
    visionRequestRef.current = controller;
    setIsJudging(true);
    setVisionReview('');
    setFormError('');
    try {
      const rawBaseUrl = parseApiBaseUrl(llmConfig.baseUrl || 'https://api.openai.com/v1');
      if (!rawBaseUrl) throw new Error('视觉 API 地址无效');
      const apiUrl = rawBaseUrl.endsWith('/chat/completions') ? rawBaseUrl : `${rawBaseUrl}/chat/completions`;
      const { response, text } = await fetchTextWithTimeout(apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model || 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `请作为专业穿搭顾问点评这套造型。场景：${draft.scene}；心情：${draft.mood}。用中文给出：1. 两个亮点；2. 一个最值得改进的问题；3. 一条可执行的搭配建议。不要评价身材，不要虚构看不见的细节，控制在180字内。` },
              { type: 'image_url', image_url: { url: draft.photo } },
            ],
          }],
          max_tokens: 350,
        }),
      }, { timeoutMs: 45_000, maxBytes: 2_000_000, timeoutMessage: '视觉点评超过 45 秒' });
      if (!response.ok) throw new Error(`视觉点评请求失败（${response.status}），请确认当前模型支持图片输入`);
      const data = JSON.parse(text);
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('视觉模型没有返回有效点评');
      setVisionReview(reply.trim());
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setFormError(error instanceof Error ? error.message : '视觉点评失败');
    } finally {
      if (visionRequestRef.current === controller) visionRequestRef.current = null;
      setIsJudging(false);
    }
  };

  const drawTodayOutfit = () => {
    try {
      const item = engine.drawTodayOutfit();
      setTodayOutfit(item);
      refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '抽取失败');
    }
  };

  const selectedOutfit = allItems.find((item) => item.id === draft.outfitId) || WARDROBE_ITEMS[0];

  return (
    <div className="space-y-4 pb-4 text-[#263247]">
      <PersonalWardrobePanel engine={engine} state={state} onChange={refresh} onDiary={openCreate} readPhoto={file => resizeImageForLocalStorage(file, 160_000)} />
      <section className="overflow-hidden rounded-[26px] border border-[#f1c4d4] bg-white shadow-[0_12px_36px_rgba(57,32,43,0.08)]">
        <div className="bg-[radial-gradient(circle_at_88%_12%,rgba(233,104,146,0.22),transparent_32%),linear-gradient(135deg,#fff_0%,#fff6f9_100%)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] text-[#d94d7f]">WARDROBE LOG</p>
              <h2 className="mt-1 text-base font-black text-[#1f2937]">我的衣橱日记</h2>
              <p className="mt-1 text-[11px] leading-5 text-[#667085]">记录真正适合你的搭配，而不是只完成一次打卡。</p>
            </div>
            <button type="button" onClick={() => openCreate()} className="flex shrink-0 items-center gap-1 rounded-full bg-[#d94d7f] px-3 py-2 text-[11px] font-black text-white shadow-md active:scale-95">
              <Plus className="h-3.5 w-3.5" /> 新记录
            </button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              ['总记录', state.diaries.length],
              ['近 7 天', recentCount],
              ['平均完成度', averageStyle],
              ['收藏', favoriteCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white bg-white/85 px-2 py-2.5 text-center shadow-sm">
                <div className="text-sm font-black text-[#d94d7f]">{value}</div>
                <div className="mt-0.5 text-[9px] font-bold text-[#667085]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#f3c8d7] bg-[#fff8fa] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {todayOutfit ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
                <img src={todayOutfit.image} alt={todayOutfit.name} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-lg bg-white/90 text-xs shadow-sm">{todayOutfit.avatar}</span>
              </div>
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm">🎲</div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black text-[#d94d7f]">今日搭配灵感</p>
              <h3 className="truncate text-sm font-black text-[#263247]">{todayOutfit?.name || '还没有抽取今日装扮'}</h3>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-[#667085]">{todayOutfit?.description || '随机获得一个衣橱主题，再记录你的真实体验。'}</p>
            </div>
          </div>
          <button type="button" onClick={drawTodayOutfit} className="shrink-0 rounded-xl border border-[#e96892] bg-white px-3 py-2 text-[10px] font-black text-[#d94d7f]">
            {todayOutfit ? '今日结果' : '立即抽取'}
          </button>
        </div>
        {todayOutfit && (
          <button type="button" onClick={() => openCreate(todayOutfit.id)} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white px-3 py-2.5 text-left text-[11px] font-bold text-[#344054] shadow-sm">
            <span>穿过了？用这套装扮写一条日记</span><ChevronRight className="h-4 w-4 text-[#d94d7f]" />
          </button>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between px-1">
          <div><h3 className="flex items-center gap-1.5 text-sm font-black text-[#263247]"><Shirt className="h-4 w-4 text-[#d94d7f]" /> 搭配灵感库</h3><p className="mt-0.5 text-[10px] text-[#667085]">点击任意卡片，直接以它创建记录</p></div>
          <span className="text-[10px] font-bold text-[#98a2b3]">{filteredOutfits.length} 套</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setCategory(id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${category === id ? 'bg-[#263247] text-white' : 'border border-[#dfe3e8] bg-white text-[#667085]'}`}>{label}</button>
          ))}
        </div>
        {category === 'toy' && (
          <div className="rounded-2xl border border-[#f0ccd8] bg-[#fff8fa] px-3 py-2.5 text-[9.5px] leading-4 text-[#7a4257]">
            <strong className="font-black text-[#b93765]">成人用品记录：</strong>仅供成年人管理清洁、材质与舒适度，不参与今日随机搭配或成长计分，也不会自动连接硬件。疼痛、麻木、出血或设备异常时应立即停止。
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {filteredOutfits.map((item) => (
            <button key={item.id} type="button" onClick={() => openCreate(item.id)} className="group overflow-hidden rounded-3xl border border-[#eadde2] bg-white text-left shadow-[0_6px_18px_rgba(48,36,41,0.06)] active:scale-[0.98]">
              <div className="relative h-32 overflow-hidden bg-[#f5f6f8]">
                <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#172033]/80 to-transparent" />
                <span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-xl bg-white/90 text-lg shadow-sm backdrop-blur">{item.avatar}</span>
                {item.category !== 'toy' && <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-black text-[#d94d7f] shadow-sm backdrop-blur">+{item.femininityBonus}</span>}
                <span className="absolute bottom-2 left-2 rounded-full bg-[#263247]/75 px-2 py-1 text-[8px] font-black text-white backdrop-blur">{CATEGORY_LABELS[item.category]}</span>
              </div>
              <div className="p-3">
                <h4 className="line-clamp-1 text-[12px] font-black text-[#263247]">{item.name}</h4>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#667085]">{item.description}</p>
                <p className="mt-2 line-clamp-1 border-t border-[#f0e8eb] pt-2 text-[9px] font-bold text-[#b64c72]">建议：{item.stylingTips[0]}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="px-1 text-[9px] leading-4 text-[#98a2b3]">{category === 'toy' ? '图片已离线保存；具体尺寸、使用方式与注意事项请以实物说明书为准。' : '所有图片均已离线保存，可在无网络环境下浏览。'}</p>
      </section>

      <section className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#fff0f4] text-[#d94d7f]"><Sparkles className="h-4 w-4" /></div><div><h3 className="text-xs font-black text-[#263247]">衣橱复盘</h3><p className="mt-1 text-[11px] leading-5 text-[#667085]">{insight}</p></div></div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-black text-[#263247]"><BookOpen className="h-4 w-4 text-[#d94d7f]" /> 穿搭记录</h3>
          <button type="button" onClick={() => setOnlyFavorites((value) => !value)} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-black ${onlyFavorites ? 'bg-[#fff0f4] text-[#d94d7f]' : 'text-[#667085]'}`}><Heart className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-current' : ''}`} /> 只看收藏</button>
        </div>
        <label className="flex items-center gap-2 rounded-2xl border border-[#dfe3e8] bg-white px-3 py-2.5"><Search className="h-4 w-4 text-[#98a2b3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、标签、场景或日记内容" className="min-w-0 flex-1 bg-transparent text-[11px] text-[#263247] outline-none placeholder:text-[#98a2b3]" /></label>

        {filteredDiaries.length ? (
          <div className="space-y-3">
            {filteredDiaries.map((entry) => {
              const outfit = allItems.find((item) => item.id === entry.outfitId);
              return (
                <article key={entry.id} className="overflow-hidden rounded-3xl border border-[#eadde2] bg-white shadow-[0_8px_24px_rgba(48,36,41,0.07)]">
                  {(entry.photo || outfit?.image) && (
                    <div className="relative">
                      <img src={entry.photo || outfit?.image} alt={entry.photo ? `${entry.title}穿搭照片` : `${outfit?.name || '装扮'}灵感图`} className="h-40 w-full bg-[#f5f6f8] object-cover" />
                      {!entry.photo && <span className="absolute bottom-2 right-2 rounded-full bg-[#263247]/75 px-2 py-1 text-[8px] font-black text-white backdrop-blur">灵感图</span>}
                    </div>
                  )}
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff0f4] text-xl">{outfit?.avatar || '👗'}</span><div className="min-w-0"><h4 className="truncate text-[13px] font-black text-[#263247]">{entry.title}</h4><p className="mt-0.5 text-[9.5px] font-bold text-[#7a8493]">{entry.date} · {entry.scene} · {entry.mood || '未记录'}</p></div></div>
                      <button type="button" onClick={() => toggleFavorite(entry.id)} aria-label={entry.favorite ? '取消收藏' : '收藏'} className="p-1 text-[#d94d7f]"><Heart className={`h-4 w-4 ${entry.favorite ? 'fill-current' : ''}`} /></button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-[#475467]">{entry.content}</p>
                    {!!entry.outfitSnapshot?.length && <p className="mt-2 text-[10px] text-[#667085]">当时搭配：{entry.outfitSnapshot.join(' + ')}</p>}
                    {!!entry.tags.length && <div className="mt-2 flex flex-wrap gap-1.5">{entry.tags.map((tag) => <span key={tag} className="rounded-full bg-[#fff0f4] px-2 py-1 text-[9px] font-bold text-[#b93765]">#{tag}</span>)}</div>}
                    <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-2xl bg-[#f7f7f8] p-2">
                      {[["舒适", entry.comfort], ["自信", entry.confidence], ["完成", entry.styleScore], ["分钟", entry.minutes]].map(([label, value]) => <div key={label} className="text-center"><div className="text-[11px] font-black text-[#d94d7f]">{value}</div><div className="text-[8.5px] font-bold text-[#7a8493]">{label}</div></div>)}
                    </div>
                    <div className="mt-2 flex justify-end gap-1"><button type="button" onClick={() => openEdit(entry)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#536273]"><Edit3 className="h-3 w-3" /> 编辑</button><button type="button" onClick={() => deleteDiary(entry)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#c53f61]"><Trash2 className="h-3 w-3" /> 删除</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[#e0cbd3] bg-[#fffafb] px-5 py-9 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#d94d7f] shadow-sm"><Shirt className="h-5 w-5" /></div><h4 className="mt-3 text-xs font-black text-[#344054]">{state.diaries.length ? '没有符合条件的记录' : '衣橱还没有留下故事'}</h4><p className="mt-1 text-[10px] text-[#7a8493]">记录穿了什么、感觉如何，下次搭配会更有依据。</p>{!state.diaries.length && <button type="button" onClick={() => openCreate()} className="mt-3 rounded-full bg-[#d94d7f] px-4 py-2 text-[10px] font-black text-white">写第一条</button>}</div>
        )}
      </section>

      {showEditor && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1f2937]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-[#f7f7f8] shadow-2xl sm:rounded-[30px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadde2] bg-white/95 px-4 py-3 backdrop-blur"><div><p className="text-[9px] font-black tracking-[0.16em] text-[#d94d7f]">WARDROBE ENTRY</p><h3 className="text-sm font-black text-[#263247]">{selectedOutfit.category === 'toy' ? (editingId ? '编辑用品体验记录' : '记录用品体验') : (editingId ? '编辑穿搭记录' : '记录今天的穿搭')}</h3></div><button type="button" onClick={closeEditor} aria-label="关闭" className="grid h-9 w-9 place-items-center rounded-full bg-[#f5f6f8] text-[#536273]"><X className="h-4 w-4" /></button></div>

            <div className="space-y-4 p-4">
              <section className="rounded-3xl border border-[#eadde2] bg-white p-3.5">
                <label className="mb-1.5 block text-[10px] font-black text-[#475467]">{selectedOutfit.category === 'toy' ? '记录用品' : '今日装扮'}</label>
                <select value={draft.outfitId} onChange={(event) => setDraft((current) => ({ ...current, outfitId: event.target.value }))} className="w-full rounded-xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-[11px] font-bold text-[#263247] outline-none focus:border-[#e96892]">{[...availableItems, ...allItems.filter(item => item.id === draft.outfitId && !availableItems.some(active => active.id === item.id))].map((item) => <option key={item.id} value={item.id}>{item.avatar} {item.name}</option>)}</select>
                <div className="mt-3 overflow-hidden rounded-2xl bg-[#fff8fa]">
                  <img src={selectedOutfit.image} alt={selectedOutfit.name} className="h-36 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-start gap-2"><span className="text-2xl">{selectedOutfit.avatar}</span><div className="min-w-0"><div className="truncate text-[11px] font-black text-[#344054]">{selectedOutfit.name}</div><div className="mt-0.5 text-[9px] leading-4 text-[#7a8493]">{selectedOutfit.description}</div></div></div>
                    <div className="rounded-xl bg-white px-2.5 py-2">
                      {selectedOutfit.stylingTips.map((tip) => <p key={tip} className="text-[9px] leading-4 text-[#667085]">· {tip}</p>)}
                    </div>
                    {selectedOutfit.sourceUrl ? (
                      <a href={selectedOutfit.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-bold text-[#b64c72]">查看实拍图片来源 <ExternalLink className="h-3 w-3" /></a>
                    ) : selectedOutfit.category === 'toy' ? (
                      <span className="text-[9px] font-bold text-[#98a2b3]">具体使用方式请以实物说明书为准</span>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-3xl border border-[#eadde2] bg-white p-3.5">
                <div><label className="mb-1.5 block text-[10px] font-black text-[#475467]">标题</label><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={80} placeholder={`${selectedOutfit.name}${selectedOutfit.category === 'toy' ? '体验记录' : '穿搭'}`} className="w-full rounded-xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-[11px] text-[#263247] outline-none placeholder:text-[#98a2b3] focus:border-[#e96892]" /></div>
                <div className="grid grid-cols-2 gap-2"><div><label className="mb-1.5 block text-[10px] font-black text-[#475467]">穿着场景</label><select value={draft.scene} onChange={(event) => setDraft((current) => ({ ...current, scene: event.target.value }))} className="w-full rounded-xl border border-[#dfe3e8] bg-white px-2.5 py-2.5 text-[11px] text-[#263247] outline-none">{SCENES.map((scene) => <option key={scene}>{scene}</option>)}</select></div><div><label className="mb-1.5 block text-[10px] font-black text-[#475467]">当时心情</label><select value={draft.mood} onChange={(event) => setDraft((current) => ({ ...current, mood: event.target.value }))} className="w-full rounded-xl border border-[#dfe3e8] bg-white px-2.5 py-2.5 text-[11px] text-[#263247] outline-none">{MOODS.map((mood) => <option key={mood}>{mood}</option>)}</select></div></div>
                <div><label className="mb-1.5 block text-[10px] font-black text-[#475467]">穿了多久（分钟）</label><input type="number" min={0} max={1440} value={draft.minutes} onChange={(event) => setDraft((current) => ({ ...current, minutes: Number(event.target.value) }))} className="w-full rounded-xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-[11px] text-[#263247] outline-none" /></div>
                <div><label className="mb-1.5 block text-[10px] font-black text-[#475467]">日记与复盘 <span className="font-normal text-[#98a2b3]">（必填）</span></label><textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} maxLength={4000} rows={5} placeholder="记录搭配亮点、不舒服的地方、当时的感受，以及下次想改什么……" className="w-full resize-none rounded-2xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-[11px] leading-5 text-[#263247] outline-none placeholder:text-[#98a2b3] focus:border-[#e96892]" /><div className="mt-1 text-right text-[9px] text-[#98a2b3]">{draft.content.length}/4000</div></div>
              </section>

              <section className="space-y-2 rounded-3xl border border-[#eadde2] bg-white p-3.5"><h4 className="text-[11px] font-black text-[#344054]">穿着评分</h4><RatingInput label="舒适度" value={draft.comfort} onChange={(value) => setDraft((current) => ({ ...current, comfort: value }))} /><RatingInput label="自信感" value={draft.confidence} onChange={(value) => setDraft((current) => ({ ...current, confidence: value }))} /><RatingInput label="搭配完成度" value={draft.styleScore} onChange={(value) => setDraft((current) => ({ ...current, styleScore: value }))} /></section>

              <section className="rounded-3xl border border-[#eadde2] bg-white p-3.5"><h4 className="text-[11px] font-black text-[#344054]">风格标签</h4><div className="mt-2 flex flex-wrap gap-2">{QUICK_TAGS.map((tag) => { const active = draft.tags.includes(tag); return <button key={tag} type="button" onClick={() => setDraft((current) => ({ ...current, tags: active ? current.tags.filter((item) => item !== tag) : [...current.tags, tag].slice(0, 8) }))} className={`rounded-full border px-2.5 py-1.5 text-[9.5px] font-bold ${active ? 'border-[#e96892] bg-[#fff0f4] text-[#b93765]' : 'border-[#dfe3e8] text-[#667085]'}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{tag}</button>; })}</div></section>

              <section className="space-y-3 rounded-3xl border border-[#eadde2] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3"><div><h4 className="text-[11px] font-black text-[#344054]">穿搭照片</h4><p className="mt-0.5 text-[9px] text-[#7a8493]">上传照片会压缩后仅保存在本机，也可填写图片网址。</p></div>{draft.photo && <button type="button" onClick={() => { setDraft((current) => ({ ...current, photo: '' })); setVisionReview(''); }} className="text-[9px] font-bold text-[#c53f61]">移除</button>}</div>
                {draft.photo ? <img src={draft.photo} alt="穿搭预览" className="h-48 w-full rounded-2xl bg-[#f5f6f8] object-cover" /> : <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-28 w-full place-items-center rounded-2xl border border-dashed border-[#e4bdcc] bg-[#fffafb] text-[#d94d7f]"><span className="flex flex-col items-center gap-1.5 text-[10px] font-black"><ImagePlus className="h-5 w-5" />{isReadingPhoto ? '正在压缩照片…' : '从手机或电脑上传'}</span></button>}
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoFile} className="hidden" />
                <div className="flex items-center gap-2"><span className="h-px flex-1 bg-[#edf0f3]" /><span className="text-[9px] text-[#98a2b3]">或</span><span className="h-px flex-1 bg-[#edf0f3]" /></div>
                <input value={draft.photo?.startsWith('http') ? draft.photo : ''} onChange={(event) => { setDraft((current) => ({ ...current, photo: event.target.value.trim() })); setVisionReview(''); }} placeholder="https://example.com/outfit.jpg" className="w-full rounded-xl border border-[#dfe3e8] bg-white px-3 py-2.5 text-[10px] text-[#263247] outline-none placeholder:text-[#98a2b3]" />
                <button type="button" onClick={reviewPhoto} disabled={!draft.photo || isJudging} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#263247] py-2.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Camera className="h-3.5 w-3.5" />{isJudging ? '穿搭顾问正在分析…' : '让 AI 点评这套穿搭'}</button>
                {visionReview && <div className="whitespace-pre-wrap rounded-2xl bg-[#fff8fa] p-3 text-[10px] leading-5 text-[#475467]"><span className="font-black text-[#d94d7f]">AI 穿搭建议</span><br />{visionReview}</div>}
              </section>

              <label className="flex items-center justify-between rounded-2xl border border-[#eadde2] bg-white p-3"><span className="flex items-center gap-2 text-[11px] font-black text-[#344054]"><Star className="h-4 w-4 text-[#d94d7f]" /> 加入我的收藏穿搭</span><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft((current) => ({ ...current, favorite: event.target.checked }))} className="h-4 w-4 accent-[#d94d7f]" /></label>
              {formError && <div role="alert" className="rounded-2xl border border-[#fecdd3] bg-[#fff1f4] px-3 py-2.5 text-[10px] font-bold leading-4 text-[#b42343]">{formError}</div>}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-[#eadde2] bg-white/95 p-3 backdrop-blur"><button type="button" onClick={closeEditor} className="flex-1 rounded-2xl border border-[#dfe3e8] py-3 text-[11px] font-black text-[#667085]">取消</button><button type="button" onClick={saveDiary} className="flex-[1.6] rounded-2xl bg-[#d94d7f] py-3 text-[11px] font-black text-white shadow-lg">{editingId ? '保存修改' : selectedOutfit.category === 'toy' ? '保存用品日记' : '保存穿搭日记'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
