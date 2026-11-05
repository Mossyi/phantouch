import React from 'react';
import { Mic, MicOff, PhoneOff, Phone, Hand, OctagonX, Captions, CaptionsOff, Ear, EarOff } from 'lucide-react';
import { TavernAvatar } from './TavernAvatar';
import { VoiceCallSession, type VoiceCallDeps, type VoiceCallSnapshot } from '../../core/voice/voiceCallSession';
import { playHangupTone, playRingback, playRingtone } from '../../core/voice/callTones';

export type PhoneCallDirection = 'outgoing' | 'incoming';

export interface PhoneCallSummary {
  direction: PhoneCallDirection;
  /** 是否真的接通过 */
  connected: boolean;
  durationSec: number;
  /** 来电未接（超时） */
  missed: boolean;
  /** 来电被拒接 */
  declined: boolean;
}

interface PhoneCallOverlayProps {
  name: string;
  avatar: string;
  direction: PhoneCallDirection;
  createDeps: () => VoiceCallDeps;
  /** 接通后角色先说的那一轮（会作为一条消息进入聊天记录） */
  openingLine: string;
  onEnd: (summary: PhoneCallSummary) => void;
  onEmergencyStop: () => void;
}

const INCOMING_TIMEOUT_MS = 30_000;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const PHASE_LABELS: Partial<Record<VoiceCallSnapshot['phase'], string>> = {
  connecting: '正在接通…',
  listening: '正在听你说',
  user_speaking: '正在听你说',
  transcribing: '正在听你说',
  thinking: '对方正在想…',
  speaking: '对方正在说话',
};

