import { DeviceSystemState, ConnectionMode, SafetyConfig } from '../types';
import { YCYToyProtocol } from './protocol/toyProtocol';
import { YCYEnemaProtocol } from './protocol/enemaProtocol';
import { YCYEMSProtocol } from './protocol/emsProtocol';
import {
  CoyoteV2Protocol,
  CoyoteV3Protocol,
  CoyoteWaveformConverter,
  COYOTE_V2_UUIDS,
  COYOTE_V3_UUIDS,
} from './protocol/coyoteProtocol';
import { EMSWaveEngine } from './protocol/waveEngine';
import { TOY_PATTERNS } from './protocol/toyPatterns';
import { ENEMA_PATTERNS } from './protocol/enemaPatterns';
import { AchievementEngine } from './achievements/achievementEngine';
import { BountyQuestEngine } from './tavern/bountyQuestEngine';
import { BLEManager, EMSProtocolVersion } from './bluetooth/bleManager';
import { DeviceSimulator } from './bluetooth/simulator';
import { YCYIMBridgeClient } from './bridge/ycyImClient';
import { DGLabSocketClient } from './bridge/dglabSocketClient';
import { clampOutputToLimit, normalizeFiniteRange, normalizeSafetyLimit, randomIntegerWithinLimits } from './safetyLimits';
import { normalizeSiliconflowTtsModel, normalizeSiliconflowTtsVoice } from './voice/siliconflowTts';

export type DeviceStateCallback = (state: DeviceSystemState) => void;
export type EmergencyStopCallback = () => void;
type HardwareWriteChannel = 'ems' | 'toy' | 'enema' | 'bridge';

const TOY_PATTERN_ALIASES: Record<string, string> = {
  gentle_wave: 'gentle',
  breathe_pulse: 'breathe',
  warmup_crescendo: 'rollercoaster',
  milking_burst: 'climax_milking',
  turbo_milking: 'climax_milking',
  deep_pulse: 'pulse',
  intermittent_wave: 'wave',
  wild_surge: 'punishment_surge',
  staircase: 'mountain_climb',
  tease_burst: 'rapid_flicker',
};

const ENEMA_PATTERN_ALIASES: Record<string, string> = {
  medium_fill: 'slow_fill',
};

/**
 * 全局设备与硬件通讯调度中枢
 */
export class DeviceManager {
  private static instance: DeviceManager | null = null;
  private stateCallbacks: DeviceStateCallback[] = [];
  private emergencyCallbacks: EmergencyStopCallback[] = [];

  private bleManagers: Record<'ems' | 'toy' | 'enema', BLEManager> = {
    ems: new BLEManager(),
    toy: new BLEManager(),
    enema: new BLEManager(),
  };
  private simulator: DeviceSimulator;
  private imClient: YCYIMBridgeClient;
  private dglabClient: DGLabSocketClient;
  private coyoteSeq: number = 0;
  private coyoteStreamTimer: any = null;
  private coyoteStreamStep: number = 0;
  private isCoyoteStreamingBusy: boolean = false;

  private currentMode: ConnectionMode = 'simulator';
  private safetyConfig: SafetyConfig = {
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    maxToyMotorARate: 20,
    maxToyMotorBRate: 2,
    maxToyMotorCRate: 20,
    minToyMotorRate: 1,
    minEnemaDurationSec: 1,
    maxEnemaDurationSec: 60,
    emergencyLock: false,
    vibrationFeedback: true,
    voiceFeedback: true,
    autoPlayVoice: true,
    handsFreeVoiceMode: false,
    sttEngine: 'browser',
    siliconflowSttApiKey: '',
    siliconflowSttModel: 'FunAudioLLM/SenseVoiceSmall',
    volcengineSttApiKey: '',
    volcengineSttAppId: '',
    volcengineSttAccessKey: '',
    volcengineSttResourceId: 'volc.bigasr.auc_turbo',
    ttsEngine: 'siliconflow',
    siliconflowTtsApiKey: '',
    siliconflowTtsModel: 'FunAudioLLM/CosyVoice2-0.5B',
    siliconflowTtsVoice: 'anna',
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceGain: 0,
  };

  private currentState: DeviceSystemState;
  private stateListeners: Set<DeviceStateCallback> = new Set();
  private emergencyStopListeners: Set<EmergencyStopCallback> = new Set();

  private activeToyPatternTimer: any = null;
  private activeEnemaPatternTimer: any = null;
  private activeEmsStopTimer: any = null;
  private turboTimer: any = null;
  private enemaOperationTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private toyOperationGeneration = 0;
  private enemaOperationGeneration = 0;
  private emsOperationGeneration = 0;
  private scheduledOutputStopTimers: Partial<Record<'ems' | 'toy', ReturnType<typeof setTimeout>>> = {};
  private scheduledOutputGenerations: Record<'ems' | 'toy', number> = { ems: 0, toy: 0 };

  /**
   * 下调安全上限的瞬间，设备还没收到停止指令，仍会按旧上限回报输出。
   * 这里记录「下调前已被授权的输出强度」并开启一个短暂窗口，让看门狗能区分
   * 「停止指令送达前的残留上报」与「设备真的超限输出」：
   * 窗口内不超过旧授权值的回报被忽略；超过旧授权值的回报仍然立刻锁急停；
   * 窗口结束后恢复严格判定，避免放过真正卡住的设备。
   */
  private static readonly EMS_STALE_REPORT_GRACE_MS = 3000;
  private emsStaleReportGraceUntil = 0;
  private emsStaleAuthorizedCeilingA = 0;
  private emsStaleAuthorizedCeilingB = 0;

  private hardwareWriteQueues: Record<HardwareWriteChannel, Promise<void>> = {
    ems: Promise.resolve(),
    toy: Promise.resolve(),
    enema: Promise.resolve(),
    bridge: Promise.resolve(),
  };
  private hardwareWriteGenerations: Record<HardwareWriteChannel, number> = {
    ems: 0,
    toy: 0,
    enema: 0,
    bridge: 0,
  };

  private constructor() {
    this.simulator = new DeviceSimulator();
    this.imClient = new YCYIMBridgeClient();
    this.dglabClient = new DGLabSocketClient({
      onStatusChange: (status, detail) => {
        if (this.currentMode !== 'dglab') return;
        if (status === 'connected') {
          this.currentState.connectionStatus = 'connected';
          this.currentState.deviceName = 'DG-LAB 郊狼 App 互联中继';
          this.currentState.deviceId = this.dglabClient.getTargetId();
          this.currentState.lastHeartbeat = Date.now();
        } else if (status === 'waiting_pair') {
          this.currentState.connectionStatus = 'connecting';
          this.currentState.deviceName = detail || '等待 DG-LAB App 扫码绑定';
        } else if (status === 'disconnected') {
          this.currentState.connectionStatus = 'disconnected';
          this.currentState.deviceName = 'DG-LAB WebSocket 已断开';
        } else if (status === 'error') {
          this.currentState.connectionStatus = 'error';
          this.currentState.deviceName = detail || 'DG-LAB 连接异常';
        }
        this.notifyState();
      },
      onStrengthUpdate: (strengthA, strengthB, limitA, limitB) => {
        if (this.currentMode !== 'dglab') return;
        this.currentState.ems.strengthA = strengthA;
        this.currentState.ems.strengthB = strengthB;
        this.currentState.ems.limitA = limitA;
        this.currentState.ems.limitB = limitB;
        this.currentState.ems.isShocking = strengthA > 0 || strengthB > 0;
        this.currentState.lastHeartbeat = Date.now();
        this.notifyState();
      },
    });

    this.currentState = this.simulator.getState();

    // 订阅模拟器状态
    this.simulator.subscribe((simState) => {
      if (this.currentMode === 'simulator') {
        this.currentState.batteryLevel = simState.batteryLevel;
        this.currentState.lastHeartbeat = simState.lastHeartbeat;
        this.currentState.enema.pressureA = simState.enema.pressureA;
        this.currentState.enema.pressureB = simState.enema.pressureB;
        this.currentState.enema.battery = simState.enema.battery;
        this.notifyState();
      }
    });

    // 绑定多设备蓝牙监听
    Object.entries(this.bleManagers).forEach(([key, manager]) => {
      const category = key as 'ems' | 'toy' | 'enema';
      manager.onNotify((bytes) => {
        this.handleBleNotify(bytes, category);
      });
      manager.onDisconnect(() => {
        // H1 修复：意外断连时清除所有后台定时器并重置硬件输出状态
        // emergencyStop 会清除全部 EMS/Toy/Enema 定时器、取消排队写操作、
        // 并将所有输出通道置零，避免定时器继续向断连设备发送指令
        void this.emergencyStop().catch(() => {});
        this.currentState.devices[category].isConnected = false;
        this.currentState.devices[category].name = null;
        this.updateGlobalConnectionStatus();
        this.notifyState();
      });
    });
  }

