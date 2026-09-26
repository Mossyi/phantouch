import { DGLabSocketProtocol } from '../protocol/coyoteProtocol';

export type DGLabSocketStatus = 'disconnected' | 'connecting' | 'waiting_pair' | 'connected' | 'error';

export interface DGLabSocketCallbacks {
  onStatusChange?: (status: DGLabSocketStatus, detail?: string) => void;
  onStrengthUpdate?: (strengthA: number, strengthB: number, limitA: number, limitB: number) => void;
  onFeedback?: (index: number) => void;
}

/**
 * DG-LAB 郊狼官方/开源 WebSocket 中继客户端
 * 允许用户通过扫描二维码在 DG-LAB App 内绑定，从而通过 WebSocket 远程双向控制郊狼 2.0 / 3.0 主机
 */
export class DGLabSocketClient {
  private wsUrl: string = 'ws://127.0.0.1:5678';
  private ws: WebSocket | null = null;
  private clientId: string = '';
  private targetId: string = '';
  private status: DGLabSocketStatus = 'disconnected';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: DGLabSocketCallbacks = {};

  constructor(callbacks?: DGLabSocketCallbacks) {
    if (callbacks) this.callbacks = callbacks;
    this.clientId = this.generateClientId();
  }

  setCallbacks(callbacks: DGLabSocketCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  getStatus(): DGLabSocketStatus {
    return this.status;
  }

  getClientId(): string {
    return this.clientId;
  }

  getTargetId(): string {
    return this.targetId;
  }

  getWsUrl(): string {
    return this.wsUrl;
  }

  /**
   * 生成符合 DG-LAB 规范的标准配对二维码链接
   */
  getPairingQrUrl(): string {
    return DGLabSocketProtocol.buildBindQrUrl(this.wsUrl, this.clientId);
  }

  /**
   * 生成唯一客户端 ID
   */
  private generateClientId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'coyote-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
  }

