import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, CheckCircle2, HeartPulse, Sparkles, X, XCircle, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { evaluateSensorChallenge, sensorDisplayedValue, type RpgSensorChallenge } from '../../core/tavern/tavernRpg';
import { useOverlayBack } from './useOverlayBack';

export interface RpgSensorChallengeModalProps {
  challenge: RpgSensorChallenge;
  courseName: string;
  onComplete: (success: boolean) => void;
  onCancel: () => void;
}

export const RpgSensorChallengeModal: React.FC<RpgSensorChallengeModalProps> = ({
  challenge,
  courseName,
  onComplete,
  onCancel,
}) => {
  const deviceState = useAppStore((state) => state.deviceState);
  const heartRateState = useAppStore((state) => state.heartRateState);

  const [isHoldingTouch, setIsHoldingTouch] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [holdSuccessMs, setHoldSuccessMs] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  const settledRef = useRef(false);
  onCompleteRef.current = onComplete;
  onCancelRef.current = onCancel;

  const totalMs = challenge.durationSeconds * 1000;
  const isPressure = challenge.type === 'pressure';

  // Physical hardware readings
  const sensorDeviceConnected = Boolean(deviceState.devices.sensor?.isConnected || deviceState.devices.enema?.isConnected);
  const physicalPressure = Math.max(
    Number(deviceState.sensor?.pressureKpa) || 0,
    Number(deviceState.enema?.pressureA) || 0
  );

  const hrDeviceConnected = Boolean(heartRateState.isConnected);
  const physicalHr = Number(heartRateState.currentBpm) || 0;

  const currentPressure = sensorDisplayedValue({
    type: 'pressure',
    holding: isHoldingTouch,
    deviceConnected: sensorDeviceConnected,
    deviceValue: physicalPressure,
  });
  const currentHr = sensorDisplayedValue({
    type: 'heart_rate',
    holding: isHoldingTouch,
    deviceConnected: hrDeviceConnected,
    deviceValue: physicalHr,
  });
  const displayedValue = isPressure ? currentPressure : currentHr;
  const isConditionMet = evaluateSensorChallenge(challenge, displayedValue);

  const isConditionMetRef = useRef(isConditionMet);
  isConditionMetRef.current = isConditionMet;

  useEffect(() => {
    if (isFinished) return;

    const interval = 100; // 100ms ticks
    const timer = setInterval(() => {
      setElapsedMs((prevElapsed) => {
        const nextElapsed = prevElapsed + interval;
        if (isConditionMetRef.current) {
          setHoldSuccessMs((prevHold) => prevHold + interval);
        }

        if (nextElapsed >= totalMs) {
          clearInterval(timer);
          setIsFinished(true);
          return totalMs;
        }
        return nextElapsed;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [totalMs, isFinished]);

  const settle = (success: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCompleteRef.current(success);
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancelRef.current();
  };
  useOverlayBack(cancel);

  useEffect(() => {
    const stop = () => setIsHoldingTouch(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  useEffect(() => {
    if (!isFinished) return undefined;
    // outcome 不能放进依赖：写完结果再渲染会清掉这个定时器，挑战就停在结果页不结算。
    const pass = holdSuccessMs >= totalMs * 0.7;
    setOutcome(pass ? 'success' : 'fail');
    const finishTimer = window.setTimeout(() => settle(pass), 1500);
    return () => window.clearTimeout(finishTimer);
  }, [isFinished, holdSuccessMs, totalMs]);

  const remainingSeconds = Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
  const progressPercent = Math.min(100, Math.round((holdSuccessMs / totalMs) * 100));

  const content = (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-white via-pink-50/30 to-violet-50/40 p-5 shadow-2xl border border-pink-100 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensor-challenge-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 text-white shadow-md shadow-pink-500/25">
              {isPressure ? <Activity className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
            </div>
            <div>
              <h3 id="sensor-challenge-title" className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                {challenge.label}
              </h3>
              <span className="text-[10px] font-semibold text-violet-600 bg-violet-100/70 px-2 py-0.5 rounded-full">
                {courseName}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="放弃挑战"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Instruction Banner */}
        <div className="rounded-2xl bg-white/80 border border-pink-100/80 p-3 shadow-xs">
          <p className="text-[11px] leading-relaxed font-medium text-slate-700">
            {challenge.instruction}
          </p>
          <div className="mt-2 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">
              硬件状态：{isPressure
                ? (sensorDeviceConnected ? '🟢 压力外设已连接' : '⚪ 未检测到压力传感器')
                : (hrDeviceConnected ? '🟢 心率外设已连接' : '⚪ 未检测到心率设备')}
            </span>
            <span className="font-bold text-pink-600">
              目标：{isPressure ? `≥ ${challenge.targetValue} kPa` : `≤ ${challenge.targetValue} BPM`}
            </span>
          </div>
        </div>

        {/* Live Sensor Gauge Display */}
        <div className={`rounded-2xl p-4 text-center transition-all duration-300 border ${
          isConditionMet
            ? 'bg-emerald-500/10 border-emerald-300 text-emerald-800 shadow-xs'
            : 'bg-slate-100 border-slate-200 text-slate-700'
        }`}>
          <div className="text-[11px] font-bold opacity-75">
            {isPressure ? '当前括约肌压力' : '当前实时心率'}
          </div>
          <div className="my-1 text-3xl font-black tracking-tight font-mono">
            {isPressure ? `${currentPressure.toFixed(1)}` : `${currentHr}`}
            <span className="ml-1 text-xs font-bold text-slate-500">
              {isPressure ? 'kPa' : 'BPM'}
            </span>
          </div>
          <div className="text-[11px] font-semibold">
            {isConditionMet ? (
              <span className="text-emerald-600 flex items-center justify-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> 达标中，请保持！
              </span>
            ) : (
              <span className="text-amber-600">
                {isPressure ? '未达标，请持续夹紧或按住屏幕' : '心率偏高，请深吸气平复心跳'}
              </span>
            )}
          </div>
        </div>

        {/* Progress & Countdown */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-600">维持进度 ({progressPercent}%)</span>
            <span className="text-violet-600 font-mono">剩余 {remainingSeconds} 秒</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 rounded-full ${
                progressPercent >= 70 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-pink-500 to-violet-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[9.5px] text-slate-400 text-center">
            维持达标时间需达到 70% 即可通过具身检定
          </p>
        </div>

        {/* Fallback Touch Hold Button for users without physical sensor */}
        {(!sensorDeviceConnected || !hrDeviceConnected) && !isFinished && (
          <button
            type="button"
            onMouseDown={() => setIsHoldingTouch(true)}
            onMouseUp={() => setIsHoldingTouch(false)}
            onTouchStart={(e) => { e.preventDefault(); setIsHoldingTouch(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setIsHoldingTouch(false); }}
            className={`w-full select-none rounded-2xl py-3 px-4 text-xs font-black transition-all active:scale-98 shadow-md ${
              isHoldingTouch
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'
                : 'bg-gradient-to-r from-violet-600 to-pink-600 text-white hover:opacity-95 shadow-violet-500/25'
            }`}
          >
            {isHoldingTouch ? '✊ 正在全力发力 / 平复呼吸中（松开即停止）' : '👆 无外设？按住此处进行触控拟真训练'}
          </button>
        )}

        {/* Outcome Display when finished */}
        {outcome && (
          <div className={`rounded-2xl p-3 text-center text-xs font-black flex items-center justify-center gap-2 ${
            outcome === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}>
            {outcome === 'success' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                挑战达成！具身检定判定大获成功
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-600" />
                未达指标！具身检定判定失败
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-pink-100/60">
          <button
            type="button"
            onClick={cancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            跳过挑战（投骰检定）
          </button>
          {outcome && (
            <button
              type="button"
              onClick={() => settle(outcome === 'success')}
              className="flex-1 rounded-xl bg-violet-600 py-2 text-xs font-black text-white hover:bg-violet-700 shadow-md shadow-violet-500/20 transition"
            >
              完成结算
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};