  static getInstance(): DeviceManager {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : (window as any);
    if (!g.__YCY_DEVICE_MANAGER__) {
      g.__YCY_DEVICE_MANAGER__ = new DeviceManager();
    }
    return g.__YCY_DEVICE_MANAGER__;
  }

  subscribeState(cb: DeviceStateCallback): () => void {
    this.stateListeners.add(cb);
    cb(this.getState());
    return () => this.stateListeners.delete(cb);
  }

  subscribeEmergencyStop(cb: EmergencyStopCallback): () => void {
    this.emergencyStopListeners.add(cb);
    return () => this.emergencyStopListeners.delete(cb);
  }

  private notifyEmergencyStop() {
    this.emergencyStopListeners.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.error('急停订阅回调执行失败:', error);
      }
    });
  }

  private notifyState() {
    const s = this.getState();
    this.stateListeners.forEach((cb) => {
      try {
        cb(s);
      } catch (error) {
        console.error('设备状态订阅回调执行失败:', error);
      }
    });
  }

  getState(): DeviceSystemState {
    return JSON.parse(JSON.stringify(this.currentState));
  }

  getSafetyConfig(): SafetyConfig {
    return { ...this.safetyConfig };
  }

  updateSafetyConfig(config: Partial<SafetyConfig>) {
    const wasEmergencyLocked = this.safetyConfig.emergencyLock;
    const previousMaxEnemaDuration = this.safetyConfig.maxEnemaDurationSec;
    const next = { ...this.safetyConfig, ...config };
    next.maxEmsStrengthA = normalizeSafetyLimit(next.maxEmsStrengthA, this.safetyConfig.maxEmsStrengthA, 200);
    next.maxEmsStrengthB = normalizeSafetyLimit(next.maxEmsStrengthB, this.safetyConfig.maxEmsStrengthB, 200);
    next.maxToyMotorARate = normalizeSafetyLimit(next.maxToyMotorARate, this.safetyConfig.maxToyMotorARate, 20);
    next.maxToyMotorBRate = normalizeSafetyLimit(next.maxToyMotorBRate, this.safetyConfig.maxToyMotorBRate, 20);
    next.maxToyMotorCRate = normalizeSafetyLimit(next.maxToyMotorCRate, this.safetyConfig.maxToyMotorCRate, 20);
    const jointEmsMaximum = Math.min(next.maxEmsStrengthA, next.maxEmsStrengthB);
    next.minEmsStrength = normalizeSafetyLimit(next.minEmsStrength, this.safetyConfig.minEmsStrength, jointEmsMaximum);
    const availableToyMaximum = Math.max(next.maxToyMotorARate, next.maxToyMotorBRate, next.maxToyMotorCRate);
    next.minToyMotorRate = normalizeSafetyLimit(next.minToyMotorRate, this.safetyConfig.minToyMotorRate, availableToyMaximum);
    next.maxEnemaDurationSec = normalizeSafetyLimit(next.maxEnemaDurationSec, this.safetyConfig.maxEnemaDurationSec, 60);
    next.minEnemaDurationSec = normalizeSafetyLimit(next.minEnemaDurationSec, this.safetyConfig.minEnemaDurationSec, next.maxEnemaDurationSec);
    next.voiceRate = normalizeFiniteRange(next.voiceRate, this.safetyConfig.voiceRate, 0.5, 2);
    next.voicePitch = normalizeFiniteRange(next.voicePitch, this.safetyConfig.voicePitch, 0.5, 2);
    next.voiceGain = normalizeFiniteRange(next.voiceGain, this.safetyConfig.voiceGain, -10, 10);
    next.emergencyLock = next.emergencyLock === true;
    next.vibrationFeedback = next.vibrationFeedback !== false;
    next.voiceFeedback = next.voiceFeedback !== false;
    next.autoPlayVoice = next.autoPlayVoice !== false;
    next.handsFreeVoiceMode = next.handsFreeVoiceMode === true;
    if (!['browser', 'siliconflow', 'volcengine'].includes(next.sttEngine)) {
      next.sttEngine = this.safetyConfig.sttEngine;
    }
    next.siliconflowSttApiKey = String(next.siliconflowSttApiKey || '').trim().slice(0, 1000);
    next.siliconflowSttModel = ['FunAudioLLM/SenseVoiceSmall', 'TeleAI/TeleSpeechASR'].includes(String(next.siliconflowSttModel))
      ? String(next.siliconflowSttModel)
      : 'FunAudioLLM/SenseVoiceSmall';
    next.volcengineSttApiKey = String(next.volcengineSttApiKey || '').trim().slice(0, 1000);
    next.volcengineSttAppId = String(next.volcengineSttAppId || '').trim().slice(0, 200);
    next.volcengineSttAccessKey = String(next.volcengineSttAccessKey || '').trim().slice(0, 1000);
    next.volcengineSttResourceId = String(next.volcengineSttResourceId || '').trim().slice(0, 200) || 'volc.bigasr.auc_turbo';
    if (!['siliconflow', 'volcengine_tts', 'edge_neural', 'browser_native'].includes(next.ttsEngine)) {
      next.ttsEngine = this.safetyConfig.ttsEngine;
    }
    if (next.siliconflowTtsModel !== undefined) {
      next.siliconflowTtsModel = normalizeSiliconflowTtsModel(next.siliconflowTtsModel);
    }
    if (next.siliconflowTtsApiKey !== undefined) {
      next.siliconflowTtsApiKey = String(next.siliconflowTtsApiKey).trim().slice(0, 1000);
    }
    if (next.siliconflowTtsVoice !== undefined) {
      next.siliconflowTtsVoice = normalizeSiliconflowTtsVoice(next.siliconflowTtsVoice);
    }
    if (next.volcengineTtsResourceId !== undefined) {
      next.volcengineTtsResourceId = String(next.volcengineTtsResourceId).trim().slice(0, 200) || 'seed-tts-2.0';
    }
    if (next.volcengineTtsVoice !== undefined) {
      next.volcengineTtsVoice = String(next.volcengineTtsVoice).trim().slice(0, 200) || 'zh_female_vv_uranus_bigtts';
    }
    this.safetyConfig = next;
    if (!wasEmergencyLocked && this.safetyConfig.emergencyLock) {
      this.notifyEmergencyStop();
      void this.emergencyStop();
      return;
    }

    const outputExceedsNewLimit = this.currentState.ems.strengthA > next.maxEmsStrengthA
      || this.currentState.ems.strengthB > next.maxEmsStrengthB
      || this.currentState.toy.motorA > next.maxToyMotorARate
      || this.currentState.toy.motorB > next.maxToyMotorBRate
      || this.currentState.toy.motorC > next.maxToyMotorCRate
      || (
        next.maxEnemaDurationSec < previousMaxEnemaDuration
        && (this.currentState.enema.peristalticState !== 0 || this.currentState.enema.waterPumpState !== 0)
      );
    if (outputExceedsNewLimit) {
      // A lowered safety ceiling takes effect immediately. Stopping is safer
      // than briefly resending another channel's stale, now-over-limit value.
      // 先登记旧授权值，再发停止指令：设备送达前仍会按旧上限回报。
      this.markEmsStaleReportGrace();
      this.notifyEmergencyStop();
      void this.emergencyStop();
    }
  }

  getRandomEmsStrength(maxAllowed: number = 200): number {
    const maximum = Math.min(
      normalizeSafetyLimit(maxAllowed, 0, 200),
      this.safetyConfig.maxEmsStrengthA,
      this.safetyConfig.maxEmsStrengthB,
    );
    return randomIntegerWithinLimits(this.safetyConfig.minEmsStrength, maximum, 200);
  }

  getRandomEmsStrengthInConfiguredRange(): number {
    const maximum = Math.min(
      this.safetyConfig.maxEmsStrengthA,
      this.safetyConfig.maxEmsStrengthB,
    );
    return randomIntegerWithinLimits(this.safetyConfig.minEmsStrength, maximum, 200);
  }

  getRandomToyMotorRate(channel: 'A' | 'B' | 'C', maxAllowed: number = 20): number {
    const channelMaximum = channel === 'A'
      ? this.safetyConfig.maxToyMotorARate
      : channel === 'B'
        ? this.safetyConfig.maxToyMotorBRate
        : this.safetyConfig.maxToyMotorCRate;
    const maximum = Math.min(normalizeSafetyLimit(maxAllowed, 0, 20), channelMaximum);
    return randomIntegerWithinLimits(this.safetyConfig.minToyMotorRate, maximum, 20);
  }

  getRandomEnemaDuration(maxAllowed: number = 60): number {
    const maximum = Math.min(
      normalizeSafetyLimit(maxAllowed, 0, 60),
      this.safetyConfig.maxEnemaDurationSec,
    );
    return randomIntegerWithinLimits(this.safetyConfig.minEnemaDurationSec, maximum, 60);
  }

  private enqueueHardwareWrite(
    channel: HardwareWriteChannel,
    write: () => Promise<void>,
    supersedePending: boolean = false,
  ): Promise<void> {
    if (supersedePending) this.hardwareWriteGenerations[channel]++;
    const generation = this.hardwareWriteGenerations[channel];
    const guardedWrite = async () => {
      if (generation !== this.hardwareWriteGenerations[channel]) return;
      await write();
    };
    const pending = this.hardwareWriteQueues[channel].then(guardedWrite, guardedWrite);
    this.hardwareWriteQueues[channel] = pending.catch(() => undefined);
    return pending;
  }

  private invalidateQueuedHardwareWrites(): Promise<void> {
    const staleQueues = Object.values(this.hardwareWriteQueues).map((queue) => queue.catch(() => undefined));
    (Object.keys(this.hardwareWriteGenerations) as HardwareWriteChannel[]).forEach((channel) => {
      this.hardwareWriteGenerations[channel]++;
      this.hardwareWriteQueues[channel] = Promise.resolve();
    });
    return Promise.all(staleQueues).then(() => undefined);
  }

  /**
   * 记录下调上限前已被授权的 EMS 输出强度，并开启残留上报豁免窗口。
   */
  private markEmsStaleReportGrace() {
    this.emsStaleAuthorizedCeilingA = Math.max(this.emsStaleAuthorizedCeilingA, this.currentState.ems.strengthA);
    this.emsStaleAuthorizedCeilingB = Math.max(this.emsStaleAuthorizedCeilingB, this.currentState.ems.strengthB);
    this.emsStaleReportGraceUntil = Date.now() + DeviceManager.EMS_STALE_REPORT_GRACE_MS;
  }

  /**
   * 判断某次 EMS 强度回报是否属于「停止指令送达前的残留上报」。
   * 仅在下调上限后的短窗口内、且数值不超过旧授权值时为真；
   * 超过旧授权值（设备真的跑飞）或窗口已过，都按正常超限处理。
   */
  private isEmsStaleReport(channel: 'A' | 'B', reportedStrength: number): boolean {
    if (Date.now() >= this.emsStaleReportGraceUntil) {
      if (this.emsStaleReportGraceUntil !== 0) {
        this.emsStaleReportGraceUntil = 0;
        this.emsStaleAuthorizedCeilingA = 0;
        this.emsStaleAuthorizedCeilingB = 0;
      }
      return false;
    }
    const authorized = channel === 'A' ? this.emsStaleAuthorizedCeilingA : this.emsStaleAuthorizedCeilingB;
    return reportedStrength <= authorized;
  }

  async latchEmergencyStop(recordAchievement: boolean = false): Promise<string> {
    if (!this.safetyConfig.emergencyLock) {
      this.safetyConfig = { ...this.safetyConfig, emergencyLock: true };
    }
    this.notifyEmergencyStop();
    return await this.emergencyStop(recordAchievement);
  }

  private clearToyOperations() {
    this.toyOperationGeneration++;
    if (this.activeToyPatternTimer) clearTimeout(this.activeToyPatternTimer);
    if (this.turboTimer) clearTimeout(this.turboTimer);
    this.activeToyPatternTimer = null;
    this.turboTimer = null;
  }

  private clearEmsOperations() {
    this.emsOperationGeneration++;
    if (this.activeEmsStopTimer) clearTimeout(this.activeEmsStopTimer);
    this.activeEmsStopTimer = null;
  }

  private invalidateScheduledOutputStop(outputType: 'ems' | 'toy') {
    const timer = this.scheduledOutputStopTimers[outputType];
    if (timer) clearTimeout(timer);
    delete this.scheduledOutputStopTimers[outputType];
    this.scheduledOutputGenerations[outputType]++;
  }

  scheduleOutputStop(outputType: 'ems' | 'toy', durationSec: number): void {
    this.assertFiniteNumber(durationSec, '定时停止时长');
    const boundedDuration = Math.max(1, Math.min(3600, Math.round(durationSec)));
    this.invalidateScheduledOutputStop(outputType);
    const generation = this.scheduledOutputGenerations[outputType];
    this.scheduledOutputStopTimers[outputType] = setTimeout(() => {
      if (generation !== this.scheduledOutputGenerations[outputType]) return;
      delete this.scheduledOutputStopTimers[outputType];
      const stopPromise = outputType === 'ems'
        ? this.setEmsStrength('AB', 0)
        : this.stopToy();
      void stopPromise.catch((error) => {
        console.warn(`${outputType} 定时停止失败:`, error);
        void this.latchEmergencyStop();
      });
    }, boundedDuration * 1000);
  }

  private clearEnemaOperations() {
    this.enemaOperationGeneration++;
    if (this.activeEnemaPatternTimer) clearTimeout(this.activeEnemaPatternTimer);
    this.activeEnemaPatternTimer = null;
    this.enemaOperationTimers.forEach((timer) => clearTimeout(timer));
    this.enemaOperationTimers.clear();
  }

  private scheduleEnemaOperation(callback: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      this.enemaOperationTimers.delete(timer);
      callback();
    }, delayMs);
    this.enemaOperationTimers.add(timer);
  }

  private assertFiniteNumber(value: number, label: string): number {
    if (!Number.isFinite(value)) throw new Error(`${label}必须是有效数字`);
    return value;
  }

  private getWaveModeIndex(waveName: string | null): number {
    if (!waveName) return 1;
    const index = EMSWaveEngine.getAllWaves().findIndex((wave) => wave.id === waveName);
    return index < 0 ? 1 : (index % 16) + 1;
  }

  async connectBridge(connectCode: string, bridgeUrl: string = 'http://localhost:3001'): Promise<void> {
    const parsed = YCYIMBridgeClient.parseConnectCode(connectCode);
    if (!parsed) throw new Error('连接码格式错误，应为“UID Token”');
    if (this.currentMode !== 'bridge') await this.switchMode('bridge');

    this.currentState.connectionStatus = 'connecting';
    this.notifyState();
    try {
      this.imClient.setBridgeUrl(bridgeUrl);
      const loggedIn = await this.imClient.loginBridge(parsed.rawUserId, parsed.token);
      if (!loggedIn) throw new Error('API Bridge 登录失败，请确认本地服务已启动且连接码有效');
      const status = await this.imClient.getStatus();
      if (!status.isReady) throw new Error('API Bridge 已响应，但腾讯 IM 尚未就绪');

      this.currentMode = 'bridge';
      this.currentState.connectionMode = 'bridge';
      this.currentState.connectionStatus = 'connected';
      this.currentState.deviceName = '役次元官方 API Bridge';
      this.currentState.deviceId = String(status.config?.uid || parsed.uid);
      this.currentState.lastHeartbeat = Date.now();
      this.notifyState();

      try {
        const wsUrl = new URL(this.imClient.getBridgeUrl());
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        await this.imClient.connectWebSocket(wsUrl.toString(), (message) => {
          if (message?.type === 'heartbeat') {
            this.currentState.lastHeartbeat = Date.now();
            this.currentState.connectionStatus = message.data?.isReady === false ? 'error' : 'connected';
            this.notifyState();
          } else if (message?.type === 'status' && message.data) {
            this.currentState.connectionStatus = message.data.isReady === false ? 'error' : 'connected';
            this.notifyState();
          }
        });
      } catch {
        // HTTP API 已可用时，WebSocket 仅作为可选的实时状态通道。
      }
    } catch (error) {
      this.currentMode = 'bridge';
      this.currentState.connectionMode = 'bridge';
      this.currentState.connectionStatus = 'error';
      this.notifyState();
      throw error;
    }
  }

  async connectDGLabSocket(wsUrl: string = 'ws://127.0.0.1:5678'): Promise<string> {
    if (this.currentMode !== 'dglab') await this.switchMode('dglab');
    this.currentState.connectionMode = 'dglab';
    this.currentState.connectionStatus = 'connecting';
    this.currentState.deviceName = '正在连接 DG-LAB 服务器...';
    this.notifyState();
    try {
      const qrUrl = await this.dglabClient.connect(wsUrl);
      this.currentState.lastHeartbeat = Date.now();
      this.notifyState();
      return qrUrl;
    } catch (err) {
      this.currentState.connectionStatus = 'error';
      this.notifyState();
      throw err;
    }
  }

  getDGLabClient(): DGLabSocketClient {
    return this.dglabClient;
  }

  private nextCoyoteSeq(): number {
    this.coyoteSeq = (this.coyoteSeq + 1) % 16;
    if (this.coyoteSeq === 0) this.coyoteSeq = 1;
    return this.coyoteSeq;
  }

  private startCoyoteStreamLoop() {
    if (this.coyoteStreamTimer) return;
    this.coyoteStreamTimer = setInterval(() => {
      void this.tickCoyoteStreamFrame();
    }, 100);
  }

  private stopCoyoteStreamLoop() {
    if (this.coyoteStreamTimer) {
      clearInterval(this.coyoteStreamTimer);
      this.coyoteStreamTimer = null;
    }
    this.coyoteStreamStep = 0;
    this.isCoyoteStreamingBusy = false;
  }

  private async tickCoyoteStreamFrame() {
    if (this.currentMode !== 'ble' || !this.bleManagers.ems.isConnected()) {
      this.stopCoyoteStreamLoop();
      return;
    }
    const ver = this.bleManagers.ems.getEmsProtocolVersion();
    if (ver !== 'coyote_v2' && ver !== 'coyote_v3') {
      this.stopCoyoteStreamLoop();
      return;
    }
    const strA = this.currentState.ems.strengthA;
    const strB = this.currentState.ems.strengthB;
    if (strA <= 0 && strB <= 0) {
      this.stopCoyoteStreamLoop();
      return;
    }
    if (this.isCoyoteStreamingBusy) return;

    this.isCoyoteStreamingBusy = true;
    try {
      if (ver === 'coyote_v2') {
        const step = this.coyoteStreamStep++;
        const waveA = this.currentState.ems.activeWaveA || 'breathe';
        const waveB = this.currentState.ems.activeWaveB || 'breathe';

        if (strA > 0) {
          const [x, y, z] = CoyoteWaveformConverter.getV2Step(waveA, step);
          const packetA = CoyoteV2Protocol.buildWavePacket(x, y, z);
          await this.enqueueHardwareWrite('ems', () =>
            this.bleManagers.ems.sendPacket(packetA, COYOTE_V2_UUIDS.SERVICE, COYOTE_V2_UUIDS.WAVE_A_CHAR)
          );
        }
        if (strB > 0) {
          const [x, y, z] = CoyoteWaveformConverter.getV2Step(waveB, step);
          const packetB = CoyoteV2Protocol.buildWavePacket(x, y, z);
          await this.enqueueHardwareWrite('ems', () =>
            this.bleManagers.ems.sendPacket(packetB, COYOTE_V2_UUIDS.SERVICE, COYOTE_V2_UUIDS.WAVE_B_CHAR)
          );
        }
      } else if (ver === 'coyote_v3') {
        const step = this.coyoteStreamStep;
        this.coyoteStreamStep += 4;
        const waveA = this.currentState.ems.activeWaveA || 'breathe';
        const waveB = this.currentState.ems.activeWaveB || 'breathe';
        const sliceA = CoyoteWaveformConverter.getV3Slice(waveA, Math.floor(step / 4));
        const sliceB = CoyoteWaveformConverter.getV3Slice(waveB, Math.floor(step / 4));

        const packet = CoyoteV3Protocol.buildB0Packet({
          strengthA: strA,
          strengthB: strB,
          modeA: 3, // 绝对设置：每帧都重新确认强度值，确保与硬件物理按键同步
          modeB: 3,
          seq: this.nextCoyoteSeq(),
          waveFreqA: strA > 0 ? sliceA.freq : [10, 10, 10, 10],
          waveIntensityA: strA > 0 ? sliceA.intensity : [0, 0, 0, 0],
          waveFreqB: strB > 0 ? sliceB.freq : [10, 10, 10, 10],
          waveIntensityB: strB > 0 ? sliceB.intensity : [0, 0, 0, 0],
        });
        await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(packet));
      }
    } catch (err) {
      console.warn('Coyote 波形流式推送异常:', err);
    } finally {
      this.isCoyoteStreamingBusy = false;
    }
  }

  setEmsProtocolVersion(version: EMSProtocolVersion) {
    this.bleManagers.ems.setEmsProtocolVersion(version);
  }

  getEmsProtocolVersion(): EMSProtocolVersion {
    return this.bleManagers.ems.getEmsProtocolVersion();
  }

  async triggerBridgeEvent(commandId: string): Promise<string> {
    const normalized = commandId.trim();
    if (!normalized || normalized.length > 128) throw new Error('事件 ID 不能为空且不能超过 128 个字符');
    if (this.safetyConfig.emergencyLock && normalized !== '_stop_all') {
      throw new Error('急停锁已激活，拒绝执行');
    }
    if (this.currentMode !== 'bridge' || this.currentState.connectionStatus !== 'connected') {
      throw new Error('API Bridge 尚未连接');
    }
    await this.enqueueHardwareWrite('bridge', async () => {
      const ok = await this.imClient.sendCommand(normalized);
      if (!ok) throw new Error(`Bridge 事件 ${normalized} 发送失败`);
    });
    return `已触发役次元事件 ID：${normalized}`;
  }

  /**
   * 触发手机物理震动 (Web Vibration API)
   */
  private triggerHapticFeedback(pattern: number | number[] = 50) {
    if (this.safetyConfig.vibrationFeedback && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  // ================= 连接管理 =================

  async switchMode(mode: ConnectionMode): Promise<void> {
    await this.emergencyStop();
    if (this.currentMode === 'ble' && mode !== 'ble') await this.disconnectBle();
    if (this.currentMode === 'bridge' && mode !== 'bridge') this.imClient.disconnect();
    if (this.currentMode === 'dglab' && mode !== 'dglab') this.dglabClient.disconnect();
    this.currentMode = mode;
    this.currentState.connectionMode = mode;

    if (mode === 'simulator') {
      this.currentState = this.simulator.getState();
      this.currentState.connectionMode = 'simulator';
      this.currentState.connectionStatus = 'connected';
      this.notifyState();
    } else if (mode === 'ble') {
      this.currentState.connectionStatus = 'disconnected';
      this.currentState.deviceName = '等待选择硬件 BLE 设备';
      this.currentState.deviceId = null;
      this.currentState.batteryLevel = 0;
      this.currentState.lastHeartbeat = 0;
      this.currentState.enema.pressureA = 0;
      this.currentState.enema.pressureB = 0;
      this.currentState.enema.battery = 0;
      this.currentState.devices = {
        ems: { isConnected: false, name: null },
        toy: { isConnected: false, name: null },
        enema: { isConnected: false, name: null }
      };
      this.notifyState();
    } else if (mode === 'bridge') {
      this.currentState.connectionStatus = 'disconnected';
      this.currentState.deviceName = '等待连接本地 API Bridge';
      this.currentState.deviceId = null;
      this.currentState.batteryLevel = 0;
      this.currentState.lastHeartbeat = 0;
      this.notifyState();
    } else if (mode === 'dglab') {
      this.currentState.connectionStatus = 'disconnected';
      this.currentState.deviceName = '等待连接 DG-LAB WebSocket 服务';
      this.currentState.deviceId = null;
      this.currentState.batteryLevel = 0;
      this.currentState.lastHeartbeat = 0;
      this.notifyState();
    }
  }

  updateGlobalConnectionStatus() {
    const isAnyConnected = Object.values(this.currentState.devices).some(d => d.isConnected);
    if (isAnyConnected) {
      this.currentState.connectionStatus = 'connected';
      const names = Object.values(this.currentState.devices).filter(d => d.isConnected && d.name).map(d => d.name);
      this.currentState.deviceName = names.length ? names.join(', ') : '已连接多个设备';
    } else {
      this.currentState.connectionStatus = 'disconnected';
      this.currentState.deviceName = '等待选择硬件 BLE 设备';
    }
  }

  async connectBle(category: 'ems' | 'toy' | 'enema'): Promise<void> {
    try {
      if (this.currentMode !== 'ble') await this.switchMode('ble');
      this.currentState.connectionStatus = 'connecting';
      this.notifyState();

      const info = await this.bleManagers[category].scanAndConnect(category);
      if (category === 'ems') {
        const ver = this.bleManagers.ems.getEmsProtocolVersion();
        const lowerName = (info.name || '').toLowerCase();
        if (ver === 'coyote_v3') {
          if (!info.name || info.name.includes('智能硬件') || lowerName.startsWith('47l')) {
            info.name = `郊狼 Coyote 3.0 (${info.name || '47L121000'})`;
          }
        } else if (ver === 'coyote_v2') {
          if (!info.name || info.name.includes('智能硬件') || lowerName.includes('d-lab') || lowerName.includes('estim')) {
            info.name = `郊狼 Coyote 2.0 (${info.name || 'D-LAB'})`;
          }
        }
      }
      this.currentMode = 'ble';
      this.currentState.connectionMode = 'ble';
      
      this.currentState.devices[category].isConnected = true;
      this.currentState.devices[category].name = info.name;
      
      this.updateGlobalConnectionStatus();
      this.currentState.deviceId = info.id;
      this.notifyState();
    } catch (e: any) {
      this.currentState.connectionStatus = 'error';
      this.notifyState();
      throw e;
    }
  }

  async disconnectBle(category?: 'ems' | 'toy' | 'enema') {
    await this.emergencyStop();
    if (category) {
      await this.bleManagers[category].disconnect();
      // H2 修复：BLEManager.disconnect() 会抑制 onDisconnect 事件，
      // 需手动更新设备连接状态，否则 UI 永久卡在"已连接"
      this.currentState.devices[category].isConnected = false;
      this.currentState.devices[category].name = null;
    } else {
      await Promise.all(Object.values(this.bleManagers).map(m => m.disconnect()));
      for (const cat of ['ems', 'toy', 'enema'] as const) {
        this.currentState.devices[cat].isConnected = false;
        this.currentState.devices[cat].name = null;
      }
    }
    this.updateGlobalConnectionStatus();
    this.notifyState();
  }

  private handleBleNotify(bytes: Uint8Array, category: 'ems' | 'toy' | 'enema') {
    if (category === 'ems') {
      const emsVer = this.bleManagers.ems.getEmsProtocolVersion();
      if (emsVer === 'coyote_v2') {
        if (bytes.length === 3) {
          const parsed = CoyoteV2Protocol.parseStrengthPacket(bytes);
          this.currentState.ems.strengthA = parsed.strengthA;
          this.currentState.ems.strengthB = parsed.strengthB;
          this.currentState.ems.isShocking = parsed.strengthA > 0 || parsed.strengthB > 0;
          this.notifyState();
          return;
        } else if (bytes.length === 1 && bytes[0] <= 100) {
          this.currentState.batteryLevel = bytes[0];
          this.notifyState();
          return;
        }
      } else if (emsVer === 'coyote_v3') {
        const parsed = CoyoteV3Protocol.parseNotifyPacket(bytes);
        if (parsed.type === 'strength') {
          if (parsed.strengthA !== undefined) this.currentState.ems.strengthA = parsed.strengthA;
          if (parsed.strengthB !== undefined) this.currentState.ems.strengthB = parsed.strengthB;
          this.currentState.ems.isShocking = this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0;
          this.notifyState();
          return;
        } else if (parsed.type === 'battery' && parsed.battery !== undefined) {
          this.currentState.batteryLevel = parsed.battery;
          this.notifyState();
          return;
        }
      }

      const result = YCYEMSProtocol.parseNotifyPacket(bytes);
      if (result.type === 'channelA' && result.data) {
        const reportedStrength = result.data.strength;
        if (result.data.isActive === false) {
          this.currentState.ems.strengthA = 0;
        } else if (typeof reportedStrength === 'number' && Number.isFinite(reportedStrength) && reportedStrength > 0) {
          const overLimit = reportedStrength > this.safetyConfig.maxEmsStrengthA;
          // 下调上限后的残留上报：输出已归零，既不回写显示状态也不锁急停
          if (!(overLimit && this.isEmsStaleReport('A', reportedStrength))) {
            this.currentState.ems.strengthA = Math.min(YCYEMSProtocol.MAX_STRENGTH, Math.round(reportedStrength));
            if (overLimit && !this.safetyConfig.emergencyLock) {
              this.currentState.connectionStatus = 'error';
              void this.latchEmergencyStop();
            }
          }
        }
      } else if (result.type === 'channelB' && result.data) {
        const reportedStrength = result.data.strength;
        if (result.data.isActive === false) {
          this.currentState.ems.strengthB = 0;
        } else if (typeof reportedStrength === 'number' && Number.isFinite(reportedStrength) && reportedStrength > 0) {
          const overLimit = reportedStrength > this.safetyConfig.maxEmsStrengthB;
          if (!(overLimit && this.isEmsStaleReport('B', reportedStrength))) {
            this.currentState.ems.strengthB = Math.min(YCYEMSProtocol.MAX_STRENGTH, Math.round(reportedStrength));
            if (overLimit && !this.safetyConfig.emergencyLock) {
              this.currentState.connectionStatus = 'error';
              void this.latchEmergencyStop();
            }
          }
        }
      } else if (result.type === 'battery' && result.data) {
        this.currentState.batteryLevel = result.data.battery || 0;
      }
      this.currentState.ems.isShocking = this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0;
      this.notifyState();
      return;
    }
    if (category !== 'enema') return;
    const res = YCYEnemaProtocol.parseNotifyPacket(bytes);
    if (res.type === 'status' && res.data) {
      this.currentState.enema.peristalticState = res.data.peristaltic;
      this.currentState.enema.waterPumpState = res.data.waterPump;
    } else if (res.type === 'pressure' && res.data) {
      this.currentState.enema.pressureA = res.data.pressureA;
      this.currentState.enema.pressureB = res.data.pressureB;
    } else if (res.type === 'battery' && res.data) {
      this.currentState.enema.battery = res.data.battery;
      this.currentState.batteryLevel = res.data.battery;
    }
    this.notifyState();
  }

  // ================= EMS 电击控制 =================

  async setEmsStrength(channel: 'A' | 'B' | 'AB', strength: number): Promise<string> {
    this.assertFiniteNumber(strength, '电击强度');
    if (this.safetyConfig.emergencyLock && strength > 0) return '急停锁已激活，拒绝执行';
    if (this.currentMode === 'bridge' && strength > 0) {
      throw new Error('API Bridge 不支持直接设置 EMS 强度，请使用已配置的事件 ID');
    }
    if (this.currentMode === 'ble' && strength > 0 && !this.bleManagers.ems.isConnected()) {
      throw new Error('EMS 蓝牙设备尚未连接');
    }
    if (this.currentMode === 'dglab' && strength > 0 && !this.dglabClient.isConnected()) {
      throw new Error('DG-LAB 郊狼 App 尚未扫码绑定');
    }
    this.invalidateScheduledOutputStop('ems');

    let valA = this.currentState.ems.strengthA;
    let valB = this.currentState.ems.strengthB;
    if (channel === 'A' || channel === 'AB') {
      valA = clampOutputToLimit(strength, this.safetyConfig.maxEmsStrengthA, 200);
    }
    if (channel === 'B' || channel === 'AB') {
      valB = clampOutputToLimit(strength, this.safetyConfig.maxEmsStrengthB, 200);
    }

    // 1. 同步即时更新本地状态与仿真引擎 (0ms 极致响应)
    const wasShocking = this.currentState.ems.isShocking;
    if (channel === 'A' || channel === 'AB') this.currentState.ems.strengthA = valA;
    if (channel === 'B' || channel === 'AB') this.currentState.ems.strengthB = valB;
    if (strength <= 0) {
      if (channel === 'A' || channel === 'AB') this.currentState.ems.activeWaveA = null;
      if (channel === 'B' || channel === 'AB') this.currentState.ems.activeWaveB = null;
    }
    this.currentState.ems.isShocking = this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0;
    this.simulator.setEmsStrength(channel, channel === 'A' ? valA : channel === 'B' ? valB : Math.max(valA, valB));
    this.notifyState();

    // 2. 硬件下发 (若已连接真实 BLE / 郊狼 Socket 设备则异步写入协议包)
    if (this.currentMode === 'ble') {
      try {
        const strengthA = channel === 'A' || channel === 'AB' ? valA : this.currentState.ems.strengthA;
        const strengthB = channel === 'B' || channel === 'AB' ? valB : this.currentState.ems.strengthB;
        const ver = this.bleManagers.ems.getEmsProtocolVersion();
        if (ver === 'coyote_v2') {
          const packet = CoyoteV2Protocol.buildStrengthPacket(strengthA, strengthB);
          await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(packet), true);
          if (strengthA > 0 || strengthB > 0) {
            this.startCoyoteStreamLoop();
          } else {
            this.stopCoyoteStreamLoop();
          }
        } else if (ver === 'coyote_v3') {
          const packet = CoyoteV3Protocol.buildB0Packet({
            strengthA,
            strengthB,
            modeA: 3, // 绝对强度设定
            modeB: 3,
            seq: this.nextCoyoteSeq(),
          });
          await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(packet), true);
          if (strengthA > 0 || strengthB > 0) {
            this.startCoyoteStreamLoop();
          } else {
            this.stopCoyoteStreamLoop();
            await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(CoyoteV3Protocol.buildStopPacket(this.nextCoyoteSeq())), true);
          }
        } else if (ver === 'v1') {
          await this.enqueueHardwareWrite('ems', async () => {
            if (channel === 'AB' && strengthA === strengthB) {
              await this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1ChannelPacket(3, strengthA, this.getWaveModeIndex(this.currentState.ems.activeWaveA)));
            } else {
              if (channel === 'A' || channel === 'AB') await this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1ChannelPacket(1, strengthA, this.getWaveModeIndex(this.currentState.ems.activeWaveA)));
              if (channel === 'B' || channel === 'AB') await this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1ChannelPacket(2, strengthB, this.getWaveModeIndex(this.currentState.ems.activeWaveB)));
            }
          }, true);
        } else {
          const packet = YCYEMSProtocol.buildFixedModePacket(
            strengthA,
            strengthB,
            this.getWaveModeIndex(this.currentState.ems.activeWaveA),
            this.getWaveModeIndex(this.currentState.ems.activeWaveB)
          );
          await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(packet), true);
        }
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`BLE EMS 数据下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (this.currentMode === 'dglab') {
      try {
        if (channel === 'A' || channel === 'AB') await this.dglabClient.setStrength(1, valA);
        if (channel === 'B' || channel === 'AB') await this.dglabClient.setStrength(2, valB);
        if (valA <= 0 && (channel === 'A' || channel === 'AB')) await this.dglabClient.clearWave(1);
        if (valB <= 0 && (channel === 'B' || channel === 'AB')) await this.dglabClient.clearWave(2);
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`DG-LAB Socket 数据下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (this.currentMode === 'bridge' && strength <= 0) {
      await this.triggerBridgeEvent('_stop_all');
    }

    if (!wasShocking && this.currentState.ems.isShocking) {
      const appliedStrength = Math.max(this.currentState.ems.strengthA, this.currentState.ems.strengthB);
      const activeWave = this.currentState.ems.activeWaveA || this.currentState.ems.activeWaveB || undefined;
      AchievementEngine.getInstance().checkHardwareAction('ems_strength', undefined, appliedStrength);
      if (activeWave) AchievementEngine.getInstance().checkHardwareAction('ems_wave', activeWave);
      BountyQuestEngine.getInstance().incrementProgress('ems_endurance', 1, {
        strength: appliedStrength,
        wave: activeWave,
      });
    }

    this.triggerHapticFeedback(valA > 50 || valB > 50 ? [80, 40, 80] : 60);
    return `电击通道 ${channel} 强度设置为 ${channel === 'AB' ? `A:${valA} B:${valB}` : (channel === 'A' ? valA : valB)}`;
  }

  async sendEmsWave(channel: 'A' | 'B' | 'AB', waveName: string, durationSec?: number): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';
    if (this.currentMode === 'ble' && !this.bleManagers.ems.isConnected()) {
      throw new Error('EMS 蓝牙设备尚未连接');
    }
    if (this.currentMode === 'dglab' && !this.dglabClient.isConnected()) {
      throw new Error('DG-LAB 郊狼 App 尚未扫码绑定');
    }

    const wave = EMSWaveEngine.getWave(waveName);
    if (!wave) return `未知波形: ${waveName}`;
    this.invalidateScheduledOutputStop('ems');
    this.clearEmsOperations();
    const canonicalWaveId = wave.id;
    if (durationSec !== undefined) {
      this.assertFiniteNumber(durationSec, '波形时长');
      durationSec = Math.min(3600, Math.max(1, durationSec));
    }

    // 1. 同步更新本地状态与仿真
    if (channel === 'A' || channel === 'AB') this.currentState.ems.activeWaveA = canonicalWaveId;
    if (channel === 'B' || channel === 'AB') this.currentState.ems.activeWaveB = canonicalWaveId;
    this.currentState.ems.isShocking = this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0;
    this.simulator.sendEmsWave(channel, wave.name);
    this.notifyState();

    // 2. 硬件下发
    if (this.currentMode === 'ble') {
      try {
        const nextWaveA = channel === 'A' || channel === 'AB' ? canonicalWaveId : this.currentState.ems.activeWaveA;
        const nextWaveB = channel === 'B' || channel === 'AB' ? canonicalWaveId : this.currentState.ems.activeWaveB;
        const ver = this.bleManagers.ems.getEmsProtocolVersion();

        if (ver === 'coyote_v2') {
          this.coyoteStreamStep = 0;
          if (this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0) {
            this.startCoyoteStreamLoop();
            void this.tickCoyoteStreamFrame();
          }
        } else if (ver === 'coyote_v3') {
          this.coyoteStreamStep = 0;
          if (this.currentState.ems.strengthA > 0 || this.currentState.ems.strengthB > 0) {
            this.startCoyoteStreamLoop();
            void this.tickCoyoteStreamFrame();
          }
        } else if (ver === 'v1') {
          await this.enqueueHardwareWrite('ems', async () => {
            if (channel === 'A' || channel === 'AB') await this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1ChannelPacket(1, this.currentState.ems.strengthA, this.getWaveModeIndex(nextWaveA)));
            if (channel === 'B' || channel === 'AB') await this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1ChannelPacket(2, this.currentState.ems.strengthB, this.getWaveModeIndex(nextWaveB)));
          }, true);
        } else {
          const packet = YCYEMSProtocol.buildFixedModePacket(
            this.currentState.ems.strengthA,
            this.currentState.ems.strengthB,
            this.getWaveModeIndex(nextWaveA),
            this.getWaveModeIndex(nextWaveB),
          );
          await this.enqueueHardwareWrite('ems', () => this.bleManagers.ems.sendPacket(packet), true);
        }
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`BLE 波形下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (this.currentMode === 'dglab') {
      try {
        const effectiveDuration = Math.max(1, Math.min(30, durationSec || 5));
        const pulses = CoyoteWaveformConverter.convertToDGLabPulses(canonicalWaveId, effectiveDuration);
        if (pulses.length > 0) {
          await this.dglabClient.sendPulse(channel, pulses, effectiveDuration);
        }
      } catch (err) {
        console.warn('DG-LAB 波形下发失败:', err);
      }
    } else if (this.currentMode === 'bridge') {
      try {
        await this.triggerBridgeEvent(canonicalWaveId);
      } catch (error) {
        await this.latchEmergencyStop();
        throw error;
      }
    }

    this.triggerHapticFeedback([100, 30, 100, 30, 100]);
    if (this.currentState.ems.isShocking) {
      AchievementEngine.getInstance().checkHardwareAction('ems_wave', canonicalWaveId);
    }
    if (durationSec !== undefined) {
      const generation = this.emsOperationGeneration;
      this.activeEmsStopTimer = setTimeout(() => {
        if (generation === this.emsOperationGeneration) {
          void this.setEmsStrength(channel, 0).catch((error) => {
            console.warn('EMS 定时停止失败:', error);
            if (generation === this.emsOperationGeneration) void this.latchEmergencyStop();
          });
        }
      }, durationSec * 1000);
    }
    return `通道 ${channel} 正在输出电击波形: ${wave.name}${durationSec ? `（${durationSec} 秒）` : ''}`;
  }

  // ================= 飞机杯 / 跳蛋 马达控制 =================

  async setToyMotor(motorA: number, motorB: number, motorC: number): Promise<string> {
    this.assertFiniteNumber(motorA, '马达 A 速率');
    this.assertFiniteNumber(motorB, '马达 B 速率');
    this.assertFiniteNumber(motorC, '马达 C 速率');
    const isStopping = motorA <= 0 && motorB <= 0 && motorC <= 0;
    if (this.safetyConfig.emergencyLock && !isStopping) return '急停锁已激活，拒绝执行';
    if (this.currentMode === 'bridge' && !isStopping) {
      throw new Error('API Bridge 不支持直接设置马达速率，请使用已配置的事件 ID');
    }
    if (this.currentMode === 'ble' && !isStopping && !this.bleManagers.toy.isConnected()) {
      throw new Error('玩具蓝牙设备尚未连接');
    }
    this.invalidateScheduledOutputStop('toy');

    // 各通道独立速率截断
    const limitA = this.safetyConfig.maxToyMotorARate ?? 20;
    const limitB = this.safetyConfig.maxToyMotorBRate ?? 2;
    const limitC = this.safetyConfig.maxToyMotorCRate ?? 20;
    const a = Math.max(0, Math.min(limitA, Math.round(motorA)));
    const b = Math.max(0, Math.min(limitB, Math.round(motorB)));
    const c = Math.max(0, Math.min(limitC, Math.round(motorC)));

    // 1. 同步即时更新本地状态与仿真
    this.currentState.toy.motorA = a;
    this.currentState.toy.motorB = b;
    this.currentState.toy.motorC = c;
    this.simulator.setToyMotor(a, b, c);
    this.notifyState();

    // 2. 硬件下发
    if (this.currentMode === 'ble' && this.bleManagers.toy.isConnected()) {
      try {
        const packet = YCYToyProtocol.buildRatePacket(a, b, c);
        await this.enqueueHardwareWrite('toy', () => this.bleManagers.toy.sendPacket(packet), true);
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`BLE 玩具马达下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (this.currentMode === 'bridge' && isStopping) {
      await this.triggerBridgeEvent('_stop_all');
    }

    if (a > 0 || b > 0 || c > 0) {
      this.triggerHapticFeedback(Math.max(a, b, c) * 10);
      AchievementEngine.getInstance().checkHardwareAction('toy_motor', undefined, Math.max(a, b, c));
    }

    return `马达速率已调整: A(主抽插):${a} B(吮吸):${b} C(旋转):${c}`;
  }

  async playToyPattern(patternId: string, durationSec: number = 30): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';

    const canonicalPatternId = TOY_PATTERN_ALIASES[patternId] || patternId;
    const pattern = TOY_PATTERNS[canonicalPatternId];
    if (!pattern) return `未找到律动模式: ${patternId}`;

    AchievementEngine.getInstance().checkHardwareAction('toy_pattern', canonicalPatternId);

    this.assertFiniteNumber(durationSec, '模式时长');
    durationSec = Math.min(3600, Math.max(1, durationSec));
    this.clearToyOperations();
    const generation = this.toyOperationGeneration;

    this.currentState.toy.activePattern = pattern.name;
    this.currentState.toy.patternRemainingSec = durationSec;
    this.simulator.setToyPattern(pattern.name, durationSec);
    this.notifyState();

    if (this.currentMode === 'bridge') {
      try {
        await this.triggerBridgeEvent(canonicalPatternId);
      } catch (error) {
        await this.latchEmergencyStop();
        throw error;
      }
      this.activeToyPatternTimer = setTimeout(() => {
        if (generation === this.toyOperationGeneration) {
          void this.stopToy().catch((error) => {
            console.warn('Bridge 玩具模式定时停止失败:', error);
            if (generation === this.toyOperationGeneration) void this.latchEmergencyStop();
          });
        }
      }, durationSec * 1000);
      return `已通过 API Bridge 触发玩具事件【${canonicalPatternId}】（本地计时 ${durationSec} 秒）`;
    }

    // 启动按帧序列播放
    let stepIndex = 0;
    const startTime = Date.now();

    const runStep = async () => {
      if (generation !== this.toyOperationGeneration || this.safetyConfig.emergencyLock) return;
      const elapsedSec = (Date.now() - startTime) / 1000;
      const remain = Math.max(0, Math.round(durationSec - elapsedSec));
      this.currentState.toy.patternRemainingSec = remain;
      this.notifyState();

      if (elapsedSec >= durationSec) {
        await this.stopToy();
        return;
      }

      const seq = pattern.sequence;
      const [mA, mB, mC, dur] = seq[stepIndex % seq.length];
      await this.setToyMotor(mA, mB, mC);
      if (generation !== this.toyOperationGeneration || this.safetyConfig.emergencyLock) return;
      stepIndex++;

      this.activeToyPatternTimer = setTimeout(() => {
        void runStep().catch((error) => {
          console.warn('玩具律动序列执行失败:', error);
          if (generation === this.toyOperationGeneration) void this.latchEmergencyStop();
        });
      }, dur * 1000);
    };

    await runStep();
    return `正在播放律动模式【${pattern.name}】（预计 ${durationSec} 秒）`;
  }

  async triggerTurbo(durationSec: number = 5): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';
    this.assertFiniteNumber(durationSec, 'Turbo 时长');
    durationSec = Math.min(60, Math.max(1, durationSec));
    this.clearToyOperations();
    const generation = this.toyOperationGeneration;

    this.currentState.toy.isTurbo = true;
    this.simulator.setTurbo(true);
    this.notifyState();

    if (this.currentMode === 'bridge') {
      try {
        await this.triggerBridgeEvent('toy_turbo');
      } catch (error) {
        await this.latchEmergencyStop();
        throw error;
      }
      this.turboTimer = setTimeout(() => {
        if (generation === this.toyOperationGeneration) {
          void this.stopToy().catch((error) => {
            console.warn('Bridge Turbo 定时停止失败:', error);
            if (generation === this.toyOperationGeneration) void this.latchEmergencyStop();
          });
        }
      }, durationSec * 1000);
      return `已通过 API Bridge 触发事件【toy_turbo】（本地计时 ${durationSec} 秒）`;
    }

    this.currentState.toy.isTurbo = true;
    this.simulator.setTurbo(true, {
      a: this.safetyConfig.maxToyMotorARate,
      b: this.safetyConfig.maxToyMotorBRate,
      c: this.safetyConfig.maxToyMotorCRate,
    });
    await this.setToyMotor(20, 20, 20);
    this.triggerHapticFeedback([200, 50, 200, 50, 200]);

    this.turboTimer = setTimeout(() => {
      void (async () => {
        if (generation !== this.toyOperationGeneration || this.safetyConfig.emergencyLock) return;
        this.currentState.toy.isTurbo = false;
        this.simulator.setTurbo(false);
        await this.setToyMotor(4, 2, 2);
        if (generation !== this.toyOperationGeneration) return;
        this.turboTimer = null;
        this.notifyState();
      })().catch((error) => {
        console.warn('Turbo 降速失败:', error);
        if (generation === this.toyOperationGeneration) void this.latchEmergencyStop();
      });
    }, durationSec * 1000);

    return `⚡【一键超频暴走】全马达拉满至 20 极速冲刺（持续 ${durationSec} 秒）！`;
  }

  async stopToy(): Promise<void> {
    this.invalidateScheduledOutputStop('toy');
    this.clearToyOperations();
    this.currentState.toy.activePattern = null;
    this.currentState.toy.patternRemainingSec = 0;
    this.currentState.toy.isTurbo = false;
    this.simulator.stopToy();
    this.notifyState();

    if (this.currentMode === 'bridge') {
      await this.triggerBridgeEvent('_stop_all');
    } else {
      await this.setToyMotor(0, 0, 0);
    }
  }

  // ================= 智能灌肠机控制 =================

  async enemaFill(durationSec: number): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';

    this.assertFiniteNumber(durationSec, '注水时长');
    if (this.currentMode === 'bridge') {
      throw new Error('API Bridge 不支持直接设置注水时长，请使用灌肠模式事件');
    }
    if (this.currentMode === 'ble' && !this.bleManagers.enema.isConnected()) {
      throw new Error('灌肠机蓝牙设备尚未连接');
    }
    this.clearEnemaOperations();
    const generation = this.enemaOperationGeneration;
    const maxDuration = Math.floor(this.safetyConfig.maxEnemaDurationSec);
    if (maxDuration <= 0) return '灌肠机自动输出上限为 0，拒绝执行';
    const dur = Math.max(1, Math.min(maxDuration, Math.round(durationSec)));
    
    // 1. 同步状态与仿真
    this.simulator.setEnemaPeristaltic(1);
    this.currentState.enema.peristalticState = 1;
    this.currentState.enema.waterPumpState = 0;
    this.notifyState();

    // 2. 硬件下发
    if (this.currentMode === 'ble') {
      try {
        const packet = YCYEnemaProtocol.buildPeristalticPacket(1, dur);
        await this.enqueueHardwareWrite('enema', () => this.bleManagers.enema.sendPacket(packet), true);
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`BLE 灌肠注水下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    this.scheduleEnemaOperation(() => {
      if (generation === this.enemaOperationGeneration) {
        this.simulator.setEnemaPeristaltic(0);
        this.currentState.enema.peristalticState = 0;
        this.notifyState();
      }
    }, dur * 1000);

    this.triggerHapticFeedback([150, 50, 150]);
    AchievementEngine.getInstance().checkHardwareAction('enema_fill', undefined, dur);
    return `灌肠机启动蠕动泵正转注水（持续 ${dur} 秒）`;
  }

  async enemaDrain(durationSec: number): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';

    this.assertFiniteNumber(durationSec, '排水时长');
    if (this.currentMode === 'bridge') {
      throw new Error('API Bridge 不支持直接设置排水时长，请使用灌肠模式事件');
    }
    if (this.currentMode === 'ble' && !this.bleManagers.enema.isConnected()) {
      throw new Error('灌肠机蓝牙设备尚未连接');
    }
    this.clearEnemaOperations();
    const generation = this.enemaOperationGeneration;
    const maxDuration = Math.floor(this.safetyConfig.maxEnemaDurationSec);
    if (maxDuration <= 0) return '灌肠机自动输出上限为 0，拒绝执行';
    const dur = Math.max(1, Math.min(maxDuration, Math.round(durationSec)));

    // 1. 同步状态与仿真
    this.simulator.setEnemaPeristaltic(2);
    this.simulator.setEnemaWaterPump(1);
    this.currentState.enema.peristalticState = 2;
    this.currentState.enema.waterPumpState = 1;
    this.notifyState();

    // 2. 硬件下发
    if (this.currentMode === 'ble') {
      try {
        const p1 = YCYEnemaProtocol.buildPeristalticPacket(2, dur);
        const p2 = YCYEnemaProtocol.buildWaterPumpPacket(1, dur);
        await this.enqueueHardwareWrite('enema', async () => {
          await this.bleManagers.enema.sendPacket(p1);
          await this.bleManagers.enema.sendPacket(p2);
        }, true);
      } catch (e) {
        await this.latchEmergencyStop();
        throw new Error(`BLE 灌肠排水下发失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    this.scheduleEnemaOperation(() => {
      if (generation === this.enemaOperationGeneration) {
        this.simulator.setEnemaPeristaltic(0);
        this.simulator.setEnemaWaterPump(0);
        this.currentState.enema.peristalticState = 0;
        this.currentState.enema.waterPumpState = 0;
        this.notifyState();
      }
    }, dur * 1000);

    this.triggerHapticFeedback([100, 30, 100]);
    AchievementEngine.getInstance().checkHardwareAction('enema_drain', undefined, dur);
    return `灌肠机启动反转抽水与排空泵（持续 ${dur} 秒）`;
  }

  async playEnemaPattern(patternId: string): Promise<string> {
    if (this.safetyConfig.emergencyLock) return '急停锁已激活，拒绝执行';
    if (this.safetyConfig.maxEnemaDurationSec <= 0) return '灌肠机自动输出上限为 0，拒绝执行';

    const canonicalPatternId = ENEMA_PATTERN_ALIASES[patternId] || patternId;
    const pattern = ENEMA_PATTERNS[canonicalPatternId];
    if (!pattern) return `未找到灌肠流程: ${patternId}`;
    if (this.currentMode === 'ble' && !this.bleManagers.enema.isConnected()) {
      throw new Error('灌肠机蓝牙设备尚未连接');
    }

    this.clearEnemaOperations();
    const generation = this.enemaOperationGeneration;

    this.currentState.enema.activePattern = pattern.name;
    this.currentState.enema.patternRemainingSec = Math.round(pattern.sequence.reduce((sum, step) => sum + step[2], 0));
    this.simulator.setEnemaPattern(pattern.name);
    this.notifyState();

    if (this.currentMode === 'bridge') {
      try {
        await this.triggerBridgeEvent(canonicalPatternId);
      } catch (error) {
        await this.latchEmergencyStop();
        throw error;
      }
      return `已通过 API Bridge 触发灌肠事件【${canonicalPatternId}】`;
    }

    let stepIndex = 0;
    const runStep = async () => {
      if (generation !== this.enemaOperationGeneration || this.safetyConfig.emergencyLock) return;
      const seq = pattern.sequence;
      if (stepIndex >= seq.length) {
        if (pattern.loop) stepIndex = 0;
        else {
          await this.stopEnema();
          return;
        }
      }

      const [dir, pump, configuredDuration] = seq[stepIndex];
      const isPumpRunning = dir !== 0 || pump !== 0;
      const dur = isPumpRunning ? this.getRandomEnemaDuration(configuredDuration) : configuredDuration;
      this.simulator.setEnemaPeristaltic(dir);
      this.simulator.setEnemaWaterPump(pump);
      this.currentState.enema.peristalticState = dir;
      this.currentState.enema.waterPumpState = pump;
      this.notifyState();

      if (this.currentMode === 'ble') {
        try {
          await this.enqueueHardwareWrite('enema', async () => {
            await this.bleManagers.enema.sendPacket(YCYEnemaProtocol.buildPeristalticPacket(dir, Math.round(dur)));
            await this.bleManagers.enema.sendPacket(YCYEnemaProtocol.buildWaterPumpPacket(pump, Math.round(dur)));
          }, true);
        } catch (e) {
          await this.latchEmergencyStop();
          throw new Error(`BLE 灌肠序列下发失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (generation !== this.enemaOperationGeneration || this.safetyConfig.emergencyLock) return;
      stepIndex++;
      this.activeEnemaPatternTimer = setTimeout(() => {
        void runStep().catch((error) => {
          console.warn('灌肠流程执行失败:', error);
          if (generation === this.enemaOperationGeneration) void this.latchEmergencyStop();
        });
      }, dur * 1000);
    };

    await runStep();
    return `正在执行灌肠流程【${pattern.name}】`;
  }

  async stopEnema(): Promise<void> {
    this.clearEnemaOperations();
    this.simulator.stopEnema();

    if (this.currentMode === 'ble') {
      if (this.bleManagers.enema.isConnected()) {
        const packet = YCYEnemaProtocol.buildStopPacket();
        await this.enqueueHardwareWrite('enema', () => this.bleManagers.enema.sendPacket(packet), true);
      }
    } else if (this.currentMode === 'bridge') {
      await this.triggerBridgeEvent('_stop_all');
    }
    this.currentState.enema.peristalticState = 0;
    this.currentState.enema.waterPumpState = 0;
    this.currentState.enema.activePattern = null;
    this.currentState.enema.patternRemainingSec = 0;
    this.notifyState();
  }

  // ================= 全局一键紧急制动 (E-STOP) =================

  async emergencyStop(recordAchievement: boolean = false): Promise<string> {
    const stoppedMode = this.currentMode;
    const staleWrites = this.invalidateQueuedHardwareWrites();
    this.stopCoyoteStreamLoop();
    this.clearEmsOperations();
    this.clearToyOperations();
    this.clearEnemaOperations();
    this.invalidateScheduledOutputStop('ems');
    this.invalidateScheduledOutputStop('toy');

    // 先同步更新安全状态，避免等待 BLE/网络期间 UI 仍显示设备运行。
    this.currentState.ems.strengthA = 0;
    this.currentState.ems.strengthB = 0;
    this.currentState.ems.activeWaveA = null;
    this.currentState.ems.activeWaveB = null;
    this.currentState.ems.isShocking = false;
    this.currentState.toy.motorA = 0;
    this.currentState.toy.motorB = 0;
    this.currentState.toy.motorC = 0;
    this.currentState.toy.activePattern = null;
    this.currentState.toy.patternRemainingSec = 0;
    this.currentState.toy.isTurbo = false;

    this.currentState.enema.peristalticState = 0;
    this.currentState.enema.waterPumpState = 0;
    this.currentState.enema.activePattern = null;
    this.currentState.enema.patternRemainingSec = 0;
    this.notifyState();

    const stopPhysicalOutputs = async () => {
      this.simulator.emergencyStop();
      if (stoppedMode === 'dglab') {
        await this.dglabClient.emergencyStop();
      } else if (stoppedMode === 'ble') {
        const attempts: Promise<void>[] = [];
        if (this.bleManagers.ems.isConnected()) {
          const ver = this.bleManagers.ems.getEmsProtocolVersion();
          if (ver === 'coyote_v2') {
            attempts.push(this.bleManagers.ems.sendPacket(CoyoteV2Protocol.buildStopPacket()));
          } else if (ver === 'coyote_v3') {
            attempts.push(this.bleManagers.ems.sendPacket(CoyoteV3Protocol.buildStopPacket(0)));
          } else if (ver === 'v1') {
            attempts.push(this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildV1StopPacket()));
          } else {
            attempts.push(this.bleManagers.ems.sendPacket(YCYEMSProtocol.buildStopPacket()));
          }
        }
        if (this.bleManagers.toy.isConnected()) {
          attempts.push(this.bleManagers.toy.sendPacket(YCYToyProtocol.buildRatePacket(0, 0, 0)));
        }
        if (this.bleManagers.enema.isConnected()) {
          attempts.push(this.bleManagers.enema.sendPacket(YCYEnemaProtocol.buildStopPacket()));
        }
        const results = await Promise.allSettled(attempts);
        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
        if (failures.length > 0) throw new Error(failures.join('; '));
      } else if (stoppedMode === 'bridge') {
        const ok = await this.imClient.sendCommand('_stop_all');
        if (!ok) throw new Error('桥接急停失败');
      }
    };

    let stopError: unknown = null;
    try {
      await stopPhysicalOutputs();
    } catch (error) {
      stopError = error;
    }

    // An already-running write may finish after the first stop packet. Send a
    // second stop once the stale queue drains so an old command cannot revive output.
    void staleWrites.then(stopPhysicalOutputs).catch((error) => {
      console.warn('急停补偿指令发送失败:', error);
    });

    if (stopError) {
      this.currentState.connectionStatus = 'error';
      this.notifyState();
    }
    this.triggerHapticFeedback([300, 100, 300]);
    if (recordAchievement) AchievementEngine.getInstance().checkHardwareAction('stop');
    if (stopError) {
      return `⚠️ 本地状态已急停，但实体设备停止指令发送失败：${stopError instanceof Error ? stopError.message : String(stopError)}`;
    }
    return '⚠️ 全局安全急停已执行：所有电击已清零，马达与水泵已彻底关闭！';
  }
}
