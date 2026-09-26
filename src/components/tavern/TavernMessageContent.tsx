import React, { useMemo } from 'react';
import { highlightMessage } from '../../core/tavern/messageFinder';
import { sanitizeTavernVisibleContent } from '../../core/tavern/tavernTextSanitizer';

export type NarrativeTokenType = 'action' | 'dialogue' | 'thought' | 'bracket' | 'normal';

export interface NarrativeToken {
  type: NarrativeTokenType;
  text: string;
}

/**
 * 匹配角色扮演中常见的叙事标记：
 * 1. 肢体动作：*动作*、**动作**、***动作***、_动作_、__动作__、＊全角星号动作＊、~波浪号动作~、～全角波浪号动作～
 * 2. 对话台词：“双引号台词”、"英文双引号"、「日式角引号」、『日式双角引号』、‘单引号’、'英文单引号'（允许中英文引号互闭）
 * 3. 心理神态：全角中文括号（神态心理）、半角英文括号(内心独白)（排除 Markdown 链接 URL 如 ](...)，支持中英混用括号）
 * 4. 场景状态：全角黑括号【状态系统】、半角方括号[系统提示]（排除 Markdown 链接文本如 [...](url)）
 */
const OPEN_QUOTES = '“"”「『‘\'‹«';
const CLOSE_QUOTES = '”"“」』’\'›»';

const ACTION_PART = `(?:\\*{1,3}|_{1,2}|＊{1,3}|~{1,2}|～{1,2})[\\s\\S]{1,1500}?(?:\\*{1,3}|_{1,2}|＊{1,3}|~{1,2}|～{1,2})`;
const DIALOGUE_PART = `[${OPEN_QUOTES}](?:[^${CLOSE_QUOTES}\\n]|\\n(?!\\n)){1,2000}[${CLOSE_QUOTES}]`;
const THOUGHT_PART = `(?<!\\])[（\\(](?:[^）\\)\\n]|\\n(?!\\n)){1,1000}[）\\)]`;
const BRACKET_PART = `[【\\[](?:[^】\\]\\n]|\\n(?!\\n)){1,1000}[】\\]](?!\\()`;

const NARRATIVE_REGEX = new RegExp(`(${ACTION_PART}|${DIALOGUE_PART}|${THOUGHT_PART}|${BRACKET_PART})`, 'g');

export function classifyToken(text: string): NarrativeTokenType {
  if (!text) return 'normal';
  const first = text[0];
  const last = text[text.length - 1];

  if (['*', '_', '＊', '~', '～'].includes(first) && ['*', '_', '＊', '~', '～'].includes(last)) {
    // 排除仅有一个 ~ 的情况（例如 "交给我吧~" 末尾语气波浪号）
    if ((first === '~' || first === '～') && text.length <= 2) return 'normal';
    return 'action';
  }
  if (OPEN_QUOTES.includes(first)) {
    return 'dialogue';
  }
  if (['（', '('].includes(first) && ['）', ')'].includes(last)) {
    return 'thought';
  }
  if (['【', '['].includes(first) && ['】', ']'].includes(last)) {
    return 'bracket';
  }
  return 'normal';
}

/**
 * 递归分解动作块内嵌套的完整台词（“...”）或心理神态（（...）），
 * 防止整句被外部星号吞噬导致台词丢失颜色
 */
function splitNestedTokens(tokens: NarrativeToken[]): NarrativeToken[] {
  const result: NarrativeToken[] = [];
  const innerRegex = new RegExp(`(${DIALOGUE_PART}|${THOUGHT_PART}|${BRACKET_PART})`, 'g');

  for (const token of tokens) {
    if (token.type !== 'action' && token.type !== 'normal') {
      result.push(token);
      continue;
    }

    innerRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    let hasNested = false;

    while ((match = innerRegex.exec(token.text)) !== null) {
      hasNested = true;
      if (match.index > lastIdx) {
        const prefix = token.text.slice(lastIdx, match.index);
        if (prefix) {
          result.push({
            type: token.type,
            text: prefix,
          });
        }
      }

      const nestedText = match[0];
      let nestedType: NarrativeTokenType = 'normal';
      if (OPEN_QUOTES.includes(nestedText[0])) {
        nestedType = 'dialogue';
      } else if (['（', '('].includes(nestedText[0])) {
        nestedType = 'thought';
      } else if (['【', '['].includes(nestedText[0])) {
        nestedType = 'bracket';
      }
      result.push({
        type: nestedType,
        text: nestedText,
      });

      lastIdx = innerRegex.lastIndex;
    }

    if (hasNested) {
      if (lastIdx < token.text.length) {
        const suffix = token.text.slice(lastIdx);
        if (suffix) {
          result.push({
            type: token.type,
            text: suffix,
          });
        }
      }
    } else {
      result.push(token);
    }
  }

  return result;
}

