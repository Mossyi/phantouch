import { exportTavernRepository } from './tavernChatRepository';

/**
 * 役次元 · 本地迁移码引擎（Base64 仅用于传输，不是加密）
 */
export class SignInCodeEngine {
  private static readonly BACKUP_KEYS = new Set([
    'ycy_achievement_metrics',
    'ycy_achievements',
    'ycy_active_contract',
    'ycy_barbie_lab',
    'ycy_barbie_suite_v2',
    'ycy_blood_contract',
    'ycy_bounty_quests',
    'ycy_chastity_lock',
    'ycy_chastity_logs',
    'ycy_chastity_streak',
    'ycy_chat_hardware_enabled',
    'ycy_custom_personas',
    'ycy_director_log',
    'ycy_dungeon_last_active_script_id',
    'ycy_dungeon_custom_scripts_v1',
    'ycy_dungeon_deleted_builtins_v1',
    'ycy_dungeon_recycle_bin_v1',
    'ycy_dungeon_permanently_deleted_builtins_v1',
    'ycy_dungeon_ending_gallery_v1',
    'ycy_dungeon_manual_slots_v1',
    'ycy_dungeon_script_saves_v2',
    'ycy_dungeon_unlocked_endings_v2',
    'ycy_dzmm_config',
    'ycy_equipped_title',
    'ycy_femboy_training',
    'ycy_hardware_lorebook',
    'ycy_last_active_persona',
    'ycy_llm_config',
    'ycy_mirror_lock',
    'ycy_safety_config',
    'ycy_tavern_active_id',
    'ycy_tavern_capsules',
    'ycy_tavern_cards',
    'ycy_tavern_diaries',
    'ycy_tavern_image_config',
    'ycy_tavern_generation_config',
    'ycy_tavern_player_profile',
    'ycy_tavern_text_rules',
    'ycy_tavern_worldbooks',
    'ycy_usury_debt',
    'ycy_usury_interest_at',
    'ycy_wardrobe_state',
    'ycy_tts_voice_profiles',
    'ycy_chat_display_config',
    'ycy_asmr_positions',
    'ycy_asmr_last_track',
    'ycy_asmr_scripts',
    'ycy_asmr_queue',
    'ycy_model_profiles',
    'ycy_pavlov_progress_v1',
    'ycy_training_weekly_plan',
  ]);

  private static readonly RAW_STRING_KEYS = new Set([
    'ycy_last_active_persona',
    'ycy_equipped_title',
    'ycy_dungeon_last_active_script_id',
    'ycy_tavern_active_id',
  ]);

  private static readonly SECRET_FIELD_NAMES = new Set([
    'apikey',
    'token',
    'accesstoken',
    'refreshtoken',
    'authtoken',
    'secret',
    'clientsecret',
    'password',
    'passwd',
    'authorization',
    'credential',
    'credentials',
    'connectcode',
  ]);

  private static isBackupKey(key: string): boolean {
    return this.BACKUP_KEYS.has(key)
      || /^ycy_chat_history_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_chat_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_archives_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_author_note_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_memory_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_draft_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_bookmarks_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_stats_[a-zA-Z0-9_-]{1,160}$/.test(key)
      || /^ycy_tavern_group_[a-zA-Z0-9_-]{1,160}$/.test(key);
  }

