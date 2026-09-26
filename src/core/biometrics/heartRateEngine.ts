import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { HeartRateState, HeartRateZone } from '../../types';
import { DeviceManager } from '../deviceManager';
import { TTSManager } from '../voice/ttsManager';
import { AchievementEngine } from '../achievements/achievementEngine';

export type HeartRateListener = (state: HeartRateState) => void;

const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

/**
 * 役次元 蓝牙手环与心率自适应调教引擎 (支持原生 App + Web 双轨)
 */
export class HeartRateEngine {
  private static instance: HeartRateEngine;

  private isNative: boolean = false;
  private nativeDeviceId: string | null = null;

  private bluetoothDevice: any = null;
  private heartRateCharacteristic: any = null;
  private webHeartRateListener: EventListener | null = null;
  private webDisconnectListener: EventListener | null = null;
  private simulatorTimer: any = null;
  private connectionGeneration = 0;
  private lastAdaptiveCheckTime: number = 0;
  private lastAdaptiveMetricTime: number = 0;

  private state: HeartRateState = {
    isConnected: false,
    deviceName: '',
    isSimulator: false,
    currentBpm: 75,
    minBpm: 75,
    maxBpm: 75,
    avgBpm: 75,
    currentZone: 'calm',
    isAutoAdaptiveLoopActive: false,
    historyBpm: [],
    historyLogs: [],
  };

  private listeners: Set<HeartRateListener> = new Set();

  private constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  static getInstance(): HeartRateEngine {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : (window as any);
    if (!g.__YCY_HEART_RATE_ENGINE__) {
      g.__YCY_HEART_RATE_ENGINE__ = new HeartRateEngine();
    }
    return g.__YCY_HEART_RATE_ENGINE__;
  }

  getState(): HeartRateState {
    return {
      ...this.state,
      historyBpm: this.state.historyBpm.map((sample) => ({ ...sample })),
      historyLogs: [...this.state.historyLogs],
    };
  }