/**
 * 将酒馆/伴侣对谈消息分词为不同动作类型：动作、心理神态、台词、场景状态与常规文本
 * 并智能支持流式打字中途尚未闭合的尾部标记即时着色
 */
export function parseNarrativeTokens(raw: string): NarrativeToken[] {
  if (!raw) return [];

  const tokens: NarrativeToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  NARRATIVE_REGEX.lastIndex = 0;
  while ((match = NARRATIVE_REGEX.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const interstitial = raw.slice(lastIndex, match.index);
      // 检查间隙中是否包含未闭合动作（如以 * 或 ＊ 开头但未闭合的短动作，防止动作在台词前丢失颜色）
      const unclosedActionMatch = /^(\s*)(\*{1,3}|＊{1,3}|_{1,2})([^*\n＊_]{1,400})$/s.exec(interstitial);
      if (unclosedActionMatch) {
        if (unclosedActionMatch[1]) {
          tokens.push({ type: 'normal', text: unclosedActionMatch[1] });
        }
        tokens.push({
          type: 'action',
          text: unclosedActionMatch[2] + unclosedActionMatch[3],
        });
      } else {
        tokens.push({
          type: 'normal',
          text: interstitial,
        });
      }
    }

    const matchedText = match[0];
    tokens.push({
      type: classifyToken(matchedText),
      text: matchedText,
    });

    lastIndex = NARRATIVE_REGEX.lastIndex;
  }

  if (lastIndex < raw.length) {
    const trailingText = raw.slice(lastIndex);
    // 检查末尾是否有正在流式打字输出、尚未闭合的动作/台词/心理标记
    const delimiterMatch = new RegExp(
      `^(.*?)(\\*{1,3}|_{1,2}|＊{1,3}|[${OPEN_QUOTES}]|[（\\(]|[【\\[])([^“”"「」『』‘’'‹«›»（\\(\\)）\\[\\]【】*_＊]*)$`,
      's',
    ).exec(trailingText);
    if (delimiterMatch) {
      const [, prefix, delim, rest] = delimiterMatch;
      if (prefix) {
        tokens.push({ type: 'normal', text: prefix });
      }
      let trailingType: NarrativeTokenType = 'normal';
      if (['*', '_', '＊'].some((c) => delim.startsWith(c))) {
        trailingType = 'action';
      } else if (OPEN_QUOTES.includes(delim)) {
        trailingType = 'dialogue';
      } else if (['（', '('].includes(delim)) {
        trailingType = 'thought';
      } else if (['【', '['].includes(delim)) {
        trailingType = 'bracket';
      }
      tokens.push({ type: trailingType, text: delim + rest });
    } else {
      tokens.push({
        type: 'normal',
        text: trailingText,
      });
    }
  }

  const splitTokens = splitNestedTokens(tokens);

  // 智能隐式台词增强：若整条回复没有使用显式引号包裹台词，但存在肢体动作或心理标记，
  // 说明模型采用了“动作+裸台词”的小说对白规范，自动将具有实质内容的非空段落识别为台词！
  const hasExplicitDialogue = splitTokens.some((t) => t.type === 'dialogue');
  const hasActionOrThought = splitTokens.some((t) => t.type === 'action' || t.type === 'thought');

  if (!hasExplicitDialogue && hasActionOrThought) {
    return splitTokens.map((t) => {
      if (t.type === 'normal' && t.text.trim().length > 0) {
        return { type: 'dialogue', text: t.text };
      }
      return t;
    });
  }

  return splitTokens;
}

const NARRATIVE_CACHE = new Map<string, NarrativeToken[]>();
const MAX_NARRATIVE_CACHE = 1000;

export function getCachedNarrativeTokens(text: string): NarrativeToken[] {
  const cached = NARRATIVE_CACHE.get(text);
  if (cached) return cached;
  const parsed = parseNarrativeTokens(text);
  if (NARRATIVE_CACHE.size >= MAX_NARRATIVE_CACHE) {
    const firstKey = NARRATIVE_CACHE.keys().next().value;
    if (firstKey !== undefined) NARRATIVE_CACHE.delete(firstKey);
  }
  NARRATIVE_CACHE.set(text, parsed);
  return parsed;
}

