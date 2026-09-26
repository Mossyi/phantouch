/**
 * Tavern Text Sanitizer & Deduplication Engine
 * 针对现代大模型（DeepSeek-R1、豆包/火山引擎 Ark、Claude 思考模式、OpenAI 代理等）
 * 彻底过滤各类思考标签、未闭合泄露标签（如 </think_never_used_UUID>）、多重尖括号（<<think>）、
 * 内部硬件指令、多重状态标签，并消除大模型在局部生成或无缝续写中的循环重复内容。
 */

// 匹配成对的思考/推理块（支持多重尖括号，如 <<think>...</think>>，HTML实体 &lt;think&gt;，以及特殊模型令牌）
const THINK_BLOCK_REGEX = /<+(?:think|thought|reasoning)(?:_never_used_[a-zA-Z0-9_-]*)?[^>]*>[\s\S]*?<\/*\s*(?:think|thought|reasoning)(?:_never_used_[a-zA-Z0-9_-]*)?>*/gi;
const ESCAPED_THINK_BLOCK_REGEX = /&lt;+(?:think|thought|reasoning)[^&]*&gt;[\s\S]*?&lt;\/*\s*(?:think|thought|reasoning)[^&]*&gt;/gi;
const BRACKET_THINK_BLOCK_REGEX = /\[(?:THINK|thought|reasoning)\][\s\S]*?\[\/(?:THINK|thought|reasoning)\]/gi;
const SPECIAL_TOKEN_THINK_REGEX = /<\|(?:begin_of_thought|thought|thinking)\|?>[\s\S]*?<\|(?:end_of_thought|thought|thinking)\|?>/gi;
const MARKDOWN_THINK_REGEX = /```(?:think|thought|reasoning)[\s\S]*?```/gi;

// 流式传输、网络截断或模型耗尽 Token 时，出现于任何位置尚未闭合的思考块（彻底切除其后所有泄漏内容）
const UNCLOSED_THINK_ANYWHERE_REGEX = /(?:<+(?:think|thought|reasoning)(?:_never_used_[a-zA-Z0-9_-]*)?[^>]*>|&lt;+(?:think|thought|reasoning)[^&]*&gt;|<\|(?:begin_of_thought|thought|thinking)\|?>|\[(?:THINK|thought|reasoning)\]|```(?:think|thought|reasoning))[\s\S]*$/i;

// 流式传输中从首部开始尚未闭合的思考块，或模型异常截断时从头到尾未闭合的纯思考内容
const STREAMING_UNCLOSED_THINK_START = /^\s*(?:<+(?:think|thought|reasoning)(?:_never_used_[a-zA-Z0-9_-]*)?[^>]*>|&lt;+(?:think|thought|reasoning)[^&]*&gt;|<\|(?:begin_of_thought|thought|thinking)\|?>|\[(?:THINK|thought|reasoning)\]|```(?:think|thought|reasoning))[\s\S]*$/i;

// 匹配任何形式的孤立、残留或未闭合 think/thought/reasoning 标签（无论是否有闭合符号 > 或 HTML 实体）
const DANGLING_THINK_TAG_REGEX = /(?:<+\/?\s*(?:think|thought|reasoning)(?:_never_used)?[a-zA-Z0-9_-]*>*|&lt;+\/?\s*(?:think|thought|reasoning)[^&]*&gt;*|<\|(?:begin_of_thought|end_of_thought|thought|thinking|im_start|im_end)\|?>*)/gi;
const DANGLING_BRACKET_THINK_REGEX = /\[\/?(?:THINK|thought|reasoning)\]/gi;
const BARE_THINK_NEVER_USED_REGEX = /\bthink_never_used_[a-zA-Z0-9_-]+\b/gi;

// 流式传输尾部正在输出、尚未补全的思考标签碎片（如 <、<<、<<think 等）
const STREAMING_PARTIAL_TAG_END = /(?:<+\/?\s*(?:think|thought|reasoning)(?:_never_used)?[a-zA-Z0-9_-]*>?|&lt;+\/?\s*(?:think|thought|reasoning)[^&]*&gt;?|\s*<+|\s*&lt;+)$/i;

// 硬件与内部状态标记
const HARDWARE_MARKER_REGEX = /\[\[YCY_HW:[\s\S]*?\]\]/g;
const STREAMING_HARDWARE_MARKER_REGEX = /\[\[YCY_HW:[^\]]*$/;
const STATUS_BLOCK_REGEX = /(?:<!--\s*STATUS(?:_UPDATE)?[\s\S]*?-->|\[\s*STATUS(?:_UPDATE)?[\s\S]*?\]|<\s*STATUS(?:_UPDATE)?\s*>[\s\S]*?<\/\s*STATUS(?:_UPDATE)?\s*>)/gi;
const UNCLOSED_STATUS_BLOCK_REGEX = /<!--\s*STATUS(?:_UPDATE)?[\s\S]*?(?:-->|(?=\n\n)|$)/gi;
const STREAMING_STATUS_REGEX = /(?:<!--\s*STATUS(?:_UPDATE)?:[^>]*$|\[\s*STATUS(?:_UPDATE)?:[^\]]*$|<\s*STATUS(?:_UPDATE)?[^>]*$)/i;

/**
 * 彻底过滤思考标签与泄漏代码
 * @param raw 原始模型输出
 * @param isStreaming 是否处于流式生成中
 */