  private updateStatus(newStatus: DGLabSocketStatus, detail?: string) {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus, detail);
  }

  /**
   * 连接到 DG-LAB WebSocket 服务器
   */
  async connect(serverUrl: string = 'ws://127.0.0.1:5678'): Promise<string> {
    this.disconnect();
    this.wsUrl = serverUrl.trim().replace(/\/+$/, '');
    this.clientId = this.generateClientId();
    this.targetId = '';
    this.updateStatus('connecting', '正在连接 WebSocket 服务器...');

    return new Promise((resolve, reject) => {
      let isSettled = false;
      try {
        const fullWsUrl = `${this.wsUrl}/${this.clientId}`;
        this.ws = new WebSocket(fullWsUrl);

        this.ws.onopen = () => {
          this.updateStatus('waiting_pair', '已连接服务器，等待 DG-LAB App 扫码绑定...');
          this.startHeartbeat();
          if (!isSettled) {
            isSettled = true;
            resolve(this.getPairingQrUrl());
          }
        };

        const currentWs = this.ws;

        this.ws.onmessage = (event) => {
          if (this.ws !== currentWs) return;
          this.handleIncomingMessage(String(event.data || ''));
        };

        this.ws.onerror = (err) => {
          console.warn('DG-LAB WebSocket 连接异常:', err);
          if (this.ws !== currentWs) return;
          if (!isSettled) {
            isSettled = true;
            this.updateStatus('error', 'WebSocket 连接失败，请检查服务器地址与运行状态');
            reject(new Error('WebSocket 连接失败'));
          } else {
            this.updateStatus('error', 'DG-LAB WebSocket 连接异常中断');
          }
        };

        this.ws.onclose = () => {
          if (this.ws !== currentWs) return;
          this.stopHeartbeat();
          // 避免覆盖 onerror 已设置的 error 状态（WebSocket 规范保证 onerror 先于 onclose 触发）
          if (this.status !== 'error') {
            this.updateStatus('disconnected', 'WebSocket 连接已断开');
          }
        };
      } catch (err: any) {
        if (!isSettled) {
          isSettled = true;
          this.updateStatus('error', err?.message || 'WebSocket 初始化失败');
          reject(err);
        }
      }
    });
  }

  private handleIncomingMessage(rawText: string) {
    const parsed = DGLabSocketProtocol.parseMessage(rawText);

    switch (parsed.type) {
      case 'bind':
        if (parsed.message === '200') {
          // 配对成功: 服务端返回的消息中，对端的 clientId 为对方 App ID，而 targetId 为我方 ID
          const peerId = (parsed.clientId && parsed.clientId !== this.clientId) 
            ? parsed.clientId 
            : (parsed.targetId && parsed.targetId !== this.clientId ? parsed.targetId : (parsed.clientId || this.targetId));
          this.targetId = peerId;
          this.updateStatus('connected', `已成功与 DG-LAB App 绑定 (Target: ${this.targetId})`);
        } else if (parsed.message === 'targetId') {
          // 服务端下发当前 clientId 确认
          this.updateStatus('waiting_pair', '请使用 DG-LAB App 扫描二维码完成绑定');
        } else if (parsed.message === '400') {
          this.updateStatus('error', '配对失败：此 ID 已被其他客户端占用');
        }
        break;

      case 'strength':
        if (
          parsed.strengthA !== undefined &&
          parsed.strengthB !== undefined &&
          parsed.limitA !== undefined &&
          parsed.limitB !== undefined
        ) {
          this.callbacks.onStrengthUpdate?.(
            parsed.strengthA,
            parsed.strengthB,
            parsed.limitA,
            parsed.limitB
          );
        }
        break;

      case 'feedback':
        if (parsed.feedbackIndex !== undefined) {
          this.callbacks.onFeedback?.(parsed.feedbackIndex);
        }
        break;

      case 'break':
        this.targetId = '';
        this.updateStatus('waiting_pair', 'DG-LAB App 端已断开，等待重新扫码...');
        break;

      case 'error':
        this.updateStatus('error', `服务端异常提示: ${parsed.message}`);
        break;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const msg = DGLabSocketProtocol.buildHeartbeatMessage(this.clientId, this.targetId);
        this.ws.send(msg);
      }
    }, 50_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 发送通道电击强度 (0-200)
   */
  async setStrength(channel: 1 | 2, strength: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('DG-LAB WebSocket 尚未连接');
    }
    if (!this.targetId) {
      throw new Error('DG-LAB App 尚未扫码绑定，无法下发控制');
    }
    const msg = DGLabSocketProtocol.buildSetStrengthMessage(
      this.clientId,
      this.targetId,
      channel,
      strength
    );
    this.ws.send(msg);
  }

  /**
   * 下发波形脉冲队列到 DG-LAB App (以 16 字符 HEX 帧列表)
   */
  async sendPulse(channel: 'A' | 'B' | 'AB', pulses: string[], timeSec: number = 5): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.targetId) return;
    const boundedTime = Math.max(1, Math.min(60, Math.round(timeSec)));
    if (channel === 'A' || channel === 'AB') {
      const msgA = DGLabSocketProtocol.buildPulseMessage(this.clientId, this.targetId, 'A', pulses, boundedTime);
      this.ws.send(msgA);
    }
    if (channel === 'B' || channel === 'AB') {
      const msgB = DGLabSocketProtocol.buildPulseMessage(this.clientId, this.targetId, 'B', pulses, boundedTime);
      this.ws.send(msgB);
    }
  }

  /**
   * 清空指定通道波形
   */
  async clearWave(channel: 1 | 2): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.targetId) return;
    const msg = DGLabSocketProtocol.buildClearWaveMessage(this.clientId, this.targetId, channel);
    this.ws.send(msg);
  }

  /**
   * 紧急停止：两通道归零并清空波形
   */
  async emergencyStop(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.targetId) return;
    try {
      this.ws.send(DGLabSocketProtocol.buildSetStrengthMessage(this.clientId, this.targetId, 1, 0));
      this.ws.send(DGLabSocketProtocol.buildSetStrengthMessage(this.clientId, this.targetId, 2, 0));
      this.ws.send(DGLabSocketProtocol.buildClearWaveMessage(this.clientId, this.targetId, 1));
      this.ws.send(DGLabSocketProtocol.buildClearWaveMessage(this.clientId, this.targetId, 2));
    } catch (e) {
      console.warn('DG-LAB emergencyStop 发生错误:', e);
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.targetId = '';
    this.updateStatus('disconnected');
  }

  isConnected(): boolean {
    return this.status === 'connected' && !!this.targetId;
  }
}
