import React from 'react';
import { Bluetooth, Smartphone, Globe, ExternalLink, X, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface BluetoothHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BluetoothHelpModal: React.FC<BluetoothHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white border border-pink-200 rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-pink-100 pb-3">
          <div className="flex items-center gap-2 text-pink-600">
            <AlertTriangle className="w-5 h-5 text-pink-500" />
            <h3 className="text-sm font-black text-slate-800">手机蓝牙开启全攻略</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-pink-500 p-1 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* 0. 郊狼 Coyote 专属连接必看 */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <span className="text-base">🐺</span>
              <span>郊狼 Coyote 3.0 / 2.0 专属连接指南</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-amber-800 leading-relaxed">
              <p>• <strong>开机黄灯状态：</strong>长按电源键开机，待指示灯由白灯常亮变为<strong>黄灯闪烁/常亮（待机状态）</strong>后方可被搜索。</p>
              <p>• <strong>切勿在手机系统蓝牙配对：</strong>若曾在系统“设置-蓝牙”中配对了设备（如 47L121000 或 D-LAB），请务必点击<strong>“忽略此设备”/“取消配对”</strong>，否则系统会锁定连接导致软件搜不到！</p>
              <p>• <strong>彻底退出官方 App：</strong>郊狼蓝牙为一对一独占协议，请彻底关闭杀掉 DG-LAB 官方 App 后再在本软件点击搜索。</p>
              <p>• <strong>开启系统定位(GPS)：</strong>部分安卓手机扫描低功耗蓝牙依赖手机定位开关，请在手机下拉菜单开启“定位服务”。</p>
            </div>
          </div>

          {/* 1. 苹果 iOS 解决方案 */}
          <div className="bg-pink-50/40 p-3.5 rounded-2xl border border-pink-100 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <span className="text-base">🍎</span>
              <span>苹果 iPhone / iPad 用户（强烈推荐）</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              苹果 Safari 默认关闭了 Web 蓝牙。请在 App Store 免费下载专门的 Web BLE 浏览器：
            </p>
            <div className="bg-white p-2.5 rounded-xl border border-pink-200 space-y-1 text-[11px] shadow-sm">
              <p className="font-bold text-pink-600">推荐免费 App：【Bluefy - Web BLE Browser】</p>
              <p className="text-slate-500">安装后用 Bluefy 打开当前网址，即可 100% 原生直连蓝牙设备与手环！</p>
            </div>
          </div>

          {/* 2. 安卓 / 鸿蒙解决方案 */}
          <div className="bg-pink-50/40 p-3.5 rounded-2xl border border-pink-100 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <span className="text-base">🤖</span>
              <span>安卓 Android / 鸿蒙用户</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              安卓浏览器（Chrome / Edge）要求在 <strong className="text-pink-600">HTTPS 安全连接</strong> 下才允许调用蓝牙：
            </p>
            <div className="space-y-1.5 text-[11px] font-mono text-slate-700">
              <p className="bg-white p-2 rounded-xl border border-pink-100 shadow-sm">
                1. 确保手机地址栏是以 <span className="text-emerald-600 font-bold">https://</span> 开头（例如 <code className="text-pink-600 font-bold">https://192.168.x.x:3000</code>）；
              </p>
              <p className="bg-white p-2 rounded-xl border border-pink-100 shadow-sm">
                2. 首次打开如果提示“证书非私人”，点击【高级】➔【继续前往】即可完美激活蓝牙！
              </p>
            </div>
          </div>

          {/* 3. 免蓝牙方案 */}
          <div className="bg-pink-50/40 p-3.5 rounded-2xl border border-pink-100 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <span className="text-base">🌐</span>
              <span>免蓝牙硬件直连方案</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              在【设备连接】页面切换为 <strong className="text-purple-600">【官方 IM 远程桥接 (Bridge)】</strong>，通过网络直接调控设备，完全无需手机蓝牙！
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-bold shadow-md shadow-pink-500/20 active:scale-95 transition-all"
        >
          我已了解
        </button>
      </div>
    </div>
  );
};
