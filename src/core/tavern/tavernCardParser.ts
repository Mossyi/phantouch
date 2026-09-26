import { TavernCharacterCard } from './tavernTypes';
import { expandTavernMacros } from './tavernMacros';
import {
  normalizeExpressions,
  normalizeSceneWallpaper,
  normalizeSceneWallpaperOverlay,
} from './tavernData';

/**
 * 役次元 SillyTavern 兼容角色卡解析与可选硬件联动引擎
 */
export class TavernCardParser {
  private static cleanText(value: unknown, fallback: string, maxLength: number): string {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
  }

  private static decodeBase64Utf8(value: string): string {
    const binary = atob(value.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  private static createId(): string {
    const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return `card_${suffix}`;
  }

  private static cleanStringList(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  private static cleanImageList(value: unknown, maxItems = 8): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const images = [...new Set(value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(item) && item.length <= 300_000 || /^https:\/\//i.test(item) && item.length <= 2048))]
      .slice(0, maxItems);
    return images.length > 0 ? images : undefined;
  }

  private static parseWorldBookEntries(value: unknown): TavernCharacterCard['worldBookEntries'] {
    if (!Array.isArray(value)) return undefined;
    const entries = value.slice(0, 200).map((rawEntry, index) => {
      if (!rawEntry || typeof rawEntry !== 'object') return null;
      const entry = rawEntry as Record<string, unknown>;
      const keywords = this.cleanStringList(
        Array.isArray(entry.keys) ? entry.keys : entry.keywords,
        30,
        100,
      );
      if (keywords.length === 0 || typeof entry.content !== 'string' || !entry.content.trim()) return null;
      const secondaryKeywords = this.cleanStringList(
        Array.isArray(entry.secondary_keys) ? entry.secondary_keys : entry.secondaryKeywords,
        30,
        100,
      );
      return {
        id: `cardbook_${index}_${String(entry.id ?? entry.uid ?? index).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`,
        keywords: [...new Set(keywords)],
        secondaryKeywords: secondaryKeywords.length > 0 ? [...new Set(secondaryKeywords)] : undefined,
        content: entry.content.trim().slice(0, 4000),
        enabled: entry.enabled !== false,
      };
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return entries.length > 0 ? entries : undefined;
  }

  private static async createAvatarDataUrl(file: File): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('角色卡图片无法解码'));
        image.src = objectUrl;
      });
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器不支持图片缩放');
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('角色卡图片尺寸无效');
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      return canvas.toDataURL('image/webp', 0.82);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /**
   * 解析 JSON 格式角色卡 (支持 Character Card V2 规范)
   */
  static parseJsonCard(jsonStr: string): TavernCharacterCard | null {
    try {
      if (jsonStr.length > 2_000_000) throw new Error('角色卡 JSON 超过 2 MB 限制');
      const data = JSON.parse(jsonStr);
      const charData = data?.data || data?.character || data; // V2、DZMM Studio 与常见社区导出包
      if (!charData || typeof charData !== 'object') return null;
      if (![charData.name, charData.description, charData.introduction, charData.first_mes, charData.firstMessage, charData.greeting, charData.opening_message].some((value) => typeof value === 'string' && value.trim())) {
        return null;
      }

      return {
        id: this.createId(),
        name: this.cleanText(charData.name, '未命名酒馆角色', 100),
        avatar: this.cleanText(charData.avatar || charData.avatar_url || charData.cover, '🎴', 200000),
        tag: Array.isArray(charData.tags)
          ? charData.tags.filter((tag: unknown): tag is string => typeof tag === 'string').slice(0, 30).join('/').slice(0, 120) || 'SillyTavern角色'
          : this.cleanText(charData.character_book?.name, 'SillyTavern角色', 120),
        description: this.cleanText(charData.description || charData.introduction || charData.intro, '', 12000),
        personality: this.cleanText(charData.personality, '', 8000),
        scenario: this.cleanText(charData.scenario, '', 8000),
        firstMessage: this.cleanText(charData.first_mes || charData.firstMessage || charData.greeting || charData.opening_message, '你好，旅人。欢迎来到魅魔酒馆。', 12000),
        mesExamples: this.cleanText(charData.mes_example || charData.message_examples || charData.example_dialogue, '', 12000),
        systemPromptAddon: this.cleanText(charData.system_prompt || charData.systemPrompt || charData.system_instruction || charData.instructions, '', 12000),
        postHistoryInstructions: this.cleanText(charData.post_history_instructions, '', 12000),
        alternateGreetings: Array.isArray(charData.alternate_greetings)
          ? charData.alternate_greetings.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).map((item: string) => item.trim().slice(0, 12000)).slice(0, 20)
          : undefined,
        creatorNotes: this.cleanText(charData.creator_notes || charData.notes, '', 8000),
        introduction: this.cleanText(charData.introduction || charData.description || charData.intro, '', 12000),
        detailedDescription: this.cleanText(charData.detailed_description || charData.detailedDescription || charData.detail || charData.background, '', 20_000),
        suggestedReplies: this.cleanStringList(charData.suggested_replies || charData.suggestedReplies || charData.starter_messages, 12, 500),
        galleryImages: this.cleanImageList(charData.gallery || charData.gallery_images || charData.images || charData.image_urls),
        voiceSettings: charData.voice && typeof charData.voice === 'object'
          ? {
              enabled: charData.voice.enabled === true || charData.voice.enable === true,
              engine: ['siliconflow', 'volcengine_tts'].includes(String(charData.voice.engine || charData.voice.provider || charData.voice.tts_engine))
                ? (charData.voice.engine || charData.voice.provider || charData.voice.tts_engine) as 'siliconflow' | 'volcengine_tts'
                : undefined,
              voiceId: this.cleanText(charData.voice.voice_id || charData.voice.voiceId, '', 200) || undefined,
              voiceName: this.cleanText(charData.voice.voice_name || charData.voice.voiceName || charData.voice.name, '', 100) || undefined,
              profileId: this.cleanText(charData.voice.profile_id || charData.voice.profileId, '', 100) || undefined,
              speed: Number.isFinite(Number(charData.voice.speed)) ? Math.min(2, Math.max(0.5, Number(charData.voice.speed))) : undefined,
              pitch: Number.isFinite(Number(charData.voice.pitch)) ? Math.min(2, Math.max(0.5, Number(charData.voice.pitch))) : undefined,
              gain: Number.isFinite(Number(charData.voice.gain)) ? Math.min(10, Math.max(-10, Number(charData.voice.gain))) : undefined,
            }
          : undefined,
        dzmmPublishMeta: charData.publish && typeof charData.publish === 'object'
          ? {
              visibility: ['private', 'unlisted', 'public'].includes(String(charData.publish.visibility)) ? charData.publish.visibility : undefined,
              category: this.cleanText(charData.publish.category, '', 100) || undefined,
            }
          : undefined,
        worldBookEntries: this.parseWorldBookEntries(charData.character_book?.entries || charData.world_book?.entries || charData.worldbook?.entries || charData.lorebook?.entries),
        sceneWallpaper: normalizeSceneWallpaper(charData.sceneWallpaper || charData.scene_wallpaper || charData.extensions?.yiciyuan?.sceneWallpaper || data?.extensions?.yiciyuan?.sceneWallpaper),
        sceneWallpaperOverlay: normalizeSceneWallpaperOverlay(charData.sceneWallpaperOverlay ?? charData.scene_wallpaper_overlay ?? charData.extensions?.yiciyuan?.sceneWallpaperOverlay ?? data?.extensions?.yiciyuan?.sceneWallpaperOverlay),
        expressions: normalizeExpressions(charData.expressions || charData.extensions?.yiciyuan?.expressions || data?.extensions?.yiciyuan?.expressions),
        // 社区角色卡中的提示词不应在未确认时获得硬件权限。
        hardwareEnchanted: false,
        creator: this.cleanText(charData.creator, '社区创作者', 100),
        source: 'imported_json',
      };
    } catch (e) {
      console.error('JSON 角色卡解析失败:', e);
      return null;
    }
  }

  /**
   * 导出 Character Card V2 JSON，便于在 SillyTavern / 兼容平台之间迁移。
   */
  static exportJsonCard(card: TavernCharacterCard): string {
    const payload = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: card.name,
        avatar: card.avatar || '🎴',
        description: card.description,
        personality: card.personality,
        scenario: card.scenario,
        first_mes: card.firstMessage,
        mes_example: card.mesExamples || '',
        creator: card.creator || '幻触用户',
        creator_notes: card.creatorNotes || '由幻触 App 导出的 Character Card V2 JSON。',
        system_prompt: card.systemPromptAddon || '',
        post_history_instructions: card.postHistoryInstructions || '',
        alternate_greetings: card.alternateGreetings || [],
        character_book: card.worldBookEntries?.length ? {
          name: `${card.name} 世界书`,
          description: '角色卡内置世界书',
          scan_depth: 4,
          token_budget: 2048,
          recursive_scanning: false,
          extensions: {},
          entries: card.worldBookEntries.map((entry, index) => ({
            keys: entry.keywords,
            secondary_keys: entry.secondaryKeywords || [],
            content: entry.content,
            enabled: entry.enabled,
            insertion_order: index,
            case_sensitive: false,
            use_regex: false,
            constant: false,
            name: entry.keywords[0] || `条目 ${index + 1}`,
            priority: 10,
            id: index,
            comment: '',
            selective: Boolean(entry.secondaryKeywords?.length),
            position: 'before_char',
            extensions: {},
          })),
        } : undefined,
        tags: card.tag.split('/').map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
        // Extra fields are ignored by SillyTavern and preserved by DZMM-style importers.
        introduction: card.introduction || card.description,
        detailed_description: card.detailedDescription || '',
        suggested_replies: card.suggestedReplies || [],
        gallery: card.galleryImages || [],
        voice: card.voiceSettings ? {
          enabled: card.voiceSettings.enabled,
          engine: card.voiceSettings.engine || '',
          voice_id: card.voiceSettings.voiceId || '',
          voice_name: card.voiceSettings.voiceName || '',
          profile_id: card.voiceSettings.profileId || '',
          speed: card.voiceSettings.speed,
          pitch: card.voiceSettings.pitch,
          gain: card.voiceSettings.gain,
        } : undefined,
        publish: card.dzmmPublishMeta ? {
          visibility: card.dzmmPublishMeta.visibility || 'private',
          category: card.dzmmPublishMeta.category || '',
        } : undefined,
        scene_wallpaper: card.sceneWallpaper,
        scene_wallpaper_overlay: card.sceneWallpaperOverlay,
        expressions: card.expressions,
        character_version: '1.0',
        extensions: {
          yiciyuan: {
            exported_at: new Date().toISOString(),
            avatar: card.avatar,
            hardware_enchanted: false,
            sceneWallpaper: card.sceneWallpaper,
            sceneWallpaperOverlay: card.sceneWallpaperOverlay,
            expressions: card.expressions,
          },
        },
      },
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * 解析 PNG 格式角色卡（提取常见 tEXt 数据块中的 chara / ccv3 元数据）
   */
  static async parsePngCard(file: File): Promise<TavernCharacterCard | null> {
    if (file.size > 10 * 1024 * 1024) throw new Error('PNG 角色卡不能超过 10 MB');
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          const bytes = new Uint8Array(buffer);
          const signature = [137, 80, 78, 71, 13, 10, 26, 10];
          if (!signature.every((value, index) => bytes[index] === value)) throw new Error('文件不是有效 PNG');

          let encodedCard = '';
          const view = new DataView(buffer);
          let offset = 8;
          while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset, false);
            if (length > 2_000_000 || offset + 12 + length > bytes.length) break;
            const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
            const chunk = bytes.slice(offset + 8, offset + 8 + length);
            if (type === 'tEXt') {
              const separator = chunk.indexOf(0);
              if (separator > 0) {
                const keyword = new TextDecoder('latin1').decode(chunk.slice(0, separator));
                if (keyword === 'chara' || keyword === 'ccv3') {
                  encodedCard = new TextDecoder('latin1').decode(chunk.slice(separator + 1)).trim();
                  break;
                }
              }
            }
            offset += length + 12;
          }

          if (encodedCard) {
            const card = TavernCardParser.parseJsonCard(this.decodeBase64Utf8(encodedCard));
            if (card) {
              card.source = 'imported_png';
              card.avatar = await this.createAvatarDataUrl(file);
              resolve(card);
              return;
            }
          }

          // 普通 PNG 不是角色卡，不能凭文件名伪造角色设定。
          resolve(null);
        } catch (e) {
          console.error('PNG 角色卡解析异常:', e);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 为酒馆角色注入“硬件支配附魔” System Prompt
   */
  static buildEnchantedSystemPrompt(card: TavernCharacterCard, macroContext?: { user?: string }): string {
    const context = { char: card.name, user: macroContext?.user };
    const personality = expandTavernMacros(card.personality, context);
    const description = expandTavernMacros(card.description, context);
    const scenario = expandTavernMacros(card.scenario, context);
    const systemPromptAddon = card.systemPromptAddon ? expandTavernMacros(card.systemPromptAddon, context) : '';
    const mesExamples = card.mesExamples ? expandTavernMacros(card.mesExamples, context) : '';
    const postHistoryInstructions = card.postHistoryInstructions ? expandTavernMacros(card.postHistoryInstructions, context) : '';

    const basePrompt = [
      '【角色设定】',
      '名字：' + card.name,
      '性格：' + personality,
      '背景与描述：' + description,
      '当前场景：' + scenario,
      systemPromptAddon ? ('\n【附加设定】\n' + systemPromptAddon) : '',
      mesExamples ? ('\n【对话范例】\n' + mesExamples) : '',
      postHistoryInstructions ? ('\n【历史后置指令】\n' + postHistoryInstructions) : '',
    ].filter(Boolean).join('\n').trim();

    if (!card.hardwareEnchanted) {
      return basePrompt;
    }

    const hardwareInjection = [
      '【已启用的附加能力：幻触硬件联动】',
      '这项能力像一条随角色卡自动加载的功能预设，只增加可用动作，不覆盖角色设定、原有语气、对话内容或剧情节奏。',
      '请先按照角色卡和对话历史自然回复。只有当前情节确实需要时才使用硬件能力；不要求每轮使用或提及，也不得用设备说明、状态播报或固定话术替代正常角色回复。',
      '',
      '【可用能力】',
      '1. 电击强度控制：set_ems_strength (channel: \'A\'|\'B\'|\'AB\', strength: 0-200)',
      '2. 电击波形切换：send_ems_wave (wave_name: \'breathe\' | \'tide\' | \'sawtooth_grind\' | \'orgasm_drain\' | \'sensory_tickle\')',
      '3. 飞机杯多马达：set_toy_motor (motorA: 0-20, motorB: 0-20, motorC: 0-20)',
      '4. 全局安全急停：emergency_stop（立即将所有输出清零，不接受持续时间参数）',
      '',
      '【联动原则】',
      '- 角色人设、说话方式、篇幅习惯和当前话题优先，开启联动前后应保持同一个角色。',
      '- 硬件动作是回复之外的附加执行结果；工具调用前已生成的台词必须保留，工具完成后不要重写或复述原台词。',
      '- 当用户明确要求停止或出现安全风险时，立即调用 emergency_stop。',
    ].join('\n').trim();

    return basePrompt + '\n\n' + hardwareInjection;
  }

  static buildWorldBookContext(card: TavernCharacterCard, text: string, macroContext?: { user?: string }): string {
    const normalizedText = text.trim().toLocaleLowerCase();
    if (!normalizedText || !card.worldBookEntries?.length) return '';
    const context = { char: card.name, user: macroContext?.user };
    return card.worldBookEntries
      .filter((entry) => {
        if (!entry.enabled) return false;
        const primaryHit = entry.keywords.some((keyword) => normalizedText.includes(keyword.toLocaleLowerCase()));
        const secondaryHit = !entry.secondaryKeywords?.length
          || entry.secondaryKeywords.some((keyword) => normalizedText.includes(keyword.toLocaleLowerCase()));
        return primaryHit && secondaryHit;
      })
      .map((entry) => expandTavernMacros(entry.content, context))
      .join('\n')
      .slice(0, 12_000);
  }
}
