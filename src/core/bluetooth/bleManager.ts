import { Capacitor } from '@capacitor/core';
import { BleClient, numbersToDataView, dataViewToNumbers } from '@capacitor-community/bluetooth-le';
import { YCYToyProtocol } from '../protocol/toyProtocol';
import { YCYEnemaProtocol } from '../protocol/enemaProtocol';
import { YCYEMSProtocol } from '../protocol/emsProtocol';
import { COYOTE_V2_UUIDS, COYOTE_V3_UUIDS, CoyoteV3Protocol } from '../protocol/coyoteProtocol';

export interface BLEDeviceInfo {
  id: string;
  name: string;
  category: 'ems' | 'toy' | 'enema' | 'unknown';
}

export type EMSProtocolVersion = 'v1' | 'v2' | 'coyote_v2' | 'coyote_v3';

/**
 * 役次元 BLE 蓝牙统一管理器 (超强容灾双轨架构：Capacitor 原生 App + Web Bluetooth)
 */
export class BLEManager {
  private isNative: boolean = false;
  private nativeDeviceId: string | null = null;

  // Web Bluetooth 变量
  private webDevice: any = null;
  private gattServer: any = null;
  private writeCharacteristic: any = null;
  private notifyCharacteristic: any = null;
  private webNotifyListener: EventListener | null = null;

  private currentCategory: 'ems' | 'toy' | 'enema' | 'unknown' = 'unknown';
  private activeServiceUuid: string = '';
  private activeWriteUuid: string = '';
  private activeNotifyUuid: string = '';
  private emsProtocolVersion: EMSProtocolVersion = 'v2';
  private cachedCharacteristics: Map<string, any> = new Map();

