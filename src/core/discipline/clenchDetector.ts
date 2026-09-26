/**
 * 役次元 智能灌肠机/肛塞压力传感器 - 括约肌收缩与高潮临界自动检测算法
 */
export class ClenchDetector {
  private baselinePressure: number = 0;
  private isCalibrated: boolean = false;
  private calibrationSamples: number[] = [];
  private historyPressures: { val: number; time: number }[] = [];
  private lastTriggerTime: number = 0;
  private sensitivity: number = 1.35; // 灵敏度阈值倍率 (1.2 ~ 1.6)

  constructor(sensitivity: number = 1.35) {
    this.setSensitivity(sensitivity);
  }

  setSensitivity(s: number) {
    this.sensitivity = Number.isFinite(s) ? Math.max(1.15, Math.min(1.8, s)) : 1.35;
  }

  /**
   * 重置并重新开始基线校准
   */
  resetCalibration() {
    this.isCalibrated = false;
    this.calibrationSamples = [];
    this.baselinePressure = 0;
    this.historyPressures = [];
    this.lastTriggerTime = 0;
  }

  /**
   * 输入实时上报的压力数值 (由 Enema Protocol 提供)，返回是否检测到射精临界/括约肌收紧
   */
  feedPressure(pressureVal: number): {
    isClenchDetected: boolean;
    currentPressure: number;
    baseline: number;
    arousalPercent: number;
    ratio: number;
  } {
    const now = Date.now();
    const pressure = Number.isFinite(pressureVal)
      ? Math.max(0, Math.min(1_000_000, pressureVal))
      : 0;

    // 1. 基线采样校准阶段 (前 30 个样本)
    if (!this.isCalibrated) {
      if (pressure > 0) {
        this.calibrationSamples.push(pressure);
      }
      if (this.calibrationSamples.length >= 25) {
        const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
        this.baselinePressure = Math.max(50, Math.floor(sum / this.calibrationSamples.length));
        this.isCalibrated = true;
      }
      return {
        isClenchDetected: false,
        currentPressure: pressure,
        baseline: this.baselinePressure || pressure,
        arousalPercent: 0,
        ratio: 1.0,
      };
    }

    // 2. 动态滑动窗口平滑
    this.historyPressures.push({ val: pressure, time: now });
    // 保留最近 3 秒的样本
    this.historyPressures = this.historyPressures.filter((p) => now - p.time <= 3000);

    const ratio = this.baselinePressure > 0 ? pressure / this.baselinePressure : 1.0;
    const sensitivityDelta = Math.max(0.01, this.sensitivity - 1.0);

    // 欲望蓄力槽百分比 (0% ~ 100%)
    const arousalPercent = Math.min(
      100,
      Math.max(0, Math.floor(((ratio - 1.0) / sensitivityDelta) * 100))
    );

    // 3. 括约肌收紧尖峰判定
    // 判定条件：
    // - 压力比率超过灵敏度阈值 (例如超过基线的 135%)
    // - 距离上次触发至少间隔 5 秒 (防抖冷却)
    let isClenchDetected = false;
    if (ratio >= this.sensitivity && now - this.lastTriggerTime > 5000) {
      // 检查上升斜率 (在最近 800ms 内是否呈现剧烈阶跃)
      const recent = this.historyPressures.filter((p) => now - p.time <= 800);
      if (recent.length >= 2) {
        const minVal = Math.min(...recent.map((r) => r.val));
        const maxVal = Math.max(...recent.map((r) => r.val));
        // 瞬间跳变大于基线的 20%
        if (maxVal - minVal >= this.baselinePressure * 0.2) {
          isClenchDetected = true;
          this.lastTriggerTime = now;
        }
      }
    }

    // 慢速动态更新基线 (缓慢跟踪体位变化)
    if (ratio < 1.15 && ratio > 0.85) {
      this.baselinePressure = Math.max(50, Math.floor(this.baselinePressure * 0.98 + pressure * 0.02));
    }

    return {
      isClenchDetected,
      currentPressure: pressure,
      baseline: this.baselinePressure,
      arousalPercent,
      ratio,
    };
  }
}
