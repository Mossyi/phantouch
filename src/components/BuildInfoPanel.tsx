import React, { useState, useEffect } from 'react';
import build from '../../version.json';
import { RELEASE_NOTES } from '../core/ui/releaseNotes';
import { readPreference, writePreference } from '../core/ui/localPreferences';
import {
  isAutoCheckUpdateEnabled,
  setAutoCheckUpdateEnabled,
  getLastCheckTime,
} from '../core/updater/appUpdater';
import { useUpdateStore } from '../core/updater/updateStore';
import { isOtaSupported, getOtaCurrentVersion } from '../core/updater/otaUpdater';
import { RefreshCw, Zap } from 'lucide-react';

/**
 * 「关于与远程更新」面板。
 *
 * 这里只负责展示版本信息与触发检查；自动检查由 GlobalUpdateChecker 在应用根部完成，
 * 更新弹窗由 UpdateModal 全局渲染，因此离开设置页也不会丢失提示。
 */
export function BuildInfoPanel() {
  const [seen, setSeen] = useState(() => readPreference('ycy_release_notes_seen', ''));
  const [autoCheck, setAutoCheck] = useState(() => isAutoCheckUpdateEnabled());
  const [otaCurrent, setOtaCurrent] = useState<string | null>(null);

  const apkChecking = useUpdateStore((state) => state.apkChecking);
  const otaChecking = useUpdateStore((state) => state.otaChecking);
  const notice = useUpdateStore((state) => state.notice);
  const checkApk = useUpdateStore((state) => state.checkApk);
  const checkOta = useUpdateStore((state) => state.checkOta);
  const setNotice = useUpdateStore((state) => state.setNotice);

  const lastCheckedAt = getLastCheckTime();
  const otaSupported = isOtaSupported();

  // 读取当前生效的热更新包版本
  useEffect(() => {
    if (!otaSupported) return;
    let cancelled = false;
    getOtaCurrentVersion()
      .then((version) => { if (!cancelled) setOtaCurrent(version); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [otaSupported]);

  return (
    <section className="ui-card text-xs space-y-3 p-4 rounded-2xl bg-white/90 border border-slate-200/80 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="font-bold text-sm text-slate-800">关于与远程更新</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            幻触 Phantouch · v{build.version} (构建 {build.versionCode})
          </p>
        </div>

        <button
          type="button"
          onClick={() => void checkApk()}
          disabled={apkChecking}
          className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-600 font-bold text-[11px] border border-pink-200 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${apkChecking ? 'animate-spin' : ''}`} />
          <span>{apkChecking ? '正在检查...' : '检查新版本'}</span>
        </button>
      </div>

      <div className="space-y-1 text-slate-500 text-[11px]">
        <p className="ui-muted">{import.meta.env.DEV ? '网页调试模式 · 源码实时热重载' : '生产发布构建'}</p>
        <p className="ui-muted">本地构建时间：{build.builtAt ? new Date(build.builtAt).toLocaleString() : '尚未生成生产构建'}</p>
        {lastCheckedAt > 0 && (
          <p className="text-[10px] text-slate-400">上次检查时间：{new Date(lastCheckedAt).toLocaleString()}</p>
        )}
      </div>

      {/* 自动检查设置（更新源由客户端固定，不提供修改入口） */}
      <div className="pt-1 flex items-center justify-between text-[11px] border-t border-slate-100">
        <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => {
              setAutoCheck(e.target.checked);
              setAutoCheckUpdateEnabled(e.target.checked);
            }}
            className="rounded text-pink-600 accent-pink-500"
          />
          <span>自动检查更新</span>
        </label>
        <span className="text-[9.5px] text-slate-400">启动与回到前台时检查</span>
      </div>

      {/* Web 层热更新（仅原生壳） */}
      {otaSupported && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold text-slate-700 text-[11px]">Web 层热更新</span>
              {otaCurrent && (
                <span className="text-[9.5px] text-slate-400">
                  当前 {otaCurrent === 'builtin' ? '原生内置' : otaCurrent}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void checkOta()}
              disabled={otaChecking}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[10px] border border-amber-200 transition flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${otaChecking ? 'animate-spin' : ''}`} />
              <span>{otaChecking ? '检查中…' : '检查热更新'}</span>
            </button>
          </div>
          <p className="text-[9.5px] text-slate-400 leading-4">
            只更新界面与逻辑，无需重新安装 APK。原生插件、权限或蓝牙配置有变动时仍需整包更新。
          </p>
        </div>
      )}

      {/* 内置本地更新日志详情（兼容原有单元测试） */}
      <details className="pt-1">
        <summary className="cursor-pointer font-bold text-pink-600 hover:text-pink-700">
          查看内置版本日志{seen !== RELEASE_NOTES[0].id ? ' · 有未读内容' : ''}
        </summary>
        <div className="space-y-3 mt-3">
          {RELEASE_NOTES.map(note => (
            <section key={note.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <h4 className="font-bold text-slate-800">{note.title}</h4>
              <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-500 text-[10px]">
                {note.features.map(feature => <li key={feature}>{feature}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <button
          className="ui-button-secondary mt-3 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
          onClick={() => {
            if (writePreference('ycy_release_notes_seen', RELEASE_NOTES[0].id)) {
              setSeen(RELEASE_NOTES[0].id);
              setNotice('已标记为已读');
            } else {
              setNotice('已读状态保存失败');
            }
          }}
        >
          标记为已读
        </button>
      </details>

      {notice && (
        <p role="status" className="p-2 rounded-xl bg-pink-50 text-pink-700 border border-pink-200 text-[11px] font-medium animate-in fade-in">
          {notice}
        </p>
      )}
    </section>
  );
}
