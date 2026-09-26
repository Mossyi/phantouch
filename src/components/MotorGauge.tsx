import React from 'react';

interface MotorGaugeProps {
  label: string;
  value: number; // 0 - 20
  max?: number;
  color?: string;
  subLabel?: string;
}

export const MotorGauge: React.FC<MotorGaugeProps> = ({
  label,
  value,
  max = 20,
  color = '#00f0ff',
  subLabel,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const strokeDash = 2 * Math.PI * 36;
  const strokeDashoffset = strokeDash - (strokeDash * percentage) / 100;

  return (
    <div className="flex flex-col items-center bg-white/70 backdrop-blur-md border border-pink-200/80 p-3 rounded-2xl shadow-xs hover:border-pink-300/80 transition-all">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* 背景圆环 */}
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 88 88">
          <circle
            cx="44"
            cy="44"
            r="36"
            stroke="#fbcfe8"
            strokeWidth="7"
            fill="transparent"
          />
          {/* 动态发光进度环 */}
          <circle
            cx="44"
            cy="44"
            r="36"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={strokeDash}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 0.3s ease',
              filter: value > 0 ? `drop-shadow(0 0 6px ${color})` : 'none',
            }}
          />
        </svg>

        {/* 中心数值与刻度 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none select-none">
          <span className="text-2xl font-mono font-black text-pink-950 leading-none tracking-tight">
            {value}
          </span>
          <span className="text-[11px] text-pink-900/70 font-mono font-bold mt-1">
            / {max}
          </span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <p className="text-xs font-bold text-pink-950">{label}</p>
        {subLabel && <p className="text-[10px] text-pink-800/70">{subLabel}</p>}
      </div>
    </div>
  );
};