export function stripThinkingArtifacts(raw: string, isStreaming = false): string {
  if (typeof raw !== 'string' || !raw) return '';
  let text = raw;

  // 1. 移除已完成的闭合思考块（标准标签、HTML 转义实体、特殊令牌与代码块）
  text = text.replace(THINK_BLOCK_REGEX, '');
  text = text.replace(ESCAPED_THINK_BLOCK_REGEX, '');
  text = text.replace(BRACKET_THINK_BLOCK_REGEX, '');
  text = text.replace(SPECIAL_TOKEN_THINK_REGEX, '');
  text = text.replace(MARKDOWN_THINK_REGEX, '');

  // 2. 处理尚未闭合的思考块：
  // 流式中隐藏任何位置出现的未闭合思考内容；或模型输出截断时，如果内容从头到尾为未闭合思考，则彻底隐藏防泄露
  if (isStreaming) {
    text = text.replace(UNCLOSED_THINK_ANYWHERE_REGEX, '');
    text = text.replace(STREAMING_PARTIAL_TAG_END, '');
  } else if (STREAMING_UNCLOSED_THINK_START.test(text)) {
    text = text.replace(STREAMING_UNCLOSED_THINK_START, '');
  }

  // 3. 清理残留在正文内部或首尾的孤立 think 标签（如 </think_never_used_UUID> 或残留令牌）
  text = text.replace(DANGLING_THINK_TAG_REGEX, '');
  text = text.replace(DANGLING_BRACKET_THINK_REGEX, '');
  text = text.replace(BARE_THINK_NEVER_USED_REGEX, '');

  // 4. 收敛因思考标签被移除后产生的首部空白与大段空行（消除“留空了一大截”断崖）
  text = text.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n');

  return text;
}

/**
 * 过滤硬件标记和内部状态更新标签
 */
export function stripInternalControlTags(raw: string, isStreaming = false): string {
  if (typeof raw !== 'string' || !raw) return '';
  let text = raw;

  if (isStreaming) {
    text = text.replace(STREAMING_HARDWARE_MARKER_REGEX, '');
    text = text.replace(STREAMING_STATUS_REGEX, '');
  }

  text = text.replace(HARDWARE_MARKER_REGEX, '');
  text = text.replace(STATUS_BLOCK_REGEX, '');
  text = text.replace(UNCLOSED_STATUS_BLOCK_REGEX, '');

  return text;
}

/**
 * 规范化文本用于高容错比较（移除中英文所有标点、引号、括号、星号、空白与语气符号）
 */
