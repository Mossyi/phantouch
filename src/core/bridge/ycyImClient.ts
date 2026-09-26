import { fetchTextWithTimeout } from '../httpClient';

/**
 * 役次元官方腾讯云 IM 协议桥接客户端
 * 支持通过连接码（如 '31132 TonEyPK...'）请求官方接口获取登录签名
 * 并与本地/局域网部署的 API-Bridge 或 WebSocket 服务通信
 */

export const parseBridgeBaseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\/+$/, '');
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const privateHost = host === 'localhost'
      || host === '127.0.0.1'
      || host === '[::1]'
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && privateHost))
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

export class YCYIMBridgeClient {
  private bridgeUrl: string;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private onMessageCallback: ((data: any) => void) | null = null;

  constructor(bridgeUrl: string = 'http://localhost:3001') {
    this.bridgeUrl = this.validateBridgeUrl(bridgeUrl);
  }

  setBridgeUrl(url: string) {
    this.bridgeUrl = this.validateBridgeUrl(url);
  }

  getBridgeUrl(): string {
    return this.bridgeUrl;
  }

  private validateBridgeUrl(value: string): string {
    const parsed = parseBridgeBaseUrl(value);
    if (!parsed) throw new Error('Bridge 地址必须使用 HTTPS，或使用不含凭据/查询串的本机、局域网 HTTP 地址');
    return parsed;
  }

  private async fetchJsonWithTimeout(
    url: string,
    init?: RequestInit,
    timeoutMs: number = 30_000,
  ): Promise<{ response: Response; data: any }> {
    const { response, text } = await fetchTextWithTimeout(
      url,
      init,
      { timeoutMs, maxBytes: 1_000_000, timeoutMessage: 'Bridge 请求超时' },
    );
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    return { response, data };
  }

  /**
   * 解析官方连接码
   */
  static parseConnectCode(code: string): { uid: string; rawUserId: string; token: string } | null {
    const parts = code.trim().split(/\s+/);
    if (parts.length !== 2) return null;

    const suppliedId = parts[0];
    const rawUserId = suppliedId.startsWith('game_') ? suppliedId.slice(5) : suppliedId;
    const token = parts[1];
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawUserId) || token.length < 1 || token.length > 4096) return null;
    const uid = `game_${rawUserId}`;

    return { uid, rawUserId, token };
  }

  /**
   * 通过官方接口获取腾讯云 IM 签名
   */
  async fetchOfficialSign(uid: string, token: string): Promise<any> {
    const apiUrl = 'https://suo.jiushu1234.com/api.php/user/game_sign';
    try {
      const { response, data } = await this.fetchJsonWithTimeout(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token }),
      });
      if (response.ok && data?.code === 1 && data.data) {
        return data.data;
      }
      throw new Error(typeof data?.msg === 'string' ? data.msg.slice(0, 500) : '获取役次元签名失败');
    } catch (e: any) {
      throw new Error(`请求签名异常: ${e.message}`);
    }
  }

  /**
   * 向 API-Bridge 发送登录凭证
   */
  async loginBridge(uid: string, token: string): Promise<boolean> {
    try {
      const { response, data } = await this.fetchJsonWithTimeout(`${this.bridgeUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token }),
      });
      return response.ok && data?.success === true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<{ isReady: boolean; config?: Record<string, any> }> {
    const { response, data } = await this.fetchJsonWithTimeout(`${this.bridgeUrl}/api/status`, undefined, 5000);
    if (!response.ok) throw new Error(`Bridge 状态检查失败 (${response.status})`);
    if (!data || typeof data !== 'object') throw new Error('Bridge 状态响应格式无效');
    return { isReady: data?.isReady === true, config: data?.config };
  }

  /**
   * 向 API-Bridge 发送控制指令
   */
  async sendCommand(commandId: string): Promise<boolean> {
    try {
      const { response, data } = await this.fetchJsonWithTimeout(`${this.bridgeUrl}/api/send-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      return response.ok && data?.success === true;
    } catch {
      return false;
    }
  }

  /**
   * 连接 WebSocket 服务（局域网或桥接）
   */
  connectWebSocket(wsUrl: string, onMessage?: (data: any) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws) {
          this.ws.close();
        }

        this.onMessageCallback = onMessage || null;
        const socket = new WebSocket(wsUrl);
        this.ws = socket;
        let settled = false;
        const timeout = setTimeout(() => {
          if (this.ws === socket) socket.close();
          if (!settled) {
            settled = true;
            reject(new Error('Bridge WebSocket 连接超时'));
          }
        }, 8000);

        socket.onopen = () => {
          clearTimeout(timeout);
          if (this.ws === socket) this.isConnected = true;
          if (!settled) {
            settled = true;
            resolve();
          }
        };

        socket.onmessage = (event) => {
          if (this.ws !== socket) return;
          try {
            const data = JSON.parse(event.data);
            if (this.onMessageCallback) {
              this.onMessageCallback(data);
            }
          } catch {}
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            reject(new Error('Bridge WebSocket 连接失败'));
          }
        };

        socket.onclose = () => {
          clearTimeout(timeout);
          if (this.ws === socket) {
            this.isConnected = false;
            this.ws = null;
          }
          if (!settled) {
            settled = true;
            reject(new Error('Bridge WebSocket 在连接完成前关闭'));
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  sendWsMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.onMessageCallback = null;
  }
}
