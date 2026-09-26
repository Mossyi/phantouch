import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import { ContractIntensity } from '../types';
import {
  Lock,
  Unlock,
  ShieldAlert,
  Flame,
  Clock,
  Sparkles,
  Award,
  AlertCircle,
  FileCheck,
  Zap,
  RotateCcw,
} from 'lucide-react';

export const ContractView: React.FC = () => {
  const {
    contractState,
    startDisciplineContract,
    stopDisciplineContract,
    llmConfig,
    getAllPersonas,
    triggerEmergencyStop,
  } = useAppStore();

  const [selectedMinutes, setSelectedMinutes] = useState(20);
  const [selectedIntensity, setSelectedIntensity] = useState<ContractIntensity>('standard');

  const allPersonas = getAllPersonas();
  const currentPersona =
    allPersonas.find((p) => p.id === llmConfig.selectedPersonaId) || PRESET_PERSONAS[0];

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const intensityOptions: {
    key: ContractIntensity;
    label: string;
    desc: string;
    badge: string;
    color: string;
  }[] = [
    {
      key: 'mild',
      label: '温和陪伴 (Mild)',
      desc: '每 5-8 分钟突击查岗一次，适合日常放松与慢调陪伴。',
      badge: '🌸 温和',
      color: 'border-teal-200 bg-teal-50/80 text-teal-800',
    },
    {
      key: 'standard',
      label: '标准支配 (Standard)',
      desc: '每 3-5 分钟突击查岗一次，常规服从与耐力磨砺。',
      badge: '⚡ 标准',
      color: 'border-pink-200 bg-pink-50/80 text-pink-800',
    },
    {
      key: 'severe',
      label: '严苛惩教 (Severe)',
      desc: '每 2-3 分钟突击查岗一次，密集脉冲轰炸，考验极限。',
      badge: '🔥 严苛',
      color: 'border-amber-200 bg-amber-50/80 text-amber-800',
    },
    {
      key: 'hardcore',
      label: '地狱地牢 (Hardcore)',
      desc: '每 60-120 秒高频查岗突袭，神经高度紧绷，随时狂暴。',
      badge: '💀 地狱',
      color: 'border-rose-200 bg-rose-50/80 text-rose-800',
    },
  ];

  const handleStart = () => {
    startDisciplineContract(selectedMinutes, selectedIntensity);
  };

  const totalSeconds = contractState.durationMinutes * 60;
  const progressPercent = contractState.isActive && totalSeconds > 0
    ? Math.min(
        100,
        Math.max(
          0,
          Math.floor(
            ((totalSeconds - contractState.remainingSeconds) / totalSeconds) * 100
          )
        )
      )
    : 0;

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-28 space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between p-3.5 bg-white border border-pink-100 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600 border border-pink-200 shadow-sm">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <span>赛博契约 & 锁权调教</span>
              <span className="text-[9px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full font-mono font-bold">
                DISCIPLINE
              </span>
            </h2>
            <p className="text-[10.5px] text-slate-500">将设备绝对控制权上锁移交，接受 AI 监督与突袭查岗</p>
          </div>
        </div>
      </div>

      {/* ================= 契约执行中状态面板 ================= */}
      {contractState.isActive ? (
        <div className="space-y-4">
          {/* 发光倒计时卡片 */}
          <div className="bg-gradient-to-b from-white via-pink-50/40 to-rose-50/30 border border-pink-200 rounded-3xl p-5 shadow-[0_8px_30px_rgba(233,104,146,0.08)] text-center space-y-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-pink-700 font-semibold">
              <span className="flex items-center gap-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-pink-500" /> 契约锁权执行中
              </span>
              <span className="font-mono bg-white px-2.5 py-0.5 rounded-full border border-pink-200 text-pink-700 shadow-xs">
                支配者: {currentPersona.name} {currentPersona.avatar}
              </span>
            </div>

            {/* 倒计时数字 */}
            <div className="py-2">
              <div className="text-5xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 animate-pulse">
                {formatTime(contractState.remainingSeconds)}
              </div>
              <span className="text-[10.5px] text-slate-500 block mt-1 font-medium">剩余锁定时间</span>
            </div>

            {/* 履约进度条 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10.5px] text-slate-500 font-mono font-bold">
                <span>履约进度</span>
                <span className="text-pink-600">{progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-pink-100/80 rounded-full overflow-hidden p-0.5 border border-pink-200">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* 查岗战绩统计 */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-pink-100">
              <div className="bg-white p-2.5 rounded-xl border border-pink-100 shadow-xs">
                <span className="text-[9.5px] text-slate-500 block">突袭查岗</span>
                <span className="text-sm font-black text-slate-800 font-mono">
                  {contractState.totalSurgeChecks} 次
                </span>
              </div>
              <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 shadow-xs">
                <span className="text-[9.5px] text-emerald-700 block font-medium">合格通过</span>
                <span className="text-sm font-black text-emerald-700 font-mono">
                  {contractState.passedSurgeChecks} 次
                </span>
              </div>
              <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-100 shadow-xs">
                <span className="text-[9.5px] text-rose-700 block font-medium">怠慢受罚</span>
                <span className="text-sm font-black text-rose-700 font-mono">
                  {contractState.failedSurgeChecks} 次
                </span>
              </div>
            </div>

            {/* 紧急中断按钮 */}
            <div className="pt-2">
              <button
                onClick={() => triggerEmergencyStop()}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-black shadow-md shadow-rose-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <ShieldAlert className="w-4 h-4" /> 触发紧急安全词 · 中断契约 (E-STOP)
              </button>
            </div>
          </div>

          {/* 实时履约流水日志 */}
          <div className="bg-white border border-pink-100 rounded-2xl p-4 space-y-2.5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-pink-500" /> 履约实时动态日志
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-1 text-[11px] font-mono pr-1">
              {contractState.historyLogs.length === 0 ? (
                <p className="text-slate-400 py-2 text-center text-xs">正在严密监控生理与服从状态...</p>
              ) : (
                contractState.historyLogs.map((log, i) => (
                  <div key={i} className="text-slate-600 py-1 border-b border-pink-50">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ================= 未激活态：契约签订仪式 ================= */
        <div className="space-y-4">
          {/* 契约条款卷轴卡片 */}
          <div className="bg-white border border-pink-100 rounded-3xl p-4.5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5 pb-3 border-b border-pink-100">
              <span className="text-2xl">{currentPersona.avatar}</span>
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  与 {currentPersona.name} 签订服从契约
                </h3>
                <p className="text-[10.5px] text-pink-600 font-medium">{currentPersona.tag}</p>
              </div>
            </div>

            {/* 1. 时长选择 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-pink-500" /> 1. 契约锁定总时长 (分钟)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 20, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMinutes(m)}
                    className={`py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                      selectedMinutes === m
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm'
                        : 'bg-pink-50/40 text-slate-600 hover:text-pink-600 hover:bg-white border border-pink-100'
                    }`}
                  >
                    {m} 分钟
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 严苛度选择 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" /> 2. 契约严苛度与突袭频率
              </label>
              <div className="space-y-1.5">
                {intensityOptions.map((opt) => (
                  <div
                    key={opt.key}
                    onClick={() => setSelectedIntensity(opt.key)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedIntensity === opt.key
                        ? opt.color + ' shadow-xs'
                        : 'bg-white border-pink-100 hover:border-pink-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                      <span className="text-[10px] font-mono font-bold">{opt.badge}</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. 契约条款明细 */}
            <div className="bg-pink-50/40 p-3 rounded-2xl border border-pink-100 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
              <p className="font-bold text-pink-700">📜 契约服从声明条款：</p>
              <p>1. 签订后，所有手动控制滑块将被锁死，由 AI 伴侣全权调控。</p>
              <p>2. 必须在 15 秒内配合突击查岗应答，超时将自动延长锁定并加罚。</p>
              <p>3. 任何时刻均可通过物理 E-STOP 或喊出安全词紧急终止。</p>
            </div>

            {/* 签订签字按钮 */}
            <button
              onClick={handleStart}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white text-sm font-black shadow-lg shadow-pink-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 hover:brightness-105"
            >
              <Lock className="w-4 h-4" /> 🩸 签字并移交设备绝对控制权
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