  subscribe(listener: HeartRateListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l(this.getState());
      } catch (error) {
        console.error('心率状态订阅回调执行失败:', error);
      }
    });
  }

  private addLog(log: string) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.state.historyLogs = [`[${timeStr}] ${log}`, ...this.state.historyLogs.slice(0, 49)];
    this.notify();
  }

  private computeZone(bpm: number): HeartRateZone {
    if (bpm < 85) return 'calm';
    if (bpm <= 125) return 'excited';
    if (bpm <= 158) return 'edge_climax';
    return 'overload_danger';
  }

  private resetMeasurements(initialBpm: number = 75) {
    this.state.currentBpm = initialBpm;
    this.state.minBpm = initialBpm;
    this.state.maxBpm = initialBpm;
    this.state.avgBpm = initialBpm;
    this.state.currentZone = this.computeZone(initialBpm);
    this.state.historyBpm = [];
    this.lastAdaptiveCheckTime = 0;
    this.lastAdaptiveMetricTime = this.state.isAutoAdaptiveLoopActive ? Date.now() : 0;
  }

  private processBpm(bpm: number) {
    if (!Number.isFinite(bpm)) return;
    bpm = Math.min(240, Math.max(30, Math.round(bpm)));
    const now = Date.now();
    const zone = this.computeZone(bpm);

    this.state.currentBpm = bpm;
    this.state.currentZone = zone;
    this.state.minBpm = Math.min(this.state.minBpm, bpm);
    this.state.maxBpm = Math.max(this.state.maxBpm, bpm);

    this.state.historyBpm = [...this.state.historyBpm, { time: now, bpm }].slice(-50);

    const sum = this.state.historyBpm.reduce((a, b) => a + b.bpm, 0);
    this.state.avgBpm = Math.round(sum / this.state.historyBpm.length);

    if (this.state.isAutoAdaptiveLoopActive) {
      if (this.lastAdaptiveMetricTime > 0) {
        const elapsedSeconds = Math.min(5, Math.max(0, (now - this.lastAdaptiveMetricTime) / 1000));
        AchievementEngine.getInstance().recordAdaptiveLoopTime(elapsedSeconds);
      }
      this.lastAdaptiveMetricTime = now;
    } else {
      this.lastAdaptiveMetricTime = 0;
    }

    if (this.state.isAutoAdaptiveLoopActive && now - this.lastAdaptiveCheckTime > 7000) {
      this.evaluateAdaptiveControl(bpm, zone);
      this.lastAdaptiveCheckTime = now;
    }

    this.notify();
  }

  private evaluateAdaptiveControl(bpm: number, zone: HeartRateZone) {
    const dev = DeviceManager.getInstance();

    if (this.state.isSimulator && dev.getState().connectionMode !== 'simulator') {
      this.addLog('⚠️ 虚拟心率不能驱动真实硬件，已跳过本次自适应动作。');
      return;
    }

    if (zone === 'calm') {
      this.addLog(`💤 心率较低 (${bpm} bpm)，仅提供文字与语音提示，不自动增加任何硬件强度。`);
      void TTSManager.getInstance().speak(`当前心率是 ${bpm}，保持自然呼吸。需要改变设备强度时，请在控制页主动确认。`);
      AchievementEngine.getInstance().checkHeartRateEvent('calm_warm');
    } else if (zone === 'edge_climax') {
      this.addLog(`🚨 心率飙升至临界 (${bpm} bpm)！触发高潮剥夺心率急刹断电！`);
      void dev.emergencyStop();
      void TTSManager.getInstance().speak(`（监测到心跳飙至 ${bpm}）抓到你了！心率出卖了你的欲望！急刹断电，深呼吸给我咽回去！`);
      AchievementEngine.getInstance().checkHeartRateEvent('edge_brake');
    } else if (zone === 'overload_danger') {
      this.addLog(`🛡️ 心率超载警戒 (${bpm} bpm)！已锁定式停止全部硬件与自适应控制。`);
      this.state.isAutoAdaptiveLoopActive = false;
      void dev.latchEmergencyStop();
      void TTSManager.getInstance().speak(`心跳已达 ${bpm}，进入安全保护模式。深呼吸，放松身体。`);
    }
  }

  async connectRealBleDevice(): Promise<boolean> {
    this.isNative = Capacitor.isNativePlatform();
    await this.disconnect();
    const generation = this.connectionGeneration;

    if (this.isNative) {
      return await this.connectNativeHeartRate(generation);
    } else {
      return await this.connectWebHeartRate(generation);
    }
  }

  private async connectNativeHeartRate(generation: number): Promise<boolean> {
    try {
      this.addLog('🤖 正在初始化 Android 原生心率扫描...');
      await BleClient.initialize();
      if (generation !== this.connectionGeneration) return false;

      const device = await BleClient.requestDevice({
        services: [HEART_RATE_SERVICE_UUID],
        optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb'],
      });
      if (generation !== this.connectionGeneration) return false;

      this.nativeDeviceId = device.deviceId;
      this.addLog(`📱 正在连接蓝牙手环: ${device.name || device.deviceId}...`);

      await BleClient.connect(device.deviceId, () => {
        if (generation !== this.connectionGeneration) return;
        this.addLog('⚠️ 蓝牙手环连接已断开');
        this.disconnect();
      });
      if (generation !== this.connectionGeneration) {
        await BleClient.disconnect(device.deviceId).catch(() => undefined);
        return false;
      }

      await BleClient.startNotifications(
        device.deviceId,
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (value) => {
          if (generation !== this.connectionGeneration) return;
          const flags = value.getUint8(0);
          const isUint16 = (flags & 0x01) !== 0;
          const bpm = isUint16 ? value.getUint16(1, true) : value.getUint8(1);
          if (bpm > 0) {
            this.processBpm(bpm);
          }
        }
      );
      if (generation !== this.connectionGeneration) {
        await BleClient.disconnect(device.deviceId).catch(() => undefined);
        return false;
      }

      this.state.isConnected = true;
      this.state.deviceName = device.name || '标准蓝牙手环';
      this.state.isSimulator = false;
      this.resetMeasurements();
      this.addLog(`✅ 原生蓝牙手环 [${this.state.deviceName}] 连接成功！心率数据实时流转中。`);
      AchievementEngine.getInstance().checkHeartRateEvent('connect');
      this.notify();
      return true;
    } catch (err: any) {
      if (generation !== this.connectionGeneration) return false;
      this.addLog(`❌ 连接手环失败: ${err.message || err}`);
      throw err;
    }
  }

  private async connectWebHeartRate(generation: number): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      throw new Error('当前浏览器未开放 Web Bluetooth 接口。建议安装原生 APK 或使用虚拟心率模拟器。');
    }

    try {
      this.addLog('🔍 正在搜索支持标准心率广播 (0x180D) 的蓝牙手环/手表/心率带...');

      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service'],
      });
      if (generation !== this.connectionGeneration) return false;

      this.bluetoothDevice = device;
      this.addLog(`📱 发现设备: ${device.name || '蓝牙手环'}，正在握手连接...`);

      const server = await device.gatt.connect();
      if (generation !== this.connectionGeneration) {
        device.gatt.disconnect();
        return false;
      }
      const service = await server.getPrimaryService('heart_rate');
      if (generation !== this.connectionGeneration) {
        device.gatt.disconnect();
        return false;
      }
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      if (generation !== this.connectionGeneration) {
        device.gatt.disconnect();
        return false;
      }
      this.heartRateCharacteristic = characteristic;

      await characteristic.startNotifications();
      if (generation !== this.connectionGeneration) {
        device.gatt.disconnect();
        return false;
      }
      this.webHeartRateListener = ((event: Event) => {
        if (generation !== this.connectionGeneration) return;
        const target = event.target as { value?: DataView } | null;
        const value = target?.value;
        if (!value) return;

        const flags = value.getUint8(0);
        const isUint16 = (flags & 0x01) !== 0;
        const bpm = isUint16 ? value.getUint16(1, true) : value.getUint8(1);

        if (bpm > 0) {
          this.processBpm(bpm);
        }
      }) as EventListener;
      characteristic.addEventListener('characteristicvaluechanged', this.webHeartRateListener);

      this.webDisconnectListener = (() => {
        if (generation !== this.connectionGeneration) return;
        this.addLog('⚠️ 蓝牙手环连接已断开');
        this.disconnect();
      }) as EventListener;
      device.addEventListener('gattserverdisconnected', this.webDisconnectListener);

      this.state.isConnected = true;
      this.state.deviceName = device.name || '标准蓝牙手环';
      this.state.isSimulator = false;
      this.resetMeasurements();
      this.addLog(`✅ 蓝牙手环 [${this.state.deviceName}] 连接成功！心率数据实时流转中。`);
      AchievementEngine.getInstance().checkHeartRateEvent('connect');
      this.notify();
      return true;
    } catch (err: any) {
      if (generation !== this.connectionGeneration) return false;
      this.addLog(`❌ 连接手环失败: ${err.message}`);
      throw err;
    }
  }

  startSimulator() {
    this.disconnect();

    this.state.isConnected = true;
    this.state.deviceName = '💓 生物心率模拟器';
    this.state.isSimulator = true;
    this.resetMeasurements(78);

    this.addLog('🎮 虚拟生物心率模拟器已挂载！心率将随刺激动态自然波动。');
    AchievementEngine.getInstance().checkHeartRateEvent('connect');

    let base = 78;
    let trend = 1;

    this.simulatorTimer = setInterval(() => {
      base += trend * (Math.random() * 3 + 1);
      if (base > 145) trend = -1;
      if (base < 72) trend = 1;

      const jitter = Math.floor(Math.random() * 5 - 2);
      const simulatedBpm = Math.max(60, Math.min(180, Math.round(base + jitter)));
      this.processBpm(simulatedBpm);
    }, 1500);

    this.notify();
  }

  setManualSimulatedBpm(bpm: number) {
    if (this.state.isSimulator) {
      this.processBpm(Math.min(240, Math.max(30, Number.isFinite(bpm) ? bpm : 78)));
    }
  }

  toggleAutoAdaptiveLoop(active?: boolean) {
    const next = active !== undefined ? active : !this.state.isAutoAdaptiveLoopActive;
    this.state.isAutoAdaptiveLoopActive = next;
    this.lastAdaptiveMetricTime = next ? Date.now() : 0;
    this.addLog(next ? '🚀 AI 心率自适应调控闭环已开启！' : '⏸️ AI 心率自适应闭环已暂停');
    this.notify();
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++;
    if (this.simulatorTimer) {
      clearInterval(this.simulatorTimer);
      this.simulatorTimer = null;
    }

    const nativeId = this.nativeDeviceId;
    this.nativeDeviceId = null;
    if (this.isNative && nativeId) {
      try {
        await BleClient.disconnect(nativeId);
      } catch {}
    }

    if (this.heartRateCharacteristic && this.webHeartRateListener) {
      this.heartRateCharacteristic.removeEventListener('characteristicvaluechanged', this.webHeartRateListener);
    }
    if (this.bluetoothDevice && this.webDisconnectListener) {
      this.bluetoothDevice.removeEventListener('gattserverdisconnected', this.webDisconnectListener);
    }
    this.webHeartRateListener = null;
    this.webDisconnectListener = null;

    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      try {
        this.bluetoothDevice.gatt.disconnect();
      } catch {}
    }

    this.bluetoothDevice = null;
    this.heartRateCharacteristic = null;
    this.state.isConnected = false;
    this.state.isSimulator = false;
    this.state.isAutoAdaptiveLoopActive = false;
    this.state.deviceName = '';
    this.lastAdaptiveCheckTime = 0;
    this.lastAdaptiveMetricTime = 0;
    this.notify();
  }
}