export interface TavernMessageContentProps {
  content: string;
  searchQuery?: string;
  enabled?: boolean;
  isUser?: boolean;
  isDark?: boolean;
  isStreaming?: boolean;
}

export const TavernMessageContent: React.FC<TavernMessageContentProps> = React.memo(({
  content,
  searchQuery = '',
  enabled = true,
  isUser = false,
  isDark = false,
  isStreaming = false,
}) => {
  const sanitizedContent = useMemo(
    () => sanitizeTavernVisibleContent(content, isStreaming),
    [content, isStreaming],
  );

  const tokens = useMemo(
    () => {
      if (!enabled || !sanitizedContent) return [];
      return isStreaming
        ? parseNarrativeTokens(sanitizedContent)
        : getCachedNarrativeTokens(sanitizedContent);
    },
    [enabled, sanitizedContent, isStreaming],
  );

  if (!sanitizedContent) return null;

  // 未启用语法高亮时，回退到经典纯文本 + 搜索高亮
  if (!enabled) {
    return (
      <>
        {highlightMessage(sanitizedContent, searchQuery).map((part, index) => (
          part.hit ? (
            <mark key={index} className="bg-amber-200 text-slate-950 rounded-sm">
              {part.text}
            </mark>
          ) : (
            part.text
          )
        ))}
      </>
    );
  }

  return (
    <>
      {tokens.map((token, tokenIdx) => {
        const highlightedParts = highlightMessage(token.text, searchQuery);

        const renderedText = highlightedParts.map((part, partIdx) => (
          part.hit ? (
            <mark key={`${tokenIdx}_${partIdx}`} className="bg-amber-200 text-slate-950 rounded-sm">
              {part.text}
            </mark>
          ) : (
            part.text
          )
        ));

        // 1. 肢体动作 (*...* / **...** / _..._)：高辨识度天幕湛蓝 (text-[#0284c7] / text-sky-700，font-semibold italic)
        if (token.type === 'action') {
          const actionClass = isUser
            ? 'italic font-medium text-sky-100'
            : isDark
            ? 'italic font-semibold text-sky-300 tracking-wide'
            : 'italic font-semibold text-[#0284c7] tracking-wide';
          return (
            <span key={tokenIdx} className={actionClass}>
              {renderedText}
            </span>
          );
        }

        // 2. 心理活动/神态细节 (（...） / (...))：深邃紫罗兰星云色 (text-[#7e22ce] / text-purple-700，font-semibold italic)
        if (token.type === 'thought') {
          const thoughtClass = isUser
            ? 'italic font-medium text-purple-200'
            : isDark
            ? 'italic font-semibold text-purple-300 tracking-wide'
            : 'italic font-semibold text-[#7e22ce] tracking-wide';
          return (
            <span key={tokenIdx} className={thoughtClass}>
              {renderedText}
            </span>
          );
        }

        // 3. 对话台词 (“...” / "..." / 「...」)：晶莹明艳瑰丽玫红 (text-[#e11d48] font-bold)，契合白粉唯美色调且与动作湛蓝形成极高对比度！
        if (token.type === 'dialogue') {
          const dialogueClass = isUser
            ? 'font-bold text-rose-200 tracking-wide'
            : isDark
            ? 'font-bold text-rose-300 tracking-wide'
            : 'font-bold text-[#e11d48] tracking-wide';
          return (
            <span key={tokenIdx} className={dialogueClass}>
              {renderedText}
            </span>
          );
        }

        // 4. 场景状态/判定提示 (【...】 / [...])：高对比度清透翡翠绿 (text-[#047857])
        if (token.type === 'bracket') {
          const bracketClass = isUser
            ? 'font-mono font-medium text-emerald-200 text-[0.95em]'
            : isDark
            ? 'font-mono font-semibold text-emerald-400 text-[0.95em]'
            : 'font-mono font-semibold text-[#047857] text-[0.95em]';
          return (
            <span key={tokenIdx} className={bracketClass}>
              {renderedText}
            </span>
          );
        }

        // 5. 常规背景叙事文本：在浅底采用高清晰石墨炭黑 (text-slate-800)，在深底采用明亮浅灰 (text-slate-200)
        const normalClass = isUser
          ? 'font-normal text-white'
          : isDark
          ? 'font-normal text-slate-200 leading-relaxed'
          : 'font-normal text-slate-800 leading-relaxed';
        return (
          <span key={tokenIdx} className={normalClass}>
            {renderedText}
          </span>
        );
      })}
    </>
  );
});