export const PhoneCallOverlay: React.FC<PhoneCallOverlayProps> = ({
  name,
  avatar,
  direction,
  createDeps,
  openingLine,
  onEnd,
  onEmergencyStop,
}) => {
  const sessionRef = React.useRef<VoiceCallSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new VoiceCallSession(createDeps());
  const session = sessionRef.current;
  const [snapshot, setSnapshot] = React.useState<VoiceCallSnapshot>(() => session.getSnapshot());
  const [now, setNow] = React.useState(() => Date.now());
  const [showCaptions, setShowCaptions] = React.useState(true);
  const endedRef = React.useRef(false);
  const stopToneRef = React.useRef<(() => void) | null>(null);
  // 父组件每次重渲染都会传入新的回调；放进 ref，避免响铃 / 接通流程被重新启动
  const onEndRef = React.useRef(onEnd);
  onEndRef.current = onEnd;
  const openingLineRef = React.useRef(openingLine);
  openingLineRef.current = openingLine;

  React.useEffect(() => session.subscribe(setSnapshot), [session]);

  const finish = React.useCallback((summary: Omit<PhoneCallSummary, 'direction'>) => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopToneRef.current?.();
    stopToneRef.current = null;
    session.hangUp();
    if (summary.connected) playHangupTone();
    // 留一点时间显示「通话结束」，再关闭界面
    window.setTimeout(() => onEndRef.current({ direction, ...summary }), summary.connected ? 900 : 300);
  }, [direction, session]);

  const connect = React.useCallback(() => {
    stopToneRef.current?.();
    stopToneRef.current = null;
    void session.connect(openingLineRef.current);
  }, [session]);

  // 拨出：回铃几声后对方接起；来电：响铃等待接听，超时算未接
  React.useEffect(() => {
    if (direction === 'outgoing') {
      session.setPhase('ringing_out');
      stopToneRef.current = playRingback();
      const pickUp = window.setTimeout(connect, 2500 + Math.random() * 2500);
      return () => window.clearTimeout(pickUp);
    }
    session.setPhase('ringing_in');
    stopToneRef.current = playRingtone();
    try { navigator.vibrate?.([600, 400, 600, 400, 600]); } catch {}
    const missed = window.setTimeout(() => finish({ connected: false, durationSec: 0, missed: true, declined: false }), INCOMING_TIMEOUT_MS);
    return () => window.clearTimeout(missed);
  }, [connect, direction, finish, session]);

  React.useEffect(() => () => {
    stopToneRef.current?.();
    session.hangUp();
  }, [session]);

  React.useEffect(() => {
    if (!snapshot.connectedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [snapshot.connectedAt]);

  const durationSec = snapshot.connectedAt ? Math.max(0, Math.floor((now - snapshot.connectedAt) / 1000)) : 0;

  const hangUp = () => finish({
    connected: Boolean(snapshot.connectedAt),
    durationSec,
    missed: false,
    declined: direction === 'incoming' && snapshot.phase === 'ringing_in',
  });

  const phase = snapshot.phase;
  const isRinging = phase === 'ringing_in' || phase === 'ringing_out';
  const peerTalking = phase === 'speaking';
  const userTalking = phase === 'user_speaking';
  const statusText = phase === 'ringing_out'
    ? '正在呼叫…'
    : phase === 'ringing_in'
      ? '邀请你语音通话…'
      : phase === 'ended'
        ? `通话结束 ${formatDuration(durationSec)}`
        : phase === 'error'
          ? '通话失败'
          : snapshot.connectedAt
            ? formatDuration(durationSec)
            : PHASE_LABELS[phase] || '';

  // 头像外圈：对方说话时缓慢呼吸，你说话时随音量跳动
  const ringScale = userTalking ? 1 + snapshot.micLevel * 0.35 : peerTalking ? 1.08 : 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center select-none"
      style={{ background: 'radial-gradient(120% 70% at 50% 0%, #4a1630 0%, #1d0d17 55%, #120a10 100%)', color: '#fff' }}
      role="dialog"
      aria-label={`与 ${name} 的语音通话`}
    >
      {/* 顶部：急停始终可达（通话界面会盖住全局急停按钮） */}
      <div className="flex w-full max-w-md items-center justify-between px-4 pt-safe-header">
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}>
          {snapshot.sttMode === 'cloud' ? '实时语音 · 云端识别' : '实时语音 · 浏览器识别'}
        </span>
        <button type="button" onClick={onEmergencyStop} className="estop-button" aria-label="紧急停止全部输出">
          <OctagonX className="h-4 w-4" strokeWidth={2.4} />
          急停
        </button>
      </div>

      {/* 头像与状态 */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative grid place-items-center">
          {(isRinging || peerTalking || userTalking) && (
            <>
              <span className="absolute h-44 w-44 rounded-full animate-ping" style={{ background: 'rgba(236,90,143,0.18)', animationDuration: isRinging ? '1.6s' : '2.2s' }} />
              <span className="absolute h-40 w-40 rounded-full" style={{ background: 'rgba(236,90,143,0.22)', transform: `scale(${ringScale})`, transition: 'transform 120ms ease-out' }} />
            </>
          )}
          <div
            className="relative grid h-32 w-32 place-items-center overflow-hidden rounded-full text-6xl"
            style={{ background: 'rgba(255,255,255,0.08)', boxShadow: '0 0 0 3px rgba(255,255,255,0.12), 0 20px 60px -10px rgba(226,69,127,0.6)' }}
          >
            <TavernAvatar avatar={avatar} name={name} />
          </div>
        </div>
        <h2 className="mt-7 text-2xl font-bold tracking-wide">{name}</h2>
        <p className="mt-2 font-mono text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{statusText}</p>
        {snapshot.connectedAt && phase !== 'ended' && phase !== 'error' && (
          <p className="mt-1 text-xs" style={{ color: peerTalking ? '#f9a8c8' : 'rgba(255,255,255,0.5)' }}>
            {snapshot.muted ? '麦克风已静音' : PHASE_LABELS[phase]}
          </p>
        )}

        {/* 实时字幕 */}
        {showCaptions && snapshot.connectedAt && (
          <div className="mt-8 w-full max-w-sm space-y-2 text-center">
            {snapshot.userCaption && (
              <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>你：{snapshot.userCaption}</p>
            )}
            {snapshot.aiCaption && (
              <p className="text-[15px] font-medium leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)' }}>{snapshot.aiCaption}</p>
            )}
          </div>
        )}
        {snapshot.error && (
          <p className="mt-6 max-w-sm rounded-2xl px-4 py-3 text-center text-[13px] leading-relaxed" style={{ background: 'rgba(225,29,72,0.18)', color: '#fecdd5' }}>
            {snapshot.error}
          </p>
        )}
      </div>

      {/* 底部控制 */}
      <div className="w-full max-w-md px-8 pb-[calc(2rem+clamp(0px,env(safe-area-inset-bottom,0px),1.75rem))]">
        {phase === 'ringing_in' ? (
          <div className="flex items-end justify-between px-4">
            <CallButton label="拒接" color="#e5484d" onClick={hangUp}><PhoneOff className="h-7 w-7" /></CallButton>
            <CallButton label="接听" color="#22c55e" onClick={connect}><Phone className="h-7 w-7" /></CallButton>
          </div>
        ) : (
          <>
            {snapshot.connectedAt && phase !== 'ended' && phase !== 'error' && (
              <div className="mb-7 grid grid-cols-4 gap-2">
                <SmallButton
                  label={snapshot.muted ? '取消静音' : '静音'}
                  active={snapshot.muted}
                  onClick={() => session.setMuted(!snapshot.muted)}
                >
                  {snapshot.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </SmallButton>
                <SmallButton
                  label="打断"
                  disabled={phase !== 'speaking' && phase !== 'thinking'}
                  onClick={() => session.interrupt()}
                >
                  <Hand className="h-5 w-5" />
                </SmallButton>
                <SmallButton
                  label={snapshot.bargeInEnabled ? '可插话' : '不插话'}
                  active={!snapshot.bargeInEnabled}
                  onClick={() => session.setBargeInEnabled(!snapshot.bargeInEnabled)}
                  title="外放且出现「自己打断自己」时关闭：角色说话期间不再收音"
                >
                  {snapshot.bargeInEnabled ? <Ear className="h-5 w-5" /> : <EarOff className="h-5 w-5" />}
                </SmallButton>
                <SmallButton label={showCaptions ? '字幕' : '无字幕'} active={!showCaptions} onClick={() => setShowCaptions((value) => !value)}>
                  {showCaptions ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
                </SmallButton>
              </div>
            )}
            <div className="flex justify-center">
              <CallButton label={phase === 'ended' || phase === 'error' ? '关闭' : '挂断'} color="#e5484d" onClick={hangUp}>
                <PhoneOff className="h-7 w-7" />
              </CallButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CallButton: React.FC<{ label: string; color: string; onClick: () => void; children: React.ReactNode }> = ({ label, color, onClick, children }) => (
  <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 active:scale-95 transition-transform" aria-label={label}>
    <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: color, color: '#fff', boxShadow: `0 10px 30px -8px ${color}` }}>
      {children}
    </span>
    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>{label}</span>
  </button>
);

const SmallButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}> = ({ label, onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={active}
    className="flex flex-col items-center gap-1.5 transition-opacity active:scale-95 disabled:opacity-35"
  >
    <span
      className="grid h-12 w-12 place-items-center rounded-full"
      style={{ background: active ? '#fff' : 'rgba(255,255,255,0.12)', color: active ? '#1d0d17' : '#fff' }}
    >
      {children}
    </span>
    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
  </button>
);
