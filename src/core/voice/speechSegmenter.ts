/**
 * 流式朗读分句器：把模型逐字生成的回复切成可以立刻送去合成的句子。
 *
 * 实时语音对话的延迟主要卡在「等整段回复生成完再朗读」。这里每当可见文本里出现完整的句子
 * 就交给 TTS，第一句允许在逗号处提前切出，让角色尽快开口；后续句子按句末标点切，
 * 过短的碎句会并入下一句，避免一顿一顿地读。
 */

const SENTENCE_END = /[。！？!?…\n]/;
const SOFT_BREAK = /[，,、；;：:]/;
/** 尚未闭合的控制标记（状态注释 / 硬件标记）不能被读出来 */
const PARTIAL_CONTROL_TAIL = /(<!--[\s\S]*$|\[\[[^\]]*$|<[^>]*$)/;

export interface SpeechSegmenterOptions {
  /** 第一句在逗号处提前切出的最小长度 */
  firstChunkMinChars?: number;
  /** 短于这个长度的句子并入下一句 */
  minChars?: number;
  /** 一句超过这个长度时在逗号处强制切开 */
  maxChars?: number;
}

const speakableLength = (text: string): number => text.replace(/[\s。！？!?…，,、；;：:“”"'‘’（）()【】[\]*~～—-]/g, '').length;

export class SpeechSegmenter {
  private consumed = 0;
  private emittedCount = 0;
  private lastText = '';
  private readonly firstChunkMinChars: number;
  private readonly minChars: number;
  private readonly maxChars: number;

  constructor(options: SpeechSegmenterOptions = {}) {
    this.firstChunkMinChars = options.firstChunkMinChars ?? 10;
    this.minChars = options.minChars ?? 6;
    this.maxChars = options.maxChars ?? 90;
  }

  /**
   * 输入到目前为止的完整可见文本，返回新出现的、可以朗读的句子。
   * 文本前缀若被上游清洗改写（与已消费部分对不上），按已消费的长度继续，绝不重复朗读。
   */
  push(fullText: string): string[] {
    const text = typeof fullText === 'string' ? fullText.replace(PARTIAL_CONTROL_TAIL, '') : '';
    this.lastText = text;
    const sentences: string[] = [];
    let cursor = Math.min(this.consumed, text.length);
    let start = cursor;

    for (let index = cursor; index < text.length; index += 1) {
      const character = text[index];
      const segmentLength = index + 1 - start;
      const isEnd = SENTENCE_END.test(character);
      const isSoft = SOFT_BREAK.test(character);
      const isFirst = this.emittedCount === 0 && sentences.length === 0;
      const segment = text.slice(start, index + 1);
      const speakable = speakableLength(segment);

      let cut = false;
      if (isEnd && speakable >= this.minChars) cut = true;
      else if (isSoft && isFirst && speakable >= this.firstChunkMinChars) cut = true;
      else if (isSoft && segmentLength >= this.maxChars) cut = true;

      if (cut) {
        // 连续的句末符号（“……”“！？”）以及紧随其后的右引号 / 右括号一起带走
        let end = index + 1;
        while (end < text.length && /[。！？!?…”"’）)】\s]/.test(text[end])) end += 1;
        if (end >= text.length && !isEnd) {
          // 软切点后面还没有内容：等下一个 token，确认不是「，」之后紧跟的引号
          break;
        }
        const piece = text.slice(start, end).trim();
        if (piece) sentences.push(piece);
        start = end;
        cursor = end;
        index = end - 1;
      }
    }

    this.consumed = cursor;
    this.emittedCount += sentences.length;
    return sentences;
  }

  /**
   * 回复生成完毕：返回剩余未读部分。传入最终文本时以它为准（最终清洗可能去掉了流式阶段的残留）。
   */
  flush(finalText?: string): string[] {
    const text = typeof finalText === 'string' ? finalText : this.lastText;
    const rest = text.slice(Math.min(this.consumed, text.length)).replace(PARTIAL_CONTROL_TAIL, '').trim();
    this.consumed = text.length;
    if (!rest || speakableLength(rest) === 0) return [];
    this.emittedCount += 1;
    return [rest];
  }

  reset() {
    this.consumed = 0;
    this.emittedCount = 0;
    this.lastText = '';
  }
}
