package com.yiciyuan.aicontroller;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeTtsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        // 这里曾经有一段「debug 包每次启动都清空 serverBasePath」的代码，用于防止历史
        // OTA 热更新包在本地测试时覆盖新编译的代码。它已被移除，原因有两点：
        //
        // 1. 它是冗余的：Capacitor 的 Bridge.isNewBinary() 会在 APK 的 versionCode /
        //    versionName 发生变化时清空同一个 serverBasePath 键（Bridge.java 的
        //    isNewBinary 分支），而 scripts/stamp-build.mjs 每次构建都会递增
        //    versionCode —— 也就是说"新装的包一定跑新代码"这件事框架已经保证了，
        //    而且它覆盖的是所有构建，不只是 debug。
        // 2. 它有严重副作用：serverBasePath 正是 OTA 热更新跨重启生效的唯一凭据
        //    （Capgo 写入、Bridge 启动时读取）。每次启动都清空，等于热更新在下次
        //    启动时静默回退到内置资源 —— 而正式分发的正是 debug 构建。
        //
        // 因此不要再把这段逻辑加回来；需要"本地强制跑内置资源"时，请显式停用热更新
        // 或卸载重装，而不是每次启动清空该键。
    }
}
