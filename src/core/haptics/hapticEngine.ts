/**
 * 役次元 全局触觉体感马达震动反馈引擎
 * 提供物理级触觉共鸣（微电脉冲震动、急刹重击、奖励清脆轻震）
 */
export class HapticEngine {
  private static isSupported = typeof window !== 'undefined' && 'vibrate' in navigator;

  /**
   * 轻微触感 (按钮点击、卡片选择)
   */
  static light() {
    if (this.isSupported) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  }

  /**
   * 中度触感 (波形切换、进度达成)
   */
  static medium() {
    if (this.isSupported) {
      try {
        navigator.vibrate(40);
      } catch {}
    }
  }

  /**
   * 强烈重击 (急刹断电、电击加压、惩教触发)
   */
  static heavyShock() {
    if (this.isSupported) {
      try {
        navigator.vibrate([80, 40, 120]);
      } catch {}
    }
  }

  /**
   * 狂喜震颤 (悬赏领取、时间胶囊解封、成就解锁)
   */
  static successTada() {
    if (this.isSupported) {
      try {
        navigator.vibrate([30, 40, 30, 40, 80]);
      } catch {}
    }
  }

  /**
   * 持续脉冲呼吸 (配合 EMS 呼吸波)
   */
  static pulse() {
    if (this.isSupported) {
      try {
        navigator.vibrate([20, 100, 30, 100, 40]);
      } catch {}
    }
  }
}
