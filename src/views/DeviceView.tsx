import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DeviceManager } from '../core/deviceManager';
import { BluetoothHelpModal } from '../components/BluetoothHelpModal';
import { Bluetooth, Radio, Cpu, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck, Unlink, HelpCircle, QrCode, Copy, Check } from 'lucide-react';

export const DeviceView: React.FC = () => {
  const { deviceState } = useAppStore();
  const deviceManager = DeviceManager.getInstance();

  const [connectCode, setConnectCode] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:3001');
  const [dglabWsUrl, setDglabWsUrl] = useState('ws://127.0.0.1:5678');
  const [dglabQrUrl, setDglabQrUrl] = useState<string | null>(null);
  const [dglabCopied, setDglabCopied] = useState(false);
  const [isDglabConnecting, setIsDglabConnecting] = useState(false);
  const [dglabStatus, setDglabStatus] = useState<string | null>(null);
  const [emsVersion, setEmsVersion] = useState<'v1' | 'v2' | 'coyote_v2' | 'coyote_v3'>('v2');
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // 「已复制」状态的定时器：卸载时清理，避免卸载后仍有回调触发状态更新。
  const dglabCopiedTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (dglabCopiedTimerRef.current !== null) window.clearTimeout(dglabCopiedTimerRef.current);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const queryCode = url.searchParams.get('connect_code');
    if (queryCode) {
      setConnectCode(queryCode);
      url.searchParams.delete('connect_code');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  // 切换连接模式
  const handleSwitchMode = async (mode: 'ble' | 'bridge' | 'simulator' | 'dglab') => {
    setScanError(null);
    try {
      await deviceManager.switchMode(mode);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleBleDisconnect = async (category: 'ems' | 'toy' | 'enema') => {
    setScanError(null);
    try {
      await deviceManager.disconnectBle(category);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
    }
  };

  // 蓝牙扫描直连
  const handleBleScan = async (category: 'ems' | 'toy' | 'enema') => {
    setIsScanning(true);
    setScanError(null);
    try {
      if (category === 'ems') deviceManager.setEmsProtocolVersion(emsVersion);
      await deviceManager.connectBle(category);
      if (category === 'ems') {
        const detected = deviceManager.getEmsProtocolVersion();
        if (detected) setEmsVersion(detected);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!msg.includes('cancelled') && !msg.includes('User cancelled') && !msg.includes('User canceled')) {
        setScanError(msg);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // 绑定官方连接码
  const handleBindCode = async () => {
    if (!connectCode.trim()) return;
    setIsBinding(true);
    setBridgeStatus('正在连接本地 API Bridge 并登录腾讯 IM...');
    try {
      await deviceManager.connectBridge(connectCode, bridgeUrl);
      setBridgeStatus('✅ API Bridge 登录成功，腾讯 IM 已就绪。桥接控制将触发你在幻触 APP 中配置的事件 ID。');
    } catch (e: any) {
      setBridgeStatus(`❌ 绑定失败: ${e.message}`);
    } finally {
      setIsBinding(false);
    }
  };

  // DG-LAB 郊狼 WebSocket 局域网/中继连接
  const handleConnectDGLab = async () => {
    if (!dglabWsUrl.trim()) return;
    setIsDglabConnecting(true);
    setDglabStatus('正在连接 DG-LAB WebSocket 服务并生成绑定二维码...');
    try {
      const qrUrl = await deviceManager.connectDGLabSocket(dglabWsUrl);
      setDglabQrUrl(qrUrl);
      setDglabStatus('✅ 已生成配对二维码链接，请在手机打开 DG-LAB App 扫码或填入此链接进行绑定。');
    } catch (e: any) {
      setDglabStatus(`❌ 连接失败: ${e.message || e}`);
    } finally {
      setIsDglabConnecting(false);
    }
  };

  const handleCopyQrUrl = async () => {
    if (!dglabQrUrl) return;
    try {
      await navigator.clipboard.writeText(dglabQrUrl);
      setDglabCopied(true);
      if (dglabCopiedTimerRef.current !== null) window.clearTimeout(dglabCopiedTimerRef.current);
      dglabCopiedTimerRef.current = window.setTimeout(() => {
        dglabCopiedTimerRef.current = null;
        setDglabCopied(false);
      }, 2000);
    } catch {}
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-10 space-y-4">
      {/* 顶部当前连接卡片 */}
      <div className="bg-white border border-pink-100 rounded-3xl p-4 shadow-[0_8px_30px_rgba(233,104,146,0.06)] relative overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`p-2.5 rounded-2xl shrink-0 ${
              deviceState.connectionStatus === 'connected'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-rose-50 text-rose-600 border border-rose-200'
            }`}>
              {deviceState.connectionMode === 'ble' ? (
                <Bluetooth className="w-5 h-5" />
              ) : deviceState.connectionMode === 'bridge' || deviceState.connectionMode === 'dglab' ? (
                <Radio className="w-5 h-5" />
              ) : (
                <Cpu className="w-5 h-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-mono shrink-0">当前硬件:</span>
                <span className={`text-[11px] font-bold font-mono truncate ${
                  deviceState.connectionStatus === 'connected' ? 'text-emerald-600' : 'text-slate-400'
                }`}>
                  {deviceState.connectionStatus === 'connected' ? '● 已连接' : '○ 未连接'}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900 mt-0.5 truncate">{deviceState.deviceName}</h3>
            </div>
          </div>

          <div className="text-right shrink-0 bg-pink-50/70 px-3 py-1.5 rounded-2xl border border-pink-100/80">
            <span className="text-[9px] text-slate-400 font-mono block whitespace-nowrap">剩余电量</span>
            <span className="text-xs font-mono font-bold text-pink-600 whitespace-nowrap">{deviceState.batteryLevel}%</span>
          </div>
        </div>

        {deviceState.deviceId && (
          <div className="mt-3 pt-2.5 border-t border-pink-50 text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span className="truncate max-w-[180px]">设备 ID: {deviceState.deviceId}</span>
            <span className="shrink-0">
              心跳: {deviceState.lastHeartbeat > 0 ? new Date(deviceState.lastHeartbeat).toLocaleTimeString() : '暂无'}
            </span>
          </div>
        )}
      </div>

      {/* 连接模式切换选择 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-600 px-1">选择硬件连接通道</h4>

        {/* 方案 1: Web Bluetooth 蓝牙直连 */}
        <div className={`p-4 rounded-3xl border transition-all ${
          deviceState.connectionMode === 'ble'
            ? 'bg-gradient-to-br from-pink-50/70 via-rose-50/40 to-white border-pink-300 shadow-sm'
            : 'bg-white border-pink-100/80 shadow-[0_4px_20px_rgba(233,104,146,0.04)]'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-pink-500" />
              <div>
                <h5 className="text-xs font-bold text-slate-900">蓝牙多设备并发直连</h5>
                <p className="text-[10px] text-slate-400">支持电击、玩具、灌肠同步并发控制</p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(true)}
              className="text-[10px] text-slate-500 hover:text-pink-600 p-1.5 rounded-xl bg-pink-50 border border-pink-100 flex items-center gap-1 transition"
              title="手机无法使用蓝牙？查看解决教程"
            >
              <HelpCircle className="w-3.5 h-3.5 text-pink-500" />
              <span>教程</span>
            </button>
          </div>

          <div className="space-y-2">
            {([
              { id: 'ems', name: '连接电击设备 (EMS)', subtitle: '支持: 郊狼 Coyote 3.0 / 2.0 / 役次元全系列 (自动识别)' },
              { id: 'toy', name: '连接飞机杯 / 跳蛋', subtitle: '支持常见智能跳蛋 / 伸缩杯 BLE 直连' },
              { id: 'enema', name: '连接智能灌肠机', subtitle: '支持智能注水机 / 肠道训练泵' }
            ] as const).map(cat => {
              const isConnectedBle = deviceState.connectionMode === 'ble' && deviceState.devices[cat.id].isConnected;
              return (
                <div key={cat.id} className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-pink-100 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 shrink-0 rounded-full ${isConnectedBle ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                      <span className="text-[11px] font-bold text-slate-800 truncate">
                        {isConnectedBle 
                          ? deviceState.devices[cat.id].name || cat.name
                          : cat.name}
                      </span>
                    </div>
                    {!isConnectedBle && (
                      <p className="text-[9px] text-slate-400 ml-4 truncate mt-0.5">{cat.subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (isConnectedBle) void handleBleDisconnect(cat.id);
                      else void handleBleScan(cat.id);
                    }}
                    disabled={isScanning && !isConnectedBle}
                    className={`shrink-0 ml-2 px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all flex items-center gap-1 active:scale-95 ${
                      isConnectedBle
                        ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                        : 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm shadow-pink-500/20'
                    }`}
                  >
                    {!isConnectedBle && isScanning && <RefreshCw className="w-3 h-3 animate-spin" />}
                    {isConnectedBle ? '断开' : '搜索连接'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 郊狼专属避坑小贴士 */}
          <div className="bg-pink-50/70 border border-pink-100/90 rounded-2xl p-2.5 text-[10px] text-slate-600 space-y-1">
            <p className="font-bold text-pink-700 flex items-center gap-1">
              <span>🐺</span> 郊狼 Coyote 搜索避坑提醒：
            </p>
            <ul className="text-[9px] text-slate-500 space-y-0.5 list-disc list-inside">
              <li>开机后需等待指示灯变为<strong className="text-amber-600 font-bold">黄灯待机</strong>（白灯表示自检中）。</li>
              <li><strong className="text-rose-600 font-bold">切勿在手机系统蓝牙中配对</strong>（已配对请在系统设置点“忽略”）。</li>
              <li>请退出官方 DG-LAB App，蓝牙为一对一独占，避免被后台占用。</li>
              <li>安卓手机请确保开启系统“定位/GPS”开关并授予蓝牙权限。</li>
            </ul>
          </div>

          {scanError && (
            <div className="mt-2.5 text-[11px] text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
              <span>{scanError}</span>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-pink-100 bg-pink-50/50 px-3 py-2">
            <div>
              <p className="text-[10px] font-bold text-slate-800">EMS 硬件协议</p>
              <p className="text-[9px] text-slate-400">支持役次元一代/二代及郊狼 Coyote 2.0/3.0 蓝牙直连</p>
            </div>
            <select
              value={emsVersion}
              onChange={(event) => setEmsVersion(event.target.value as 'v1' | 'v2' | 'coyote_v2' | 'coyote_v3')}
              className="rounded-xl border border-pink-200 bg-white px-2.5 py-1 text-[10px] font-bold text-pink-700 outline-none"
            >
              <option value="v2">役次元 EMS 二代 V2</option>
              <option value="v1">役次元 EMS 一代 V1</option>
              <option value="coyote_v2">郊狼 Coyote 2.0 (BLE)</option>
              <option value="coyote_v3">郊狼 Coyote 3.0 (BLE)</option>
            </select>
          </div>
        </div>

        {/* 方案 2: 官方 API Bridge 连接码绑定 */}
        <div className={`p-4 rounded-3xl border transition-all ${
          deviceState.connectionMode === 'bridge'
            ? 'bg-gradient-to-br from-purple-50/70 via-pink-50/40 to-white border-purple-300 shadow-sm'
            : 'bg-white border-pink-100/80 shadow-[0_4px_20px_rgba(233,104,146,0.04)]'
        }`}>
          <div className="flex items-center gap-2 mb-2.5">
            <Radio className="w-4 h-4 text-purple-500" />
            <div>
              <h5 className="text-xs font-bold text-slate-900">官方 API Bridge（连接码）</h5>
              <p className="text-[10px] text-slate-400">先运行官方 API-bridge 服务，再用连接码登录腾讯 IM</p>
            </div>
          </div>

          <input
            type="url"
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            placeholder="http://localhost:3001"
            aria-label="API Bridge 地址"
            className="mb-2 w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none font-mono"
          />
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={connectCode}
              onChange={(e) => setConnectCode(e.target.value)}
              placeholder="例如: 31132 TonEyPK9wp..."
              aria-label="役次元连接码"
              autoComplete="off"
              className="flex-1 bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none font-mono"
            />
            <button
              onClick={handleBindCode}
              disabled={isBinding || !connectCode.trim()}
              className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm active:scale-95 transition"
            >
              {isBinding ? '连接中' : '绑定'}
            </button>
          </div>

          <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
            Bridge 是事件 ID 通道，不支持直接发送原始强度；模式 ID 必须先在役次元 APP 的开发游戏配置中建立。
          </p>

          {bridgeStatus && (
            <p className="mt-2 text-[11px] text-purple-800 font-mono bg-purple-50 p-2.5 rounded-xl border border-purple-200">
              {bridgeStatus}
            </p>
          )}
        </div>

        {/* 方案 3: DG-LAB 郊狼 App 局域网 / WebSocket 互联 */}
        <div className={`p-4 rounded-3xl border transition-all ${
          deviceState.connectionMode === 'dglab'
            ? 'bg-gradient-to-br from-indigo-50/70 via-pink-50/40 to-white border-indigo-300 shadow-sm'
            : 'bg-white border-pink-100/80 shadow-[0_4px_20px_rgba(233,104,146,0.04)]'
        }`}>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-500" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h5 className="text-xs font-bold text-slate-900">DG-LAB 郊狼 App 扫码 / WebSocket 互联</h5>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    高级/中继
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">支持 DG-LAB 官方 App 扫码或通过中继服务远程控制</p>
              </div>
            </div>

            {deviceState.connectionMode === 'dglab' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                已激活
              </span>
            )}
          </div>

          {/* 模式说明小贴士 */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-2.5 text-[10px] text-amber-900 space-y-1 mb-2.5">
            <p className="font-bold flex items-center gap-1 text-amber-800">
              <span>💡</span> 模式提醒：
            </p>
            <p className="text-[9px] text-amber-700 leading-relaxed">
              <b>日常使用请直接在上方使用【蓝牙直连】</b>（无需官方 App，无需搭建服务器）。<br />
              此模式专供高级玩家：将郊狼连接到官方 DG-LAB App 后，通过局域网/自建 WebSocket 中继服务器跨设备控制。若未事先在电脑或服务器启动 WebSocket 服务端程序，此处会连接失败。
            </p>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">WebSocket 服务地址 (Socket / Relay URL):</label>
              <input
                type="url"
                value={dglabWsUrl}
                onChange={(e) => setDglabWsUrl(e.target.value)}
                placeholder="ws://127.0.0.1:5678 或 wss://..."
                aria-label="DG-LAB WebSocket 地址"
                className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none font-mono"
              />
            </div>

            <button
              onClick={handleConnectDGLab}
              disabled={isDglabConnecting || !dglabWsUrl.trim()}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              {isDglabConnecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isDglabConnecting ? '正在连接中继服务...' : '连接并生成 DG-LAB 扫码绑定链接'}</span>
            </button>

            {dglabQrUrl && (
              <div className="mt-2 bg-indigo-50/60 p-2.5 rounded-2xl border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" /> 配对二维码链接就绪
                  </span>
                  <button
                    onClick={handleCopyQrUrl}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1 active:scale-95 transition"
                  >
                    {dglabCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{dglabCopied ? '已复制' : '复制配对链接'}</span>
                  </button>
                </div>
                <div className="text-[9px] font-mono text-slate-600 bg-white/80 p-2 rounded-xl border border-indigo-100 break-all select-all">
                  {dglabQrUrl}
                </div>
                <p className="text-[9px] text-indigo-700/80 leading-relaxed">
                  📱 打开手机 <b>DG-LAB App</b> → 进入「Socket 模式」/「局域网」→ 点击右上角扫码图标或通过分享链接绑定。绑定成功后，酒馆情境与控制台波形将实时推送到郊狼设备。
                </p>
              </div>
            )}

            {dglabStatus && (
              <p className="text-[11px] text-indigo-800 font-mono bg-indigo-50 p-2.5 rounded-xl border border-indigo-200">
                {dglabStatus}
              </p>
            )}
          </div>
        </div>

        {/* 方案 3: 虚拟仿真器驱动 */}
        <div className={`p-4 rounded-3xl border transition-all ${
          deviceState.connectionMode === 'simulator'
            ? 'bg-gradient-to-br from-amber-50/70 via-pink-50/40 to-white border-amber-300 shadow-sm'
            : 'bg-white border-pink-100/80 shadow-[0_4px_20px_rgba(233,104,146,0.04)]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-500" />
              <div>
                <h5 className="text-xs font-bold text-slate-900">内置虚拟仿真器 (Virtual Box)</h5>
                <p className="text-[10px] text-slate-400">无需实体设备，包含动态示波器与水压传感器模拟</p>
              </div>
            </div>

            <button
              onClick={() => void handleSwitchMode('simulator')}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-sm active:scale-95 transition-all ${
                deviceState.connectionMode === 'simulator'
                  ? 'bg-amber-500 text-white shadow-amber-500/20'
                  : 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
              }`}
            >
              {deviceState.connectionMode === 'simulator' ? '✓ 使用中' : '切换'}
            </button>
          </div>
        </div>
      </div>

      {/* 手机蓝牙开启指南弹窗 */}
      <BluetoothHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};