  private static redactSecrets(value: unknown, depth = 0): unknown {
    if (depth > 30) return null;
    if (Array.isArray(value)) return value.map((item) => this.redactSecrets(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const clean: Record<string, unknown> = Object.create(null);
    for (const [field, item] of Object.entries(value as Record<string, unknown>)) {
      if (['__proto__', 'prototype', 'constructor'].includes(field)) continue;
      const normalizedField = field.replace(/[-_\s]/g, '').toLowerCase();
      clean[field] = this.SECRET_FIELD_NAMES.has(normalizedField)
        ? ''
        : this.redactSecrets(item, depth + 1);
    }
    return clean;
  }

  private static sanitizeValue(key: string, value: unknown): unknown {
    const sanitized = this.redactSecrets(value);
    if (
      (key === 'ycy_llm_config' || key === 'ycy_dzmm_config' || key === 'ycy_tavern_image_config')
      && sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ) {
      return { ...(sanitized as Record<string, unknown>), apiKey: '', rememberApiKey: false };
    }
    return sanitized;
  }

  /**
   * 生成当前设备的数据快照。API Key 会被主动排除。
   */
  static moduleForKey(key: string): string {
    if (/^ycy_asmr_/.test(key)) return 'asmr';
    if (/tavern|chat_history|dzmm|bounty|hardware_lorebook/.test(key)) return 'tavern';
    if (/barbie|femboy|pavlov|director|training_weekly/.test(key)) return 'training';
    if (/wardrobe/.test(key)) return 'wardrobe';
    if (/dungeon/.test(key)) return 'dungeon';
    return 'settings';
  }

  static generateSignInCode(options: { extended?: boolean; module?: string } = {}): { jsonStr: string; base64Code: string; timestamp: number } {
    const snapshot: Record<string, any> = {};

    // 动态扫描所有 ycy_ 前缀的全部系统、角色会话与硬件配置键
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && this.isBackupKey(key) && (!options.module || options.module === 'all' || this.moduleForKey(key) === options.module)) {
          try {
            const val = localStorage.getItem(key);
            if (val !== null) snapshot[key] = {
              __ycyStorageFormat: 'json',
              value: this.sanitizeValue(key, JSON.parse(val)),
            };
          } catch {
            // 只有明确使用纯字符串格式的键可以按 raw 备份；损坏的配置不会被误当成文本导出。
            if (this.RAW_STRING_KEYS.has(key)) {
              snapshot[key] = {
                __ycyStorageFormat: 'raw',
                value: this.sanitizeValue(key, localStorage.getItem(key)),
              };
            }
          }
        }
      }
    } catch {}

    const payload = {
      app: '幻触AI智控App',
      version: '1.0.0',
      schemaVersion: 2,
      timestamp: Date.now(),
      containsSecrets: false,
      snapshot,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    this.checkExportSize(payload.snapshot, jsonStr, options.extended);
    if (options.extended) return { jsonStr, base64Code: '', timestamp: payload.timestamp };
    let base64Code = '';
    try {
      base64Code = btoa(unescape(encodeURIComponent(jsonStr)));
    } catch {
      base64Code = btoa(jsonStr);
    }

    return { jsonStr, base64Code, timestamp: payload.timestamp };
  }

  private static checkExportSize(snapshot: Record<string, any>, json: string, extended = false) {
    if (Object.keys(snapshot).length > (extended ? 5000 : 500) || new TextEncoder().encode(json).byteLength > (extended ? 50_000_000 : 5_000_000)) {
      throw new Error('数据超过单次备份上限，请先从酒馆会话库分批导出聊天记录。');
    }
    for (const value of Object.values(snapshot)) {
      if (JSON.stringify(value?.value ?? value).length > (extended ? 20_000_000 : 2_000_000)) throw new Error(`单项数据超过 ${extended ? 20 : 2} MB，请先分批导出该模块记录。`);
    }
  }

  static async generateCompleteBackup(module = 'all', extended = false): Promise<string> {
    const payload = JSON.parse(this.generateSignInCode({ module, extended }).jsonStr);
    if (module !== 'all' && module !== 'tavern') return JSON.stringify(payload);
    const repository = await exportTavernRepository();
    for (const record of repository.sessions) {
      const key = `ycy_tavern_chat_${record.cardId}`;
      if (this.isBackupKey(key) && (!payload.snapshot[key] || record.updatedAt >= Number(localStorage.getItem(`ycy_tavern_session_updated_${record.cardId}`) || 0))) {
        payload.snapshot[key] = { __ycyStorageFormat: 'json', value: this.sanitizeValue(key, record.messages) };
      }
    }
    for (const record of repository.archives) {
      const key = `ycy_tavern_archives_${record.cardId}`;
      if (this.isBackupKey(key) && (!payload.snapshot[key] || record.updatedAt >= Number(localStorage.getItem(`ycy_tavern_archive_library_updated_${record.cardId}`) || 0))) {
        payload.snapshot[key] = { __ycyStorageFormat: 'json', value: this.sanitizeValue(key, record.archives) };
      }
    }
    const json = JSON.stringify(payload, null, 2);
    this.checkExportSize(payload.snapshot, json, extended);
    return json;
  }

