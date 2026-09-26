import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

interface WaveVisualizerProps {
  channel: 'A' | 'B';
  strength: number;
  activeWaveName?: string | null;
  height?: number;
}

export const WaveVisualizer: React.FC<WaveVisualizerProps> = ({
  channel,
  strength,
  activeWaveName,
  height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;
    let lastTime = performance.now();

    const render = (now = performance.now()) => {
      const dt = Math.min(Math.max(0, now - lastTime), 50);
      lastTime = now;
      const speedMultiplier = dt > 0 ? dt / 16.666 : 1;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayW = Math.max(260, Math.floor(rect.width || 340));
      const displayH = height;

      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const w = displayW;
      const h = displayH;
      const midY = h / 2;

      // 填充高质感纯白示波器底色
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // 绘制微光网格背景（淡粉晶格）
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 20) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 20) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // 中轴参考线
      ctx.strokeStyle = 'rgba(244, 63, 142, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      // 如果强度为 0，画一条微抖动的待机平线
      if (strength === 0) {
        ctx.strokeStyle = channel === 'A' ? 'rgba(2, 132, 199, 0.45)' : 'rgba(225, 29, 72, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // 根据强度和波形生成示波曲线
      const color = channel === 'A' ? '#0284c7' : '#e11d48';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = channel === 'A' ? 'rgba(2, 132, 199, 0.35)' : 'rgba(225, 29, 72, 0.35)';
      ctx.shadowBlur = 4;

      ctx.beginPath();
      const baseAmp = strength > 0 ? Math.max(2, Math.sqrt(strength / 200) * (midY - 4)) : 0;
      const amplitude = Math.min(midY - 4, baseAmp);
      const freq = activeWaveName ? 0.08 : 0.04;

      for (let x = 0; x < w; x++) {
        let y = midY;
        if (activeWaveName === 'combo') {
          const square = Math.sin(x * 0.1 + phase) > 0 ? 1 : -1;
          y = midY + square * amplitude * (Math.sin(x * 0.02) > 0 ? 1 : 0);
        } else if (activeWaveName === 'heartbeat') {
          const beat = Math.exp(-Math.pow((x % 60) - 30, 2) / 20);
          y = midY - beat * amplitude * 1.5 + Math.sin(x * freq + phase) * 4;
        } else {
          y = midY + Math.sin(x * freq + phase) * amplitude * Math.cos(x * 0.01);
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      phase += (0.08 + (strength / 200) * 0.15) * speedMultiplier;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [channel, strength, activeWaveName, height]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-white border border-pink-200/90 shadow-[inset_0_1px_4px_rgba(244,114,182,0.06),0_2px_8px_rgba(15,23,42,0.03)]">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="w-full block"
      />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
          channel === 'A' ? 'bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs' : 'bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs'
        }`}>
          通道 {channel}
        </span>
        {activeWaveName && (
          <span className="text-[10px] font-mono bg-pink-50/90 text-pink-800 px-1.5 py-0.5 rounded-md border border-pink-200/90 shadow-2xs font-semibold">
            {activeWaveName}
          </span>
        )}
      </div>
      <div className="absolute bottom-1.5 right-2 text-[10px] font-mono text-slate-400 z-10 pointer-events-none">
        输出强度: <span className="text-slate-800 font-black">{strength}</span> / 200
      </div>
    </div>
  );
};
