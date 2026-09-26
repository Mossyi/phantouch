export type TavernQuickCommandId =
  | 'parentheses'
  | 'narrator'
  | 'ooc'
  | 'inner'
  | 'camera'
  | 'describe'
  | 'detail'
  | 'continue'
  | 'advance'
  | 'timeskip'
  | 'pace'
  | 'heart'
  | 'soft-heart'
  | 'music';

export interface TavernQuickCommand {
  id: TavernQuickCommandId;
  label: string;
  hint: string;
  insertion: string;
  cursorBack?: number;
  enableOoc?: boolean;
}

export const TAVERN_QUICK_COMMANDS: TavernQuickCommand[] = [
  { id: 'parentheses', label: '（ ）', hint: '动作或补充', insertion: '（）', cursorBack: 1 },
  { id: 'narrator', label: '旁白', hint: '旁白：', insertion: '（旁白：）', cursorBack: 1 },
  { id: 'ooc', label: 'OOC', hint: '戏外沟通', insertion: '', enableOoc: true },
  { id: 'inner', label: '内心', hint: '角色内心', insertion: '（内心：）', cursorBack: 1 },
  { id: 'camera', label: '摄像机视角', hint: '切换镜头', insertion: '（摄像机视角：）', cursorBack: 1 },
  // 所有叙事动作只写入草稿，由用户检查或补充后手动发送。
  { id: 'describe', label: '描写画面', hint: '描写当前画面', insertion: '（描写当前画面）' },
  { id: 'detail', label: '详细描写', hint: '增加细节', insertion: '（详细描写）' },
  { id: 'continue', label: '继续', hint: '延续上一段', insertion: '（继续）' },
  { id: 'advance', label: '推进剧情', hint: '进入下一个场景', insertion: '（推进剧情到下一个场景）' },
  { id: 'timeskip', label: '时间流逝', hint: '时间向前推进', insertion: '（时间流逝——）' },
  { id: 'pace', label: '加快节奏', hint: '减少铺垫', insertion: '（加快节奏）' },
  { id: 'heart', label: '♡', hint: '轻柔情绪', insertion: '♡' },
  { id: 'soft-heart', label: '♡……', hint: '害羞停顿', insertion: '♡……' },
  { id: 'music', label: '♪', hint: '轻快语气', insertion: '♪' },
];

export const applyTavernQuickCommand = (
  currentText: string,
  commandId: TavernQuickCommandId,
): { text: string; cursor: number; enableOoc: boolean } | null => {
  const command = TAVERN_QUICK_COMMANDS.find((item) => item.id === commandId);
  if (!command) return null;
  const base = typeof currentText === 'string' ? currentText.slice(0, 50_000) : '';
  const separator = base && command.insertion && !/\s$/.test(base) ? ' ' : '';
  const text = `${base}${separator}${command.insertion}`.slice(0, 50_000);
  return {
    text,
    cursor: Math.max(0, text.length - (command.cursorBack || 0)),
    enableOoc: command.enableOoc === true,
  };
};
