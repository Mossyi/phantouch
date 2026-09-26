import React from 'react';
import { ToolActionLog } from '../types';
import { Zap, Activity, Waves, Gauge, Flame, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

interface ActionCardProps {
  toolLog: ToolActionLog;
}

export const ActionCard: React.FC<ActionCardProps> = ({ toolLog }) => {
  const getToolIcon = (name: string) => {
    switch (name) {
      case 'set_ems_strength':
      case 'send_ems_wave':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'set_toy_motor':
        return <Activity className="w-4 h-4 text-cyan-400" />;
      case 'toy_pattern':
        return <Waves className="w-4 h-4 text-pink-400" />;
      case 'toy_turbo':
        return <Flame className="w-4 h-4 text-rose-500 animate-bounce" />;
      case 'enema_fill':
      case 'enema_drain':
      case 'enema_pattern':
        return <Gauge className="w-4 h-4 text-emerald-400" />;
      case 'emergency_stop':
        return <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />;
      default:
        return <Activity className="w-4 h-4 text-purple-400" />;
    }
  };

  const formatArgs = (args: Record<string, any>) => {
    return Object.entries(args)
      .map(([k, v]) => `${k}: ${v && typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ');
  };

  return (
    <div className="liquid-glass-subtle my-2 p-3.5 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white/90 border border-white shadow-xs">
            {getToolIcon(toolLog.toolName)}
          </div>
          <div>
            <span className="text-xs font-mono font-bold text-pink-950">
              {toolLog.toolName}
            </span>
            <p className="text-[11px] text-pink-800 font-sans mt-0.5 font-medium">
              {toolLog.summary}
            </p>
          </div>
        </div>

        <div className={`liquid-chip flex items-center gap-1 px-2.5 py-0.5 font-mono text-[10px] font-bold ${toolLog.success ? 'text-emerald-700' : 'text-rose-700'}`}>
          {toolLog.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          <span>{toolLog.success ? '已生效' : '未执行'}</span>
        </div>
      </div>

      {Boolean(toolLog.args && typeof toolLog.args === 'object' && Object.keys(toolLog.args).length > 0) && (
        <div className="mt-2 pt-2 border-t border-pink-100 text-[10px] font-mono text-pink-900/70 font-semibold truncate">
          参数: {formatArgs(toolLog.args)}
        </div>
      )}
    </div>
  );
};