  /**
   * 通过登录码字符串 / JSON 恢复全量数据
   */
  static restoreFromCode(codeOrJson: string, options: { extended?: boolean; mode?: 'merge' | 'overwrite'; dryRun?: boolean } = {}): { success: boolean; message: string } {
    try {
      let jsonStr = codeOrJson.trim();
      if (!jsonStr || jsonStr.length > (options.extended ? 50_000_000 : 5_000_000)) {
        return { success: false, message: '迁移码为空或超过 5 MB 安全限制。' };
      }

      // 若是 base64 则解码
      if (!jsonStr.startsWith('{')) {
        try {
          jsonStr = decodeURIComponent(escape(atob(jsonStr)));
        } catch {
          jsonStr = atob(jsonStr);
        }
      }

      const data = JSON.parse(jsonStr);
      if (!data.snapshot || typeof data.snapshot !== 'object' || Array.isArray(data.snapshot)) {
        return { success: false, message: '无效的赛博登录码凭据。' };
      }

      const entries = Object.entries(data.snapshot);
      if (entries.length > (options.extended ? 5000 : 500)) return { success: false, message: '迁移数据项过多，已拒绝恢复。' };
      const validated: Array<[string, string]> = [];
      for (const [key, value] of entries) {
        if (!this.isBackupKey(key)) continue;
        let serialized: string | undefined;
        if (
          value && typeof value === 'object' && !Array.isArray(value) &&
          '__ycyStorageFormat' in value && 'value' in value
        ) {
          const envelope = value as { __ycyStorageFormat?: unknown; value?: unknown };
          if (envelope.__ycyStorageFormat === 'raw') {
            if (!this.RAW_STRING_KEYS.has(key)) continue;
            serialized = String(this.sanitizeValue(key, envelope.value) ?? '');
          } else if (envelope.__ycyStorageFormat === 'json') {
            serialized = JSON.stringify(this.sanitizeValue(key, envelope.value));
          } else {
            continue;
          }
        } else if (this.RAW_STRING_KEYS.has(key) && typeof value === 'string') {
          // 兼容旧版迁移码中没有格式信封的纯字符串状态。
          serialized = value;
        } else {
          serialized = JSON.stringify(this.sanitizeValue(key, value));
        }
        if (typeof serialized !== 'string') continue;
        if (serialized.length > (options.extended ? 20_000_000 : 2_000_000)) {
          return { success: false, message: `数据项 ${key} 超过 2 MB 安全限制。` };
        }
        if (options.mode !== 'merge' || localStorage.getItem(key) === null) validated.push([key, serialized]);
      }

      if (options.dryRun) return { success: true, message: `校验通过，可恢复 ${validated.length} 项` };

      const restoredRepositoryTimestampKeys = validated.flatMap(([key]) => {
        const sessionCardId = key.match(/^ycy_tavern_chat_([a-zA-Z0-9_-]{1,160})$/)?.[1];
        if (sessionCardId) return [`ycy_tavern_session_updated_${sessionCardId}`];
        const archiveCardId = key.match(/^ycy_tavern_archives_([a-zA-Z0-9_-]{1,160})$/)?.[1];
        return archiveCardId ? [`ycy_tavern_archive_library_updated_${archiveCardId}`] : [];
      });
      const restoredKeys = [...validated.map(([key]) => key), ...restoredRepositoryTimestampKeys];
      const previousValues = restoredKeys.map((key) => [key, localStorage.getItem(key)] as const);
      try {
        for (const [key, serialized] of validated) localStorage.setItem(key, serialized);
        const restoredAt = String(Date.now());
        for (const key of restoredRepositoryTimestampKeys) localStorage.setItem(key, restoredAt);
      } catch (error) {
        for (const [key, previous] of previousValues) {
          try {
            if (previous === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
          } catch {}
        }
        throw error;
      }

      return {
        success: true,
        message: `成功恢复 ${validated.length} 项核心数据（API Key 未导入）！页面即将刷新。`,
      };
    } catch (e: any) {
      return { success: false, message: `恢复失败: ${e.message}` };
    }
  }
}
