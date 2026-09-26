export interface TavernMacroContext {
  char?: string;
  user?: string;
  date?: Date;
}

const WEEKDAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/**
 * 将酒馆通用宏变量（{{char}}, {{user}}, {{time}}, {{date}}, {{weekday}}, {{random::a,b,c}}）动态转义为实际上下文
 */
export const expandTavernMacros = (
  template: unknown,
  context: TavernMacroContext = {},
): string => {
  if (typeof template !== 'string' || !template) return '';

  const charName = (context.char || '').trim() || 'AI';
  const userName = (context.user || '').trim() || '旅人';
  const now = context.date instanceof Date && !isNaN(context.date.getTime()) ? context.date : new Date();

  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const weekdayStr = WEEKDAY_NAMES_ZH[now.getDay()] || '星期日';

  let result = template;

  // 1. 转义 random 宏：{{random::a::b::c}} 或 {{random::a,b,c}} 或 {{random:a,b,c}}
  result = result.replace(
    /\{\{random(?:::|:)([^}]+)\}\}/gi,
    (_, choicesRaw: string) => {
      const choices = choicesRaw
        .split(/::|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (choices.length === 0) return '';
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      return chosen || '';
    },
  );

  // 2. 转义角色名宏：{{char}}, {{Char}}, {{CHAR}}, <char>, <CHAR>, <bot>, <BOT>
  result = result.replace(/\{\{char\}\}/gi, () => charName);
  result = result.replace(/<(?:char|bot)>/gi, () => charName);

  // 3. 转义用户名宏：{{user}}, {{User}}, {{USER}}, <user>, <USER>
  result = result.replace(/\{\{user\}\}/gi, () => userName);
  result = result.replace(/<user>/gi, () => userName);

  // 4. 时间与日期宏
  result = result.replace(/\{\{time\}\}/gi, timeStr);
  result = result.replace(/\{\{date\}\}/gi, dateStr);
  result = result.replace(/\{\{weekday\}\}/gi, weekdayStr);

  return result.slice(0, 100_000);
};