  private onNotifyCallback: ((data: Uint8Array) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private readonly boundWebDisconnectHandler = () => this.handleDisconnect();
  private connectionGeneration = 0;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  static isSupported(): boolean {
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async scanAndConnect(targetCategory?: 'ems' | 'toy' | 'enema'): Promise<BLEDeviceInfo> {
    this.isNative = Capacitor.isNativePlatform();
    await this.disconnect();
    const generation = this.connectionGeneration;

    if (this.isNative) {
      return await this.connectNativeBle(targetCategory, generation);
    } else {
      return await this.connectWebBle(targetCategory, generation);
    }
  }

  private isCurrentConnection(generation: number): boolean {
    return generation === this.connectionGeneration;
  }

  /**
   * 1. Android 原生 App 蓝牙直连通道 (Capacitor BLE - 深度容灾与动态服务发现)
   */
  private async connectNativeBle(targetCategory: 'ems' | 'toy' | 'enema' | undefined, generation: number): Promise<BLEDeviceInfo> {
    try {
      console.log('🤖 正在初始化 Android 原生蓝牙底层插件...');
      await BleClient.initialize({ androidNeverForLocation: true });
      if (!this.isCurrentConnection(generation)) throw new Error('蓝牙连接已取消');

      // 自动检查并提示开启系统蓝牙
      try {
        const isBtEnabled = await BleClient.isEnabled();
        if (!isBtEnabled) {
          console.log('⚠️ 手机蓝牙未开启，正在请求用户授权打开...');
          await BleClient.requestEnable();
        }
      } catch (btErr) {
        console.warn('检查或请求开启蓝牙受限:', btErr);
      }

      // 设置系统设备选择面板本地化中文提示
      try {
        await BleClient.setDisplayStrings({
          scanning: '正在搜索周边蓝牙设备 (请开机)...',
          cancel: '取消',
          availableDevices: '请选择要连接的硬件 (郊狼/役次元/智能玩具)',
          noDeviceFound: '未发现可用蓝牙设备，请确认设备已开机且未被占用',
        });
      } catch {}

      console.log('🔍 正在呼出 Android 系统级蓝牙搜索配对面板...');
      
      let optionalServices = [
        YCYEMSProtocol.BLE_SERVICE_UUID,
        YCYToyProtocol.BLE_SERVICE_UUID,
        YCYEnemaProtocol.BLE_SERVICE_UUID,
        COYOTE_V2_UUIDS.SERVICE,
        COYOTE_V2_UUIDS.BATTERY_SERVICE,
        COYOTE_V3_UUIDS.SERVICE,
        COYOTE_V3_UUIDS.BATTERY_SERVICE,
        '0000180c-0000-1000-8000-00805f9b34fb',
        '0000180a-0000-1000-8000-00805f9b34fb',
        '0000180f-0000-1000-8000-00805f9b34fb',
        '0000ff30-0000-1000-8000-00805f9b34fb',
        '0000ff40-0000-1000-8000-00805f9b34fb',
        '0000ff50-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
      ];

      if (targetCategory === 'ems') {
        optionalServices = [
          YCYEMSProtocol.BLE_SERVICE_UUID,
          COYOTE_V2_UUIDS.SERVICE,
          COYOTE_V2_UUIDS.BATTERY_SERVICE,
          COYOTE_V3_UUIDS.SERVICE,
          COYOTE_V3_UUIDS.BATTERY_SERVICE,
          '0000180c-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb',
          '0000180f-0000-1000-8000-00805f9b34fb',
          '0000fee7-0000-1000-8000-00805f9b34fb',
        ];
      } else if (targetCategory === 'toy') {
        optionalServices = [YCYToyProtocol.BLE_SERVICE_UUID];
      } else if (targetCategory === 'enema') {
        optionalServices = [YCYEnemaProtocol.BLE_SERVICE_UUID, '0000ffe0-0000-1000-8000-00805f9b34fb'];
      }

      // 允许扫描所有包含常见役次元与郊狼特征的周边 BLE 广播设备
      // 开启 allowExtendedAdvertising 与 LOW_LATENCY，确保蓝牙 5.0 (如郊狼 3.0) 扩展广播被成功捕获
      const device = await BleClient.requestDevice({
        optionalServices,
        allowExtendedAdvertising: true,
        scanMode: 2, // SCAN_MODE_LOW_LATENCY: 最大频率扫描，防止漏检广播包
      });
      if (!this.isCurrentConnection(generation)) throw new Error('蓝牙连接已取消');

      if (!device || !device.deviceId) {
        throw new Error('未选择任何蓝牙设备');
      }

      this.nativeDeviceId = device.deviceId;
      console.log(`📱 正在连接设备: ${device.name || device.deviceId}...`);

      // 建立底层 GATT 连接
      await BleClient.connect(device.deviceId, () => {
        if (this.isCurrentConnection(generation)) this.handleDisconnect();
      });
      if (!this.isCurrentConnection(generation)) {
        await BleClient.disconnect(device.deviceId).catch(() => undefined);
        throw new Error('蓝牙连接已取消');
      }

      console.log('🔗 GATT 连接成功，正在探测设备暴露的 GATT Services...');
      let category: 'ems' | 'toy' | 'enema' | 'unknown' = 'unknown';

      // 1. 尝试动态获取全部暴露的 Services 列表
      let services: any[] = [];
      try {
        services = await BleClient.getServices(device.deviceId);
        console.log('📡 设备真实暴露的 Services:', services.map((s) => s.uuid));
      } catch (svcErr) {
        console.warn('获取 Services 列表受限，尝试标准特征回退:', svcErr);
      }

      // 2. 智能匹配 Service 与 Characteristic（优先郊狼 Coyote 3.0 / 2.0 与役次元全系列）
      for (const s of services) {
        const u = (s.uuid || '').toLowerCase();
        if (u.includes('180c')) {
          // 郊狼 Coyote V3 (服务 0x180C)
          category = 'ems';
          this.emsProtocolVersion = 'coyote_v3';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('150a'));
          const n = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('150b'));
          this.activeWriteUuid = w ? w.uuid : COYOTE_V3_UUIDS.WRITE_CHAR;
          this.activeNotifyUuid = n ? n.uuid : COYOTE_V3_UUIDS.NOTIFY_CHAR;
          break;
        } else if (u.includes('955a180b') || (u.includes('180b') && u.includes('955a')) || u.includes('180b')) {
          // 郊狼 Coyote V2
          category = 'ems';
          this.emsProtocolVersion = 'coyote_v2';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('1504'));
          this.activeWriteUuid = w ? w.uuid : COYOTE_V2_UUIDS.POWER_CHAR;
          this.activeNotifyUuid = this.activeWriteUuid;
          break;
        } else if (u.includes('ff30')) {
          category = 'ems';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('ff31'));
          const n = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('ff32'));
          this.activeWriteUuid = w ? w.uuid : YCYEMSProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = n ? n.uuid : YCYEMSProtocol.BLE_NOTIFY_UUID;
          break;
        } else if (u.includes('ff40')) {
          category = 'toy';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('ff41'));
          const n = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('ff42'));
          this.activeWriteUuid = w ? w.uuid : YCYToyProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = n ? n.uuid : YCYToyProtocol.BLE_NOTIFY_UUID;
          break;
        } else if (u.includes('ffb0') || u.includes('ff50')) {
          category = 'enema';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => /ff(b1|51)/.test(c.uuid.toLowerCase()));
          const n = s.characteristics?.find((c: any) => /ff(b2|52)/.test(c.uuid.toLowerCase()));
          this.activeWriteUuid = w ? w.uuid : YCYEnemaProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = n ? n.uuid : YCYEnemaProtocol.BLE_NOTIFY_UUID;
          break;
        } else if (u.includes('ffe0')) {
          category = 'ems';
          this.activeServiceUuid = s.uuid;
          const w = s.characteristics?.find((c: any) => c.uuid.toLowerCase().includes('ffe1'));
          this.activeWriteUuid = w ? w.uuid : '0000ffe1-0000-1000-8000-00805f9b34fb';
          this.activeNotifyUuid = this.activeWriteUuid;
          break;
        }
      }

      // 3. 若 Services 列表为空或未识别出特定 UUID，使用标准 EMS / 郊狼协议兜底
      if (category === 'unknown') {
        const devName = (device.name || '').toLowerCase();
        if (targetCategory === 'toy' || devName.includes('cup') || devName.includes('toy') || devName.includes('vibe') || devName.includes('piston')) {
          category = 'toy';
          this.activeServiceUuid = YCYToyProtocol.BLE_SERVICE_UUID;
          this.activeWriteUuid = YCYToyProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = YCYToyProtocol.BLE_NOTIFY_UUID;
        } else if (targetCategory === 'enema' || devName.includes('enema') || devName.includes('pump') || devName.includes('gcq')) {
          category = 'enema';
          this.activeServiceUuid = YCYEnemaProtocol.BLE_SERVICE_UUID;
          this.activeWriteUuid = YCYEnemaProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = YCYEnemaProtocol.BLE_NOTIFY_UUID;
        } else if (
          devName.startsWith('47l') ||
          devName.includes('coyote 3') ||
          devName.includes('coyote3') ||
          this.emsProtocolVersion === 'coyote_v3'
        ) {
          category = 'ems';
          this.emsProtocolVersion = 'coyote_v3';
          this.activeServiceUuid = COYOTE_V3_UUIDS.SERVICE;
          this.activeWriteUuid = COYOTE_V3_UUIDS.WRITE_CHAR;
          this.activeNotifyUuid = COYOTE_V3_UUIDS.NOTIFY_CHAR;
        } else if (
          devName.includes('d-lab') ||
          devName.includes('dg-lab') ||
          devName.includes('dglab') ||
          devName.includes('estim') ||
          devName.includes('coyote') ||
          this.emsProtocolVersion === 'coyote_v2'
        ) {
          category = 'ems';
          this.emsProtocolVersion = 'coyote_v2';
          this.activeServiceUuid = COYOTE_V2_UUIDS.SERVICE;
          this.activeWriteUuid = COYOTE_V2_UUIDS.POWER_CHAR;
          this.activeNotifyUuid = COYOTE_V2_UUIDS.POWER_CHAR;
        } else {
          category = 'ems';
          this.activeServiceUuid = YCYEMSProtocol.BLE_SERVICE_UUID;
          this.activeWriteUuid = YCYEMSProtocol.BLE_WRITE_UUID;
          this.activeNotifyUuid = YCYEMSProtocol.BLE_NOTIFY_UUID;
        }
      }

      if (targetCategory && category !== targetCategory) {
        throw new Error(`所选设备识别为 ${category}，与请求的 ${targetCategory} 类型不匹配`);
      }

      this.currentCategory = category;

      // 4. 尝试启动 Notify 监听（捕获异常，绝不因 Notify 失败中断连接）
      if (this.activeServiceUuid && this.activeNotifyUuid) {
        try {
          await BleClient.startNotifications(
            device.deviceId,
            this.activeServiceUuid,
            this.activeNotifyUuid,
            (value) => {
              if (!this.isCurrentConnection(generation)) return;
              const data = new Uint8Array(dataViewToNumbers(value));
              this.onNotifyCallback?.(data);
            }
          );
          if (!this.isCurrentConnection(generation)) {
            await BleClient.disconnect(device.deviceId).catch(() => undefined);
            throw new Error('蓝牙连接已取消');
          }
          console.log('✅ BLE Notify 监听启动成功');
        } catch (notifErr) {
          console.warn('⚠️ 启动 BLE Notify 监听受限（仅写入模式工作）:', notifErr);
        }
      }

      // 5. 官方规范：Coyote V3 连接建立后必须立即写入 BF 软上限初始化包
      if (this.emsProtocolVersion === 'coyote_v3') {
        try {
          const bfPacket = CoyoteV3Protocol.buildBFPacket(200, 200, 128, 128, 128, 128);
          await this.sendPacket(bfPacket, COYOTE_V3_UUIDS.SERVICE, COYOTE_V3_UUIDS.WRITE_CHAR);
          console.log('✅ 已成功写入 Coyote V3 初始 BF 软上限包 (200/200)');
        } catch (bfErr) {
          console.warn('⚠️ 写入 Coyote V3 BF 软上限包受限:', bfErr);
        }
      }

      if (!this.isCurrentConnection(generation)) {
        await BleClient.disconnect(device.deviceId).catch(() => undefined);
        throw new Error('蓝牙连接已取消');
      }

      return {
        id: device.deviceId,
        name: device.name || '役次元智能硬件',
        category,
      };
    } catch (e: any) {
      if (this.isCurrentConnection(generation)) await this.disconnect();
      throw new Error(`原生蓝牙连接失败: ${e.message || e}`);
    }
  }

  /**
   * 2. Web 浏览器蓝牙通道 (Web Bluetooth API)
   */
  private async connectWebBle(targetCategory: 'ems' | 'toy' | 'enema' | undefined, generation: number): Promise<BLEDeviceInfo> {
    if (!BLEManager.isSupported()) {
      throw new Error('当前浏览器未开放 Web Bluetooth 接口。建议直接安装我们的原生 APK 应用，或在设置中开启虚拟仿真模式。');
    }

    try {
      const optionalServices: any[] = [
        YCYToyProtocol.BLE_SERVICE_UUID,
        YCYEnemaProtocol.BLE_SERVICE_UUID,
        YCYEMSProtocol.BLE_SERVICE_UUID,
        COYOTE_V2_UUIDS.SERVICE,
        COYOTE_V2_UUIDS.BATTERY_SERVICE,
        COYOTE_V3_UUIDS.SERVICE,
        COYOTE_V3_UUIDS.BATTERY_SERVICE,
        '0000180c-0000-1000-8000-00805f9b34fb',
        '0000180a-0000-1000-8000-00805f9b34fb',
        '0000180f-0000-1000-8000-00805f9b34fb',
        '0000ff30-0000-1000-8000-00805f9b34fb',
        '0000ff40-0000-1000-8000-00805f9b34fb',
        '0000ff50-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        0x180c,
        0x180a,
        0x180f,
        'battery_service',
      ];

      let device: any = null;
      try {
        // 优先全兼容扫描 acceptAllDevices: true（完全避免因广播包未携带指定 UUID 导致漏检郊狼/玩具）
        console.log('🔍 正在启动 Web Bluetooth 全兼容扫描 (acceptAllDevices)...');
        device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices,
        });
      } catch (acceptErr: any) {
        // 若当前浏览器不支持 acceptAllDevices (如特定受限环境)，则回退到全量过滤器
        const isNotAllowed = acceptErr?.name === 'TypeError' || acceptErr?.message?.includes('acceptAllDevices');
        if (!isNotAllowed) throw acceptErr;

        console.log('⚠️ acceptAllDevices 受限，回退至超宽泛前缀过滤器扫描...');
        const filters: any[] = [
          { services: [YCYEMSProtocol.BLE_SERVICE_UUID] },
          { services: [COYOTE_V2_UUIDS.SERVICE] },
          { services: [COYOTE_V3_UUIDS.SERVICE] },
          { services: ['0000180c-0000-1000-8000-00805f9b34fb'] },
          { services: [0x180c] },
          { namePrefix: '47L' },
          { namePrefix: '47l' },
          { namePrefix: 'D-LAB' },
          { namePrefix: 'd-lab' },
          { namePrefix: 'DG-LAB' },
          { namePrefix: 'dg-lab' },
          { namePrefix: 'DGLAB' },
          { namePrefix: 'dglab' },
          { namePrefix: 'Coyote' },
          { namePrefix: 'coyote' },
          { namePrefix: 'ESTIM' },
          { namePrefix: 'estim' },
          { namePrefix: 'EMS' },
          { namePrefix: 'YCY' },
          { namePrefix: 'Toy' },
          { namePrefix: 'GCQ' },
        ];

        device = await (navigator as any).bluetooth.requestDevice({
          filters,
          optionalServices,
        });
      }

      if (!this.isCurrentConnection(generation)) throw new Error('蓝牙连接已取消');

      this.webDevice = device;
      this.webDevice.addEventListener('gattserverdisconnected', this.boundWebDisconnectHandler);

      const server = await device.gatt.connect();
      if (!this.isCurrentConnection(generation)) {
        device.gatt.disconnect();
        throw new Error('蓝牙连接已取消');
      }
      this.gattServer = server;

      let category: 'ems' | 'toy' | 'enema' | 'unknown' = 'unknown';

      // 1. 优先尝试探测 Coyote V3 (服务 0x180C)
      try {
        let coyoteV3Service = null;
        try {
          coyoteV3Service = await server.getPrimaryService(COYOTE_V3_UUIDS.SERVICE);
        } catch {
          coyoteV3Service = await server.getPrimaryService(0x180c).catch(() => null);
        }
        if (coyoteV3Service) {
          this.writeCharacteristic = await coyoteV3Service.getCharacteristic(COYOTE_V3_UUIDS.WRITE_CHAR).catch(() => null)
            || await coyoteV3Service.getCharacteristic(0x150a).catch(() => null);
          try {
            this.notifyCharacteristic = await coyoteV3Service.getCharacteristic(COYOTE_V3_UUIDS.NOTIFY_CHAR).catch(() => null)
              || await coyoteV3Service.getCharacteristic(0x150b).catch(() => null);
            await this.startWebNotification(generation);
          } catch {}
          category = 'ems';
          this.emsProtocolVersion = 'coyote_v3';
          this.activeServiceUuid = COYOTE_V3_UUIDS.SERVICE;
          this.activeWriteUuid = COYOTE_V3_UUIDS.WRITE_CHAR;
          this.activeNotifyUuid = COYOTE_V3_UUIDS.NOTIFY_CHAR;
        }
      } catch {}

      // 2. 尝试探测 Coyote V2 (服务 955a180b)
      if (category === 'unknown') {
        try {
          const coyoteV2Service = await server.getPrimaryService(COYOTE_V2_UUIDS.SERVICE).catch(() => null);
          if (coyoteV2Service) {
            this.writeCharacteristic = await coyoteV2Service.getCharacteristic(COYOTE_V2_UUIDS.POWER_CHAR);
            try {
              this.notifyCharacteristic = await coyoteV2Service.getCharacteristic(COYOTE_V2_UUIDS.POWER_CHAR);
              await this.startWebNotification(generation);
            } catch {}
            // 预缓存 A/B 通道波形特征以实现 10Hz 零延迟极速写入
            try {
              const charA = await coyoteV2Service.getCharacteristic(COYOTE_V2_UUIDS.WAVE_A_CHAR);
              if (charA) this.cachedCharacteristics.set(COYOTE_V2_UUIDS.WAVE_A_CHAR.toLowerCase(), charA);
            } catch {}
            try {
              const charB = await coyoteV2Service.getCharacteristic(COYOTE_V2_UUIDS.WAVE_B_CHAR);
              if (charB) this.cachedCharacteristics.set(COYOTE_V2_UUIDS.WAVE_B_CHAR.toLowerCase(), charB);
            } catch {}
            category = 'ems';
            this.emsProtocolVersion = 'coyote_v2';
            this.activeServiceUuid = COYOTE_V2_UUIDS.SERVICE;
            this.activeWriteUuid = COYOTE_V2_UUIDS.POWER_CHAR;
            this.activeNotifyUuid = COYOTE_V2_UUIDS.POWER_CHAR;
          }
        } catch {}
      }

      // 3. 尝试探测标准役次元 EMS 协议 (服务 ff30)
      if (category === 'unknown') {
        try {
          const emsService = await server.getPrimaryService(YCYEMSProtocol.BLE_SERVICE_UUID).catch(() => null);
          if (emsService) {
            this.writeCharacteristic = await emsService.getCharacteristic(YCYEMSProtocol.BLE_WRITE_UUID);
            try {
              this.notifyCharacteristic = await emsService.getCharacteristic(YCYEMSProtocol.BLE_NOTIFY_UUID);
              await this.startWebNotification(generation);
            } catch {}
            category = 'ems';
            this.activeServiceUuid = YCYEMSProtocol.BLE_SERVICE_UUID;
            this.activeWriteUuid = YCYEMSProtocol.BLE_WRITE_UUID;
            this.activeNotifyUuid = YCYEMSProtocol.BLE_NOTIFY_UUID;
          }
        } catch {}
      }

      if (category === 'unknown') {
        try {
          const toyService = await server.getPrimaryService(YCYToyProtocol.BLE_SERVICE_UUID);
          if (toyService) {
            this.writeCharacteristic = await toyService.getCharacteristic(YCYToyProtocol.BLE_WRITE_UUID);
            try {
              this.notifyCharacteristic = await toyService.getCharacteristic(YCYToyProtocol.BLE_NOTIFY_UUID);
              await this.startWebNotification(generation);
            } catch {}
            category = 'toy';
          }
        } catch {}
      }

      if (category === 'unknown') {
        try {
          const enemaService = await server.getPrimaryService(YCYEnemaProtocol.BLE_SERVICE_UUID);
          if (enemaService) {
            this.writeCharacteristic = await enemaService.getCharacteristic(YCYEnemaProtocol.BLE_WRITE_UUID);
            try {
              this.notifyCharacteristic = await enemaService.getCharacteristic(YCYEnemaProtocol.BLE_NOTIFY_UUID);
              await this.startWebNotification(generation);
            } catch {}
            category = 'enema';
          }
        } catch {}
      }

      if (category === 'unknown') {
        throw new Error('未找到受支持的 BLE 写入特征，无法安全识别设备类型');
      }
      if (!this.writeCharacteristic) {
        throw new Error('已发现设备服务，但 BLE 写入特征不可用');
      }
      if (targetCategory && category !== targetCategory) {
        throw new Error(`所选设备识别为 ${category}，与请求的 ${targetCategory} 类型不匹配`);
      }
      if (!this.isCurrentConnection(generation)) {
        device.gatt.disconnect();
        throw new Error('蓝牙连接已取消');
      }

      this.currentCategory = category;

      // 官方规范：Coyote V3 连接建立后必须立即写入 BF 软上限初始化包
      if (this.emsProtocolVersion === 'coyote_v3') {
        try {
          const bfPacket = CoyoteV3Protocol.buildBFPacket(200, 200, 128, 128, 128, 128);
          await this.sendPacket(bfPacket, COYOTE_V3_UUIDS.SERVICE, COYOTE_V3_UUIDS.WRITE_CHAR);
          console.log('✅ Web BLE 已成功写入 Coyote V3 初始 BF 软上限包 (200/200)');
        } catch (bfErr) {
          console.warn('⚠️ Web BLE 写入 Coyote V3 BF 软上限包受限:', bfErr);
        }
      }

      return {
        id: device.id,
        name: device.name || (this.emsProtocolVersion === 'coyote_v3' ? '郊狼 Coyote 3.0' : this.emsProtocolVersion === 'coyote_v2' ? '郊狼 Coyote 2.0' : '役次元智能设备'),
        category,
      };
    } catch (e: any) {
      if (this.isCurrentConnection(generation)) await this.disconnect();
      throw e;
    }
  }

  private async startWebNotification(generation: number) {
    if (!this.notifyCharacteristic) return;
    try {
      await this.notifyCharacteristic.startNotifications();
      if (!this.isCurrentConnection(generation)) return;
      this.webNotifyListener = ((event: Event) => {
        if (!this.isCurrentConnection(generation)) return;
        const target = event.target as { value?: DataView } | null;
        const value = target?.value;
        if (!value) return;
        const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        this.onNotifyCallback?.(data);
      }) as EventListener;
      this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.webNotifyListener);
    } catch (e) {
      console.warn('启动 Notify 监听失败:', e);
    }
  }

  async sendPacket(bytes: Uint8Array, customServiceUuid?: string, customCharUuid?: string): Promise<void> {
    const serviceUuid = customServiceUuid || this.activeServiceUuid;
    const writeUuid = customCharUuid || this.activeWriteUuid;

    if (this.isNative && this.nativeDeviceId) {
      const targetService = serviceUuid || YCYEMSProtocol.BLE_SERVICE_UUID;
      const targetWrite = writeUuid || YCYEMSProtocol.BLE_WRITE_UUID;
      const dataView = numbersToDataView(Array.from(bytes));
      try {
        await BleClient.writeWithoutResponse(this.nativeDeviceId, targetService, targetWrite, dataView);
      } catch {
        await BleClient.write(this.nativeDeviceId, targetService, targetWrite, dataView);
      }
      return;
    }

    if (!this.writeCharacteristic && !customCharUuid) {
      throw new Error('BLE 写入特征不可用，设备可能尚未连接或已断开');
    }

    let charToWrite = customCharUuid ? null : this.writeCharacteristic;
    if (customCharUuid) {
      const lowerKey = customCharUuid.toLowerCase();
      if (this.cachedCharacteristics.has(lowerKey)) {
        charToWrite = this.cachedCharacteristics.get(lowerKey) || null;
      } else if (this.gattServer) {
        try {
          const svc = await this.gattServer.getPrimaryService(serviceUuid || this.activeServiceUuid);
          charToWrite = await svc.getCharacteristic(customCharUuid);
          if (charToWrite) this.cachedCharacteristics.set(lowerKey, charToWrite);
        } catch (err) {
          console.error(`获取自定义特征 (${customCharUuid}) 失败:`, err);
          throw new Error(`获取自定义 BLE 特征失败: ${customCharUuid}`);
        }
      }
    }

    if (!charToWrite) {
      throw new Error('BLE 写入特征不可用，设备可能尚未连接或已断开');
    }

    if (typeof charToWrite.writeValueWithoutResponse === 'function') {
      await charToWrite.writeValueWithoutResponse(bytes);
    } else {
      await charToWrite.writeValue(bytes);
    }
  }

  onNotify(cb: (data: Uint8Array) => void) {
    this.onNotifyCallback = cb;
  }

  onDisconnect(cb: () => void) {
    this.onDisconnectCallback = cb;
  }

  setEmsProtocolVersion(version: EMSProtocolVersion) {
    this.emsProtocolVersion = version;
  }

  getEmsProtocolVersion(): EMSProtocolVersion {
    return this.emsProtocolVersion;
  }

  private handleDisconnect() {
    console.log('BLE 设备连接已断开');
    this.connectionGeneration++;
    if (this.webDevice) {
      try {
        this.webDevice.removeEventListener('gattserverdisconnected', this.boundWebDisconnectHandler);
      } catch {}
    }
    if (this.notifyCharacteristic && this.webNotifyListener) {
      try {
        this.notifyCharacteristic.removeEventListener('characteristicvaluechanged', this.webNotifyListener);
      } catch {}
    }
    this.cachedCharacteristics.clear();
    this.webNotifyListener = null;
    this.currentCategory = 'unknown';
    this.nativeDeviceId = null;
    this.webDevice = null;
    this.gattServer = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.activeServiceUuid = '';
    this.activeWriteUuid = '';
    this.activeNotifyUuid = '';
    this.onDisconnectCallback?.();
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++;
    if (this.isNative && this.nativeDeviceId) {
      try {
        await BleClient.disconnect(this.nativeDeviceId);
      } catch {}
      this.nativeDeviceId = null;
    }

    if (this.webDevice) {
      try {
        this.webDevice.removeEventListener('gattserverdisconnected', this.boundWebDisconnectHandler);
      } catch {}
    }
    if (this.notifyCharacteristic && this.webNotifyListener) {
      try {
        this.notifyCharacteristic.removeEventListener('characteristicvaluechanged', this.webNotifyListener);
      } catch {}
    }
    if (this.webDevice && this.webDevice.gatt && this.webDevice.gatt.connected) {
      try {
        this.webDevice.gatt.disconnect();
      } catch {}
    }

    this.cachedCharacteristics.clear();
    this.webDevice = null;
    this.gattServer = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.webNotifyListener = null;
    this.currentCategory = 'unknown';
    this.activeServiceUuid = '';
    this.activeWriteUuid = '';
    this.activeNotifyUuid = '';
  }

  isConnected(): boolean {
    if (this.isNative) {
      return !!this.nativeDeviceId;
    }
    return !!(this.gattServer && this.gattServer.connected);
  }

  getCategory(): 'ems' | 'toy' | 'enema' | 'unknown' {
    return this.currentCategory;
  }
}
