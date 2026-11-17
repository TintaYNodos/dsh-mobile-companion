# DSH Mobile Companion

![version](https://img.shields.io/badge/version-5.2.10-1f6feb?style=flat-square) ![license](https://img.shields.io/badge/license-BUSL--1.1-8b5cf6?style=flat-square) ![android](https://img.shields.io/badge/Android-8.0%2B-3ddc84?style=flat-square&logo=android&logoColor=white) ![node](https://img.shields.io/badge/Node-22.15%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![ci](https://github.com/TintaYNodos/dsh-mobile-companion/actions/workflows/verify.yml/badge.svg?branch=main) ![tests](https://img.shields.io/badge/tests-416%20checks-2ea043?style=flat-square) ![size](https://img.shields.io/badge/APK-262%20KB-0ea5e9?style=flat-square) ![agent-ready](https://img.shields.io/badge/agent--ready-doctor.ps1%20--json-6f42c1?style=flat-square)

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · **[简体中文](README.zh.md)** · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **语言说明：** 本文档经过翻译，以便全球开发者都能使用 DSH Mobile Companion。非常欢迎社区提出语言修正、措辞改进和拉取请求。标准参考文档为[西班牙语（墨西哥）](README.es.md)。

通过 ZeroTier 或 Tailscale 私有网络在移动端访问 DeepSeek Harness，无需开放端口，也不会破坏提示词缓存。

移动应用并未重新实现界面：它直接渲染 DeepSeek Harness 自带的 Web GUI，并叠加一层触控适配。你在手机上看到的，就是电脑上运行的同一个产品。

由 Ismael Muñoz Reyes 为 Tinta y Nodos 打造的加固版本。

当前版本：**5.2.10**（桥接与 APK，`versionCode` 54）。

---

## 解决的问题

DeepSeek Harness 监听 `127.0.0.1`，并用由 `.credentials.yaml` 派生的 HMAC Cookie 保护其会话。因此，仅仅开放端口或使用通用隧道并不够：没有该 Cookie，界面会返回 401；而随意改写请求来源（Origin）会破坏提示词缓存所需的稳定前缀。

本项目同时解决这三个问题：

- **透明会话签名。** 桥接服务读取本地密钥，生成 HMAC-SHA256 Cookie（版本 1），并在过期前续期。移动端浏览器永远不会看到该密钥。
- **真实产品之上的触控层。** 注入视口元数据、样式表和一小段客户端脚本。界面不会被替换：脚本只添加触控操作（命令坞、代码按键、主题同步、审批中继、通知中继）。它与页面同源同权限运行，因此应视为信任边界的一部分。
- **网络隔离。** 套接字只绑定 VPN 接口，并且只接受来自同一私有网络的客户端。

---

## 架构

```text
手机（ZeroTier / Tailscale 网络）
        |
        v
bridge.mjs  ——独占绑定到 VPN IP——
   |-- /                        代理至 DeepSeek Harness + 触控层
   |-- /offline                 待机页面与离线编辑式阅读器
   |-- /dsh-companion/status    链路发现与健康检查
   |-- /dsh-companion/sync      将会话转储到磁盘
   |-- /dsh-companion/chats     已同步会话索引
   |-- /dsh-companion/pc-events Server-Sent Events：“一轮刚刚结束”
   |-- /dsh-companion/pair-*    设备配对与审批
        |
        v
127.0.0.1:<Harness 端口>  DeepSeek Harness
```

模块结构：

```text
companion/
├── bridge.mjs                 启动、路由、套接字与访问控制策略
├── package.json               版本的唯一来源、`npm start` / `npm test`
├── offline.html               待机屏幕外壳
├── offline.css                基础布局、主题与标签页
├── offline-reader.css         编辑式阅读器与会话详情
├── offline-core.js            共享状态、连接状态、导航
├── offline-reader.js          离线阅读器、列表、详情、阅读模式
├── src/
│   ├── config.mjs             集中配置与上限
│   ├── log.mjs                带时间戳的日志记录器
│   ├── network.mjs            VPN 发现、授权、Harness 端口
│   ├── crypto.mjs             密钥、HMAC v1 Cookie、访问密钥、轮换
│   ├── http.mjs               请求头净化、限制请求体、受信任来源
│   ├── routes.mjs             路由分发（状态、数据、控制）
│   ├── routes-pairing.mjs     配对、审批、面板交接
│   ├── panel.mjs              本地审批面板（仅回环）
│   ├── pairing.mjs            待处理请求与配对码
│   ├── pairing-views.mjs      面板 HTML
│   ├── devices.mjs            设备注册表、TTL、撤销
│   ├── registry.mjs           原子且崩溃安全的 JSON 注册表
│   ├── proxy.mjs              HTTP 代理
│   ├── proxy-ws.mjs           WebSocket 隧道
│   ├── mobile.mjs             注入入口（viewport + 客户端脚本）
│   ├── mobile-client*.mjs     注入的客户端（按职责拆分）
│   ├── mobile-styles.mjs      注入的样式表
│   ├── pc-events.mjs          会话轮次监视器 -> SSE 通知
│   ├── sync.mjs               会话的原子持久化
│   ├── static.mjs             带 ETag 的本地资源
│   ├── system-stats.mjs       CPU、内存与温度遥测
│   ├── qr.mjs / visual-lab.mjs QR 与可视化测试台的辅助模块
│   └── ratelimit.mjs          每客户端令牌桶
│   ├── device-claim, panel-session, routes-data, sync-format, sync-index, sync-retention
├── tools/
├── audit-repo.mjs   仓库审计（文本、语法、版本、密钥）
├── build-apk.ps1   无需 Gradle 构建并签名 APK
├── doctor.ps1                  安装诊断（Node、隧道、桥接、面板）
├── RELEASING.md   发布检查清单
├── .github/workflows/verify.yml   CI：每次推送检查语法与审计
├── SECURITY.md   如何报告漏洞
└── CHANGELOG.md   版本历史
├── android_src/               原生客户端（纯 Java，无 AndroidX）
│   ├── MainActivity.java      生命周期与编排
│   ├── CompanionWebViewClient.java, CompanionChromeClient.java
│   ├── CleartextPolicy.java   阻止发往非私有主机的明文流量
│   ├── PcRegistryStore.java, PcEntry.java   多电脑注册表
│   ├── SettingsScreen.java, HubSheet.java, PcDialogs.java, QrDialogs.java
│   ├── UpdateInstaller.java, KillSwitchUi.java, BiometricGate.java
│   ├── PcEventsService.java   用于电脑通知的前台服务
│   ├── NotificationHelper.java, NotificationChannels.java, NotificationsPc.java
│   ├── KeyStoreVault.java     使用 Android Keystore 加密存储的密钥
│   └── …                      发现、遥测、本地笔记、WOL、小组件
├── test/
│   ├── verify_*.mjs           十七个验证套件（416 项检查）
│   ├── _harness.mjs           共享客户端
│   └── run-all.mjs            `npm test`
└── synced_chats/              已持久化的会话（.md 与 .json）
```

---

## 安装

### 方法 1：借助 AI 助手自动安装（推荐）

如果你在电脑上使用 AI 智能体或编程助手（DeepSeek Harness、Cursor、Claude Code、Copilot 等），请将下面的提示词粘贴到对话中。助手会完成克隆、配置后台启动、验证桥接服务，并给出手机端的连接步骤。

> 完整指南：[AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

```text
你是安装助手。先运行诊断并展示输出：

    powershell -ExecutionPolicy Bypass -File doctor.ps1

若提示“没有隧道”（没有带私有 IP 的 ZeroTier/Tailscale 网卡），请停止：没有私有网络，手机无法访问这台计算机。请说明如何配置 ZeroTier（在 https://my.zerotier.com 建网、PC 与手机安装客户端、设为私有网络并手动授权两个节点）或 Tailscale（两端使用同一账号），然后重新运行 doctor.ps1。
若 Node 低于 22.15，请安装 Node.js 22；若缺少 Harness 凭据，打开 DeepSeek Harness 登录；若桥接未运行，执行 install-autostart.bat。
然后：启动桥接（install-autostart.bat 会注册开机自启并立即启动，不要再运行 run-hidden.vbs），用 panel.bat 配对手机（面板显示与手机相同的 4 位验证码），并在 设置 -> PC 通知 -> 从 PC 测试 中验证通知。
最后再次运行 doctor.ps1 并报告：隧道网卡与 IP、手机地址、桥接版本、面板、配对状态和通知测试结果。没有这些证据不要说已成功。不要把桥接暴露到互联网，不要打印访问密钥，未经要求不要执行 kill switch。
```

### 方法 2：手动安装

#### 电脑

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

需要 Node.js 22.15 或更新版本，且没有 npm 依赖。

1. 设置访问密钥（强烈推荐；见下文）。
2. 使用 `install-autostart.bat` 安装自动启动（Windows 登录时运行的静默任务）。
3. 桥接服务会自动检测 ZeroTier 或 Tailscale 接口并绑定到它。如果检测失败，请将 `DSH_BIND_HOST` 设置为你的私有 IP。

#### 手机

两种等效方式：

- **原生应用：** 从 *Releases* 区域安装 `DSH-Companion.apk`。多电脑选择器、自动重连、前台通知服务、生物识别锁。约 262 KB，零第三方依赖：纯净、可复现的 Java，一个资源图标和主题。
- **无需安装任何东西：** 在浏览器中打开 `http://<VPN_IP>:57420`，选择“添加到主屏幕”。

---

停止或移除开机自启：`stop.bat`、`uninstall-autostart.bat`（Windows）；`uninstall-launchd.sh`、`uninstall-systemd.sh`（macOS/Linux）。

## 环境变量

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DSH_BIND_HOST` | 自动检测 | 强制指定私有绑定 IP |
| `DSH_TARGET_PORT` | 自动检测 | DeepSeek Harness 端口 |
| `DSH_LISTEN_PORT` | `57420` | 桥接服务监听端口 |
| `DSH_PANEL_PORT` | `57421` | 本地审批面板端口 |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | 凭据、密钥与注册表目录 |
| `DSH_BROWSER_SECRET` | — | 直接提供密钥，跳过读取 YAML |
| `DSH_ACCESS_KEY` | 自动生成 | 共享密钥；覆盖基于文件的密钥 |
| `DSH_ACCESS_DISABLE` | — | `1` 禁用访问密钥，**仅允许在绑定回环时使用** |
| `DSH_COMPANION_TOKEN` | 空 | 用于 `/dsh-companion/sync` 的附加令牌 |
| `DSH_ALLOW_CIDR` | 空 | 额外授权的子网，逗号分隔 |
| `DSH_DEVICE_TTL_DAYS` | `30` | 设备会话有效期；过期设备会被拒绝并清除 |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | 使用时效期续期的间隔 |
| `DSH_PENDING_TTL_MIN` | `15` | 配对请求等待审批的分钟数 |
| `DSH_ALLOWED_HOSTS` | 空 | `Host`/`Origin` 额外允许的主机名（Tailscale MagicDNS） |
| `DSH_ALLOW_GENERIC_VPN` | — | `1` 接受通用 tun/tap 接口 |
| `DSH_SYNC_MAX_FILES` | `200` | 保留的同步会话最大数量 |
| `DSH_SYNC_MAX_TOTAL_MB` | `200` | `synced_chats/` 的最大大小（MB） |
| `DSH_LOG_MAX_MB` | `5` | `bridge.log` 轮转前的最大大小（MB，最小 1） |
| `DSH_LOG_KEEP` | `3` | 保留的 `bridge.log.N` 文件数（1–10） |
| `DSH_VPN_IP` | 自动 | 适配器名称无法识别时强制使用该私有 IP |
| `DSH_ALLOW_PROXY_ACCESS` | — | `1` 接受代理请求头（仅当前面有身份层时） |
| `DSH_PANEL_TOKEN` | 自动 | 打开本地面板的一次性票据 |
| `DSH_VISUAL_URL` | `http://127.0.0.1:57420` | 截图探针 `visual-lab` 使用的 URL |

### 从电脑进行一次性批准

1. 在手机上打开应用：它会显示“请在电脑上确认”。
2. 在电脑上运行 `panel.bat`（或打开桥接服务打印的 URL）。面板**严格监听 127.0.0.1**。
3. 设备会带着代码和地址出现。点击**批准**。
4. 手机随即连接，之后不再询问。

设备会话持续 **30 天，并在使用时续期**：每次在 24 小时后打开应用，计数器都会重置。过期设备不再被接受，并会从注册表中移除。

面板入口是一个**一次性票据**，它有有效期，兑换后即失效；作为交换，浏览器会获得一个 `HttpOnly`、`SameSite=Strict` 的会话 Cookie，其标识符只存在于内存中。可分享的 URL 中不会携带令牌，也不会向保存永久凭据的文件写入任何内容。

已授权设备存放在 `%USERPROFILE%\.dsh\companion-devices.json`。面板支持逐个撤销和**全部撤销**。在手机端，**终止开关**会撤销所有设备、关闭 WebSocket 隧道，**并轮换访问密钥**。详见 [DISPOSITIVOS.md](DISPOSITIVOS.md)。

手动访问密钥仍可作为标准浏览器访问的后备方式使用，存放于 `%USERPROFILE%\.dsh\companion-access-key`。原生应用会使用 Android Keystore 对其加密保存。

**现实限制：** HTTP Basic 以 Base64 传输密钥，本身没有传输层加密。只有在 ZeroTier 和 Tailscale 对全部流量进行端到端加密的前提下，这种做法才可以接受。在共享或公开的 ZeroTier 网络中，恶意节点可能尝试二层拦截；请通过手动节点授权让网络严格保持私有。

---

## 路由

- `GET /` — DeepSeek Harness Web GUI；当客户端是手机时会应用触控层。
- `GET /offline` — Harness 启动期间的待机页面，以及离线编辑式阅读器。
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, apkVersion, apkVersionCode, requestAttempts, time }`。匿名调用者只会得到这一最小结构；`apkSha256`、设备列表、待处理列表与遥测需要授权。
- `POST /dsh-companion/sync` — 将会话以 Markdown 和 JSON 保存到 `synced_chats/`。
- `POST /dsh-companion/notes` — 把手机发送的笔记以 Markdown 保存到 `synced_chats/notes/`；带 `id` 时重发会更新同一文件（幂等）。
- `GET /dsh-companion/notes` — 已接收笔记的元数据（不含正文），供面板收件箱使用。
- `GET /dsh-companion/chats` — 已同步会话的索引。
- `GET /dsh-companion/chat/:id` — 会话内容（JSON，或带 `?format=md` 时返回 Markdown）。
- `GET /dsh-companion/pc-events` — Server-Sent Events 流，在电脑上某一轮结束时发出 `response-finished`。
- `POST /dsh-companion/pc-events/test` — 发出合成事件；“从 PC 测试”按钮会使用它。
- `GET /dsh-companion/pair-state` — 等待界面使用的轮询端点。
- `GET /dsh-companion/pair-events` — 等待界面使用的审批流。
- `POST /dsh-companion/open-panel` — 打开本地面板窗口（仅回环）。
- `POST /dsh-companion/retry` — 清除拒绝并重新请求访问。
- `POST /dsh-companion/kill-switch` — 撤销所有设备、关闭隧道并轮换访问密钥。
- `POST /dsh-companion/action` — 工具审批中继。返回 `501`：审批存在于 GUI 的 DOM 中，桥接服务不会伪造它们。
- `GET /companion.webmanifest` — PWA 清单。

---

## 移动客户端功能

- **命令坞与代码按键。** 一行输入框快捷方式，以及一行仅在键盘打开时出现的代码符号。空间足够时显示在输入卡片下方，否则显示在上方。两行都可以在设置中开关。
- **Enter 行为。** 默认情况下 Enter 插入换行；“Enter 发送”会反转该行为。它通过 `execCommand` 针对 Lexical 实现，这是输入框唯一接受的写入方式。
- **PC 通知。** 启用前台服务后，电脑上某一轮结束时，手机就会收到通知，**即使应用已关闭**。桥接服务监视会话日志，并在 `turn/end` 记录上触发：无论模型或工具暂停多久，每一轮都只发一条通知。
- **前台通知渠道、关键渠道和审批渠道。** 关键通知（终止开关结果、访问被撤销）始终显示，绕过“仅在隐藏时”的过滤。
- **生物识别门禁**、支持扫码和手动输入的多电脑选择器、Wake-on-LAN、遥测胶囊、本地笔记（按领域划分的 7 种配置、期限、仅限手机笔记）、系统小组件。

---

## 安全模型

**访问**

- 所有路由均通过 HTTP Basic 校验共享密钥，使用常量时间比较，并按 IP 限流。
- 严格的客户端授权：回环、绑定接口所在子网（**使用真实子网掩码**）或显式声明的 CIDR。
- 设备身份是**会话 Cookie 令牌**，而不是来源 IP：继承地址的设备不会继承会话。
- 针对桥接服务地址校验 `Host`（DNS 重绑定），拒绝 `Origin: null`、空来源以及意外的 `Sec-Fetch-Site`。
- 立即拒绝同时出现 `Content-Length` 和 `Transfer-Encoding` 的请求（请求走私）。
- 访问密钥和客户端令牌在代理到后端之前会被剥离。
- `DSH_ACCESS_DISABLE=1` 在桥接服务未绑定回环时拒绝启动。
- 访问密钥会被终止开关**轮换**；所有已配对的设备都必须重新批准。

**凭据**

- 会话密钥只读取一次，绝不写入日志，也绝不发送给客户端；如果缺失，进程会立即失败。
- 与 Harness 签发的完全一致的 HMAC-SHA256 版本 1 Cookie，有效期 12 小时，并主动续期。
- 后端返回 401 时，桥接服务会重新加载密钥并重试一次，因此 `.credentials.yaml` 轮换无需重启。
- 访问密钥绝不会完整写入日志：只记录最后四个字符。
- 面板没有永久令牌：一次性票据加内存中的会话 Cookie。
- 在 Android 上，存储的密钥使用 **Android Keystore 中的 AES-256-GCM** 加密，旧明文值会自动迁移。

**数据与存储**

- 会话以原子方式写入，标识符经过净化，并严格限制路径以防止目录穿越。
- 内容在序列化前会被转义：可执行 HTML 不会泄漏到导出文件或索引中。
- 请求体大小、消息数量以及单条消息长度都有明确上限。
- 内存限流器带有上限。

**原生应用（Android）**

- `DSH-Companion.apk` — 版本 **5.2.10**、`versionCode` 54、`minSdk` 26、`targetSdk` 35。
- 不使用 AndroidX，也不使用 Kotlin：纯 Java 字节码，约 262 KB。
- **阻止私有网络之外的明文流量**：`CleartextPolicy` 会拒绝任何不是 HTTPS、也未指向已配置堡垒节点或私有/回环地址的请求；网络安全配置也禁止向应用通信的公共服务（GitHub、用于检查更新）使用明文。该策略在 WebView 之上强制执行，因为 Android 的网络安全配置无法表达“仅私有 IP 段”。
- 禁用本地文件访问，阻止混合内容，禁用弹窗和远程调试。
- 麦克风访问仅限堡垒节点的精确来源（协议、主机和端口）。
- 导航限制在堡垒节点来源内；外部链接交给系统选择器处理。
- TLS 错误立即取消导航。
- `ERR_ABORTED` 与传输中断被区分开来，从而消除了无限重载循环。
- `onRenderProcessGone` 会重建视图，而不是让 Android 杀死应用。
- 应用进入后台时暂停重连，并采用带抖动的指数退避。
- 审批通知会从锁屏隐藏（`VISIBILITY_SECRET`），设备锁定时批准操作拒绝执行。

---

## 构建 APK

无需 Gradle 或 Android Studio：使用 SDK 的构建工具组装 APK。需要 JDK 17+、包含 `android-35` 的 Android SDK 与 build-tools，以及一个密钥库（默认使用调试密钥库）。

```powershell
`powershell -ExecutionPolicy Bypass -File build-apk.ps1`
```


## APK 签名
发布版本使用项目的发布密钥库签名，而不是调试密钥库。验证方式：

```bash
apksigner verify --print-certs DSH-Companion.apk
```

发布证书 SHA-256：`4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`

5.1.6 及更早的 APK 使用调试证书签名。**5.1.7 更换了签名**：只有从更早版本升级时才需要先卸载一次；从 5.1.7 起可直接覆盖安装。

## 测试

```bash
npm test
```


十七个套件、**416 项检查**（其中 344 项在 CI 运行），覆盖发现、移动端注入、`?dshc=off`、跨域拒绝、请求走私防御、请求体上限、内容净化、WebSocket 握手完整性、注册表损坏安全、访问控制、本地笔记、设备注册表 TTL、面板流程以及终止开关。

套件与**运行中的桥接服务**通信（不是模拟）：请先启动桥接服务。真正的终止开关运行具有破坏性——它会撤销设备并轮换密钥——因此需要以 `DSH_TEST_DESTRUCTIVE=1` 主动启用。

---

## 本地笔记

笔记**只保存在手机上**，在电脑关机、没有网络时也能使用。不需要账户、API 密钥或连接：可在
应用中创建、编辑和删除，并通过 Android 分享菜单分享。当桥接可访问时，**发送到电脑**会把
笔记保存到电脑上的 `synced_chats/notes/`；如果电脑已关机，笔记仍留在手机上，可稍后再发送。

### 按领域划分的配置

每条笔记选择一个配置：配置决定它的类型和状态，以及两个专有字段（项目、人物/模块）的标签。

| 配置 | 专有字段 | 类型 | 状态 |
| --- | --- | --- | --- |
| **通用** | 项目 · 详情 | 笔记 | — |
| **作家** | 作品 · 人物 | 人物、场景、情节、对话、校对、调研、灵感 | 灵感、草稿、审阅、已完成 |
| **程序员** | 项目 · 模块或文件 | 缺陷、改进、重构、任务、决策、灵感 | 未解决、已修复、已验证 |
| **教师** | 科目 · 班级或学生 | 课程、活动、考试、评分标准、观察、素材 | 草稿、就绪、已应用、已评分、已归档 |
| **记者** | 案件或主题 · 信息源 | 线索、访谈、文章、调研、校对、灵感 | 未解决、进行中、审阅、已发布、已归档 |
| **法务** | 案卷 · 客户 | 文书、证据、期限、庭审、合同、调研、笔记 | 未解决、进行中、审阅、已提交、已完成 |
| **设计** | 客户 · 项目 | 委托、概念、线框图、效果图、素材、反馈、笔记 | 灵感、草稿、审阅、已批准、已交付 |

除类型和状态外，每条笔记还带有**标签**、**优先级**（低、中、高）以及可选的**期限**（用日期
选择器设置）。列表可以**按到期时间排序**（有日期的在前，由近到远），**“有日期”**和
**“优先级”**筛选器可缩小视图。搜索**不区分重音和大小写**：`garcia` 能找到 `García`。

### 隐私

- `notes.json` 以 **AES-256-GCM** 和 **AndroidKeyStore** 密钥**静态加密**存储；旧版本的明文
  文件会在首次读取时迁移为加密存储。
- 笔记界面使用 **FLAG_SECURE**：无法截屏，最近任务中也不会出现笔记缩略图。
- 笔记可以标记为 **“Solo en el teléfono”**（仅限手机）：永不发送，不包含在“全部发送”中，
  分享时会要求确认。
- 笔记从不与互联网通信：没有账户、没有 API 密钥、没有对外部服务的请求。只有你点按
  “发送到 PC”时，笔记才会通过私有网络离开手机。

### 发送到电脑与收件箱

**发送到 PC** 会把笔记写入 `synced_chats/notes/`，其 front matter 包含 `id`、`dueDate` 和
`updatedAt`，以及配置、类型、项目、人物/模块、标签、状态和优先级。发送按 **`id` 幂等**：
重发同一笔记会更新电脑上的同一文件，而不是生成副本。允许**只有标题的笔记**（正文可为空），
发送永不会删除手机上的任何内容。笔记不绑定任何会话：发送只是把文件留在电脑上。

PC 面板有一个 **“Notas recibidas”（已接收笔记）** 收件箱，显示**最近 10 条笔记**，
**只读**（标题、类型、项目和日期）。不含正文的完整元数据列表可通过
`GET /dsh-companion/notes` 获取。

### 无障碍

- 编辑器在键盘打开时**可滚动**，正文输入框不会被遮挡。
- 触控目标 **≥48 dp**，徽章满足 **AA** 对比度。
- 选项芯片会向 **TalkBack** 宣布所选选项，**自动保存**使用实时区域。
- 每张卡片都有**无障碍描述**，标题在截断前显示 **2 行**。

**聊天离线阅读器**仍然需要电脑：同步的聊天由桥接提供。旧的云端聊天模式只能在电脑开机时
工作，因此已在 5.2.8 移除；本地笔记无需依赖电脑即可承担这一用途。

## 坦诚的局限

本设计面向**个人使用**：一位操作者、其可信设备和私有网络。它不是多租户服务。

- 桥接服务授予对底层 Windows 用户账户的 DeepSeek Harness 会话的完全访问权限。不存在按设备的权限隔离。
- 没有用户账户或 RBAC：任何持有已授权设备的人都能控制会话。
- 配对面板会记录近期活动以便运维观察，但它不是不可篡改的审计台账，一键即可清空。
- 公开或共享的 ZeroTier 网络会使私有边界失效。请在 my.zerotier.com 上通过手动节点授权保持网络私有。
- 主机上的本地管理员可以检查凭据和会话日志。这是 Windows 的安全模型，而不是桥接服务的架构缺陷。
- 已同步的会话以明文存储在 `synced_chats/` 中。在 Windows 上，POSIX 的 `0600` 不会转换为严格的 ACL：实际保护依赖用户配置文件的 ACL。在共享硬件上请使用 BitLocker。
- 桥接服务在 VPN 隧道内使用明文 HTTP。只要 ZeroTier 或 Tailscale 端到端加密传输，这就是可靠的；切勿将桥接服务端口暴露到 VPN 之外。
- Android 的网络安全配置无法表达 IP 段，因此“仅私有”的明文规则在应用代码中强制执行（见 `CleartextPolicy`）。已经位于你 VPN 内部的攻击者仍然可以读取该流量：加密依靠的是隧道。
- 完成通知依赖 DeepSeek Harness 将会话日志写入 `turn/end` 记录。如果未来的 Harness 版本更改该格式，通知将不再到达（应用内测试按钮会告诉你哪一半失败）。

---

## 稳定性

**5.2.10 是 5.2 系列的当前稳定版。** `stable/5` 分支保存此版本树；5.1.x 为上一版本线。

## 截图

| 应用 | 配对面板 | 离线阅读器 |
| --- | --- | --- |
| ![应用](docs/images/app.png) | ![配对面板](docs/images/panel.png) | ![离线阅读器](docs/images/offline.png) |

## 社区项目声明

> **声明：** DSH Mobile Companion 是由社区开发的伴随移动客户端，旨在方便开发者通过私有网络（ZeroTier / Tailscale）安全地远程访问 DeepSeek Harness。它不是 DeepSeek 的官方产品，也与 DeepSeek 不存在隶属、赞助或背书关系。文中提及的所有商标和徽标均归其各自所有者所有。

## 商业使用

企业生产环境使用、集成到产品或服务以及再分发需要单独许可（Business Source License 1.1）。企业可通过 **Commercial license** 表单提出咨询：[github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose](https://github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose)。详情见 [LICENSING.md](LICENSING.md)。

## 健康检查、备份和远程支持

- **真实健康状态。** `/healthz` 分别报告桥接和 DeepSeek Harness，Harness 停止时返回 HTTP 503；`degraded` 表示契约的某一部分发生变化。`/dsh-companion/status` 返回已验证的契约。
- **备份。** [backup.bat](backup.bat) 保存设备注册表、访问密钥和面板令牌，并带有哈希清单；[restore.bat](restore.bat) 在写入前校验该清单。存放于 `%USERPROFILE%\.dsh\backups\`。
- **远程支持（可选）。** [RustDesk](https://rustdesk.com) 仅为建议，从不随包分发：使用自建服务器或仅通过 ZeroTier/Tailscale 访问，设置强固定密码和 2FA，用完关闭。
- **流程。** [OPERACION.md](OPERACION.md) 覆盖批准、重启、日志、健康、备份和 APK 更新；支持政策见 [SUPPORT.md](SUPPORT.md)。

## 可由代理安装（DeepSeek Harness）

完整流程打包为 [skills/mobile-companion-setup](skills/mobile-companion-setup/) 技能；`doctor.ps1` 的每个 `FAIL`/`AVISO` 都在 [doctor-fixes.json](doctor-fixes.json) 中有对应命令。

```powershell
New-Item -ItemType Directory -Force .dsh\skills | Out-Null
cmd /c mklink /J .dsh\skills\mobile-companion-setup skills\mobile-companion-setup
```

## 项目文档

[SECURITY.md](SECURITY.md) · [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) · [DISPOSITIVOS.md](DISPOSITIVOS.md) · [RELEASING.md](RELEASING.md) · [OPERACION.md](OPERACION.md) · [SUPPORT.md](SUPPORT.md) · [CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md) · [AUDITORIA-EXTERNA.md](AUDITORIA-EXTERNA.md) · [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) · [AGENT_COMPAT.md](AGENT_COMPAT.md) · [LICENSE](LICENSE)

## iPhone / iPad

没有 iOS 应用。Safari 的“添加到主屏幕”在电脑开机时可运行完整界面（iOS 没有后台通知）。离线阅读器仍然需要电脑。


## 许可证

Business Source License 1.1 (BUSL-1.1)。个人、教育和非商业用途免费。未经明确授权，禁止商业再分发和商业利用。

著作权与版权归属：Ismael Muñoz Reyes · Tinta y Nodos。详见 [LICENSE](LICENSE)。