export function normalizeForComparison(s: string): string {
  if (typeof s !== 'string' || !s) return '';
  return s.replace(/[“"”'「」『』‘\(\)（）\[\]【】\*＊_~～\s。！？!?…、，,;；:：]/gu, '');
}

/**
 * 消除大模型在角色扮演中产生的循环重复语句、重复段落、标点差异复读与前置回显
 * @param raw 待处理文本
 * @param userPrompt 用户最新发送的消息正文（若提供，则智能剔除模型开头复读用户话语的毛病）
 */
export function deduplicateRepetitiveText(raw: string, userPrompt?: string): string {
  if (typeof raw !== 'string' || !raw) return '';
  let text = raw;

  // 0. 前置回显抑制：如果 AI 回复开头复读了用户的最新输入（如 用户发 "*抱住你* 你好呀"，AI 开头也是 "*抱住你* 你好呀"）
  if (userPrompt && typeof userPrompt === 'string') {
    const cleanUser = userPrompt.trim();
    const normUser = normalizeForComparison(cleanUser);
    if (normUser.length >= 4) {
      const trimmed = text.trim();
      const firstParagraph = trimmed.split(/\n+/)[0].trim();
      const normFirstPara = normalizeForComparison(firstParagraph);
      if (normFirstPara === normUser || (normFirstPara.length >= normUser.length && normFirstPara.startsWith(normUser))) {
        text = trimmed.slice(firstParagraph.length).replace(/^\s+/, '');
      } else if (trimmed.startsWith(cleanUser)) {
        text = trimmed.slice(cleanUser.length).replace(/^\s+/, '');
      }
    }
  }

  // 1. 段落级去重：检查并消除单条消息内出现的完全重复或高度相似段落（阈值降为 4 字符）
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const seenParagraphs = new Set<string>();
  const dedupedParagraphs: string[] = [];

  for (const p of paragraphs) {
    const normalized = normalizeForComparison(p);
    if (normalized.length >= 4 && seenParagraphs.has(normalized)) {
      continue; // 重复段落，跳过
    }
    if (normalized.length >= 4) {
      seenParagraphs.add(normalized);
    }
    dedupedParagraphs.push(p);
  }
  text = dedupedParagraphs.join('\n\n');

  // 2. 连续重复动作/神态短标签循环抑制（如 *喘息* *喘息* *喘息* 或 （脸红）（脸红）（脸红）限制为最多 2 次）
  text = text.replace(/((?:[\*＊_~～]{1,3}|[（(【\[])[^\s\*＊_()（）\[\]【】~～]{1,10}(?:[\*＊_~～]{1,3}|[）)\]】]))(?:\s*\1){2,}/gu, '$1 $1');

  // 3. 连续重复整句/长短语去重（长度在 4 到 120 字符之间紧邻或由空格换行分隔出现的重复）
  // 使用限定窗口避免 O(N²) 回溯：仅在 500 字符片段内扫描，然后滑动前进
  {
    const chunkSize = 500;
    const overlap = 120;
    let result = '';
    let pos = 0;
    while (pos < text.length) {
      const end = Math.min(pos + chunkSize, text.length);
      let chunk = text.slice(pos, end);
      chunk = chunk.replace(/(.{4,120}?)(?:\s*\1)+/gu, (match, group) => {
        const trimmed = group.trim();
        if (trimmed.length >= 4 && !/^[\s。！？…~,，.!?]+$/.test(trimmed)) {
          return group;
        }
        return match;
      });
      if (pos === 0) {
        result = chunk;
      } else {
        result += chunk;
      }
      pos = end < text.length ? end - overlap : end;
      if (pos > 0 && pos < text.length) {
        // Skip overlap region (already processed)
        pos = end;
      }
    }
    text = result;
  }

  // 4. 标点差异/标点变异的相邻重复句子去重（例如：“你也是这么想的吧……你也是这么想的吧。”）
  const sentencePattern = /([^。！？!?\n]{4,80})([。！？!?…~]+(?:\s*))([^。！？!?\n]{4,80})([。！？!?…~]*)/gu;
  text = text.replace(sentencePattern, (fullMatch, s1, p1, s2, p2) => {
    const n1 = normalizeForComparison(s1);
    const n2 = normalizeForComparison(s2);
    if (n1.length >= 4 && (n1 === n2 || (n1.length > 6 && (n1.startsWith(n2) || n2.startsWith(n1))))) {
      return s1 + (p2 || p1);
    }
    return fullMatch;
  });

  // 5. 滑动窗口近邻句子循环抑制（防止两句交替死循环 A。B。A。B。）
  const sentences = text.split(/([。！？!?\n]+)/).filter(Boolean);
  if (sentences.length >= 6) {
    const kept: string[] = [];
    const recentNorms: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const sentenceText = sentences[i];
      const punctuation = sentences[i + 1] || '';
      const norm = normalizeForComparison(sentenceText);
      if (norm.length >= 6 && recentNorms.slice(-3).includes(norm)) {
        continue;
      }
      if (norm.length >= 6) {
        recentNorms.push(norm);
        if (recentNorms.length > 5) recentNorms.shift();
      }
      kept.push(sentenceText + punctuation);
    }
    text = kept.join('');
  }

  // 6. 短疑问词/短句/语气词逗号停顿循环抑制（如连续 3 次及以上的 “主人，主人，主人，主人” 或 “快点……快点……快点……” 限制为最多 2 次）
  text = text.replace(/([^\s，,、。！？!?…~]{1,8}[，,、。！？!?…~]+)\s*(?:\1\s*){2,}/gu, '$1$1');

  return text;
}

/**
 * 综合安全过滤：用于酒馆聊天气泡渲染、流式展示与历史消息持久化
 */
export function sanitizeTavernVisibleContent(raw: string, isStreaming = false, userPrompt?: string): string {
  if (typeof raw !== 'string' || !raw) return '';
  const cleaned = stripInternalControlTags(stripThinkingArtifacts(raw, isStreaming), isStreaming);
  if (isStreaming) return cleaned;
  return deduplicateRepetitiveText(cleaned, userPrompt).trim();
}

/**
 * 智能无缝合并续写内容（消除前缀/后缀重叠、标点变异、断句复读与整句回显）
 * @param previous 上一段未完内容
 * @param incoming 新续写的内容
 */
export function mergeContinuationContent(previous: string, incoming: string): string {
  let p = sanitizeTavernVisibleContent(previous, false);
  let c = sanitizeTavernVisibleContent(incoming, false);
  if (!p) return c;
  if (!c) return p;

  // 1. 如果 incoming 完全被 previous 结尾包含，直接忽略
  if (p.endsWith(c) || p.includes(c)) return p;

  // 2. 字符级精确重叠检测（从长到短，最小 4 字符）
  const maxOverlap = Math.min(p.length, c.length);
  for (let len = maxOverlap; len >= 4; len--) {
    if (p.slice(-len) === c.slice(0, len)) {
      return deduplicateRepetitiveText((p + c.slice(len)).trim());
    }
  }

  // 3. 语义子句级重叠检测：检查 incoming 开头的分句是否已经存在于 previous 末尾 200 字符内
  let safetyLoop = 0;
  while (c.length > 0 && safetyLoop < 5) {
    safetyLoop++;
    const inClauses = c.split(/([。！？!?\n]+)/).filter(Boolean);
    if (inClauses.length === 0) break;
    const firstClause = (inClauses[0] || '') + (inClauses[1] || '');
    const normFirstClause = normalizeForComparison(firstClause);

    if (normFirstClause.length >= 4) {
      const pTail = p.slice(-200);
      const normPTail = normalizeForComparison(pTail);
      if (normPTail.includes(normFirstClause)) {
        let matchedCount = 0;
        let cutPos = 0;
        for (let j = 0; j < c.length; j++) {
          const chNorm = normalizeForComparison(c[j]);
          if (chNorm) matchedCount += chNorm.length;
          if (matchedCount >= normFirstClause.length) {
            cutPos = j + 1;
            while (cutPos < c.length && /[”"』」’'\s。！？!?…~]/.test(c[cutPos])) {
              cutPos++;
            }
            break;
          }
        }
        if (cutPos > 0 && cutPos <= c.length) {
          c = c.slice(cutPos).trim();
          continue;
        }
      }
    }
    break;
  }

  if (!c) return p;

  // 4. 自然拼接：如果 previous 最后一个字符未结句（如汉字、字母、逗号），直接连接；否则换行连接
  const lastChar = p.slice(-1);
  if (/[，、；:：a-zA-Z0-9\u4e00-\u9fa5]/.test(lastChar)) {
    return deduplicateRepetitiveText((p + c).trim());
  }
  return deduplicateRepetitiveText((p + '\n\n' + c).trim());
}

/**
 * 句子终结标点正则
 * 中英文中表明句子完整结束的标点符号：
 * 句号、感叹号、问号、省略号、波浪号、右引号、右括号、动作星号等
 */
const TERMINAL_PUNCTUATION_REGEX = /[。！？…~”」』）\)\*!?:：\.]$/;

/**
 * 检测 AI 回复是否由于 Token 耗尽在半途中被截断
 * @param text 待检测的消息正文
 */
export function isSentenceTruncated(text: string): boolean {
  if (typeof text !== 'string') return false;
  // 先净化掉任何泄露代码或控制标签，防止因尾部残留 think 标签误判截断
  const cleaned = sanitizeTavernVisibleContent(text, false);
  const trimmed = cleaned.trim();
  // 极短内容或无内容的系统消息不视作截断
  if (trimmed.length < 5) return false;

  // 以完整终结标点结束的视作完整句子
  if (TERMINAL_PUNCTUATION_REGEX.test(trimmed)) {
    return false;
  }

  // 如果以逗号、连词、顿号、破折号或普通汉字英文字母结束，判定为可能截断
  return true;
}

/**
 * 构造无缝续写系统指导 Prompt
 * @param truncatedContent 被截断的上文
 */
export function buildContinuationInstruction(truncatedContent: string): string {
  const cleaned = sanitizeTavernVisibleContent(truncatedContent, false);
  const safeSnippet = typeof cleaned === 'string'
    ? cleaned.trim().slice(-60).replace(/^[^\w\u4e00-\u9fa5]+/, '')
    : '';
  return [
    '【无缝续写严格指令】',
    '你上一轮的回复由于输出长度限制被强制截断了。',
    safeSnippet ? `上一段末尾中断处的文字是：【${safeSnippet}】。` : '',
    '要求：',
    '1. 必须直接紧接上述中断处的最后一个字继续往下写，严禁从头重新开始，严禁重复上述已写内容或已写动作！',
    '2. 严禁输出任何多余的前言、问候、客套或戏外说明（例如不得输出“好的”、“我继续”等）。',
    '3. 严禁输出任何思考标签（如 <think>、</think> 等）、内部代码或多余的状态标记。',
    '4. 保持角色身份、第一人称视角与当前场景张力，自然补全未说完的话或未完成的动作。',
  ].filter(Boolean).join('\n');
}

