import { DeviceSystemState, EMSState, ToyState, EnemaState } from '../../types';

export type StateListener = (state: DeviceSystemState) => void;

/**
 * 幻触虚拟仿真设备驱动器
 * 在没有物理硬件连接时，提供逼真的硬件状态模拟与动态传感器数据流
 */
export class DeviceSimulator {
  private state: DeviceSystemState;
  private listeners: Set<StateListener> = new Set();
  private timer: any = null;

  constructor() {
    this.state = {
      connectionMode: 'simulator',
      connectionStatus: 'connected',
      deviceName: '幻触 虚拟仿真核心',
      deviceId: 'SIM-YCY-8888',
      batteryLevel: 96,
      lastHeartbeat: Date.now(),
      devices: {
        ems: { isConnected: true, name: 'Virtual EMS' },
        toy: { isConnected: true, name: 'Virtual Toy' },
        enema: { isConnected: true, name: 'Virtual Enema' }
      },
      ems: {
        strengthA: 0,
        strengthB: 0,
        limitA: 200,
        limitB: 200,
        partA: '通道A',
        partB: '通道B',
        activeWaveA: null,
        activeWaveB: null,
        isShocking: false,
      },
      toy: {
        type: 'cup',
        motorA: 0,
        motorB: 0,
        motorC: 0,
        partA: '主抽送',
        partB: '吮吸夹紧',
        partC: '旋转绞磨',
        activePattern: null,
        patternRemainingSec: 0,
        isTurbo: false,
      },
      enema: {
        peristalticState: 0,
        waterPumpState: 0,
        pressureA: 12,
        pressureB: 10,
        battery: 98,
        activePattern: null,
        patternRemainingSec: 0,
        isHoldChallenge: false,
      },
    };

    this.startSimulationLoop();
  }

  private startSimulationLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      // 模拟传感器微弱波动
      if (this.state.enema.peristalticState === 1) {
        // 注水中，压力逐渐上升
        this.state.enema.pressureA = Math.min(180, this.state.enema.pressureA + Math.floor(Math.random() * 5 + 2));
        this.state.enema.pressureB = Math.min(150, this.state.enema.pressureB + Math.floor(Math.random() * 4 + 1));
      } else if (this.state.enema.peristalticState === 2 || this.state.enema.waterPumpState === 1) {
        // 抽水排空，压力回落
        this.state.enema.pressureA = Math.max(8, this.state.enema.pressureA - Math.floor(Math.random() * 8 + 3));
        this.state.enema.pressureB = Math.max(6, this.state.enema.pressureB - Math.floor(Math.random() * 6 + 2));
      } else {
        // 静止自然轻微扰动
        this.state.enema.pressureA = Math.max(5, this.state.enema.pressureA + (Math.random() > 0.5 ? 1 : -1));
        this.state.enema.pressureB = Math.max(5, this.state.enema.pressureB + (Math.random() > 0.5 ? 1 : -1));
      }

      this.state.lastHeartbeat = Date.now();
      this.notify();
    }, 500);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    try { listener(this.getState()); } catch (error) { console.warn('模拟器监听器初始化失败:', error); }
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((listener) => {
      try { listener(s); } catch (error) { console.warn('模拟器监听器执行失败:', error); }
    });
  }

  getState(): DeviceSystemState {
    return JSON.parse(JSON.stringify(this.state));
  }

  // ================= EMS 控制 =================
  setEmsStrength(channel: 'A' | 'B' | 'AB', value: number) {
    const v = Math.max(0, Math.min(200, Math.round(value)));
    if (channel === 'A' || channel === 'AB') this.state.ems.strengthA = v;
    if (channel === 'B' || channel === 'AB') this.state.ems.strengthB = v;
    this.state.ems.isShocking = this.state.ems.strengthA > 0 || this.state.ems.strengthB > 0;
    this.notify();
  }

  sendEmsWave(channel: 'A' | 'B' | 'AB', waveName: string) {
    if (channel === 'A' || channel === 'AB') this.state.ems.activeWaveA = waveName;
    if (channel === 'B' || channel === 'AB') this.state.ems.activeWaveB = waveName;
    this.state.ems.isShocking = this.state.ems.strengthA > 0 || this.state.ems.strengthB > 0;
    this.notify();
  }

  clearEms(channel: 'A' | 'B' | 'AB') {
    if (channel === 'A' || channel === 'AB') {
      this.state.ems.strengthA = 0;
      this.state.ems.activeWaveA = null;
    }
    if (channel === 'B' || channel === 'AB') {
      this.state.ems.strengthB = 0;
      this.state.ems.activeWaveB = null;
    }
    this.state.ems.isShocking = this.state.ems.strengthA > 0 || this.state.ems.strengthB > 0;
    this.notify();
  }

  // ================= Toy 马达控制 =================
  setToyMotor(motorA: number, motorB: number, motorC: number) {
    this.state.toy.motorA = Math.max(0, Math.min(20, Math.round(motorA)));
    this.state.toy.motorB = Math.max(0, Math.min(20, Math.round(motorB)));
    this.state.toy.motorC = Math.max(0, Math.min(20, Math.round(motorC)));
    this.notify();
  }

  setToyPattern(patternId: string | null, remainingSec: number = 0) {
    this.state.toy.activePattern = patternId;
    this.state.toy.patternRemainingSec = remainingSec;
    this.notify();
  }

  setTurbo(isTurbo: boolean, motorLimits?: { a?: number; b?: number; c?: number }) {
    this.state.toy.isTurbo = isTurbo;
    if (isTurbo) {
      this.state.toy.motorA = Math.min(motorLimits?.a ?? 20, 20);
      this.state.toy.motorB = Math.min(motorLimits?.b ?? 2, 2);
      this.state.toy.motorC = Math.min(motorLimits?.c ?? 20, 20);
    }
    this.notify();
  }

  stopToy() {
    this.state.toy.motorA = 0;
    this.state.toy.motorB = 0;
    this.state.toy.motorC = 0;
    this.state.toy.activePattern = null;
    this.state.toy.patternRemainingSec = 0;
    this.state.toy.isTurbo = false;
    this.notify();
  }

  // ================= Enema 灌肠机控制 =================
  setEnemaPeristaltic(direction: number) {
    this.state.enema.peristalticState = direction;
    this.notify();
  }

  setEnemaWaterPump(state: number) {
    this.state.enema.waterPumpState = state;
    this.notify();
  }

  setEnemaPattern(patternId: string | null, remainingSec: number = 0) {
    this.state.enema.activePattern = patternId;
    this.state.enema.patternRemainingSec = remainingSec;
    this.notify();
  }

  stopEnema() {
    this.state.enema.peristalticState = 0;
    this.state.enema.waterPumpState = 0;
    this.state.enema.activePattern = null;
    this.state.enema.patternRemainingSec = 0;
    this.state.enema.isHoldChallenge = false;
    this.notify();
  }

  // ================= 全局急停 =================
  emergencyStop() {
    this.clearEms('AB');
    this.stopToy();
    this.stopEnema();
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.listeners.clear();
  }
}
