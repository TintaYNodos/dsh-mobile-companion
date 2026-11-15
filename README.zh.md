# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · **[简体中文](README.zh.md)** · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **语言说明：** 本文档经过翻译，以便全球开发者都能使用 DSH Mobile Companion。非常欢迎社区提出语言修正、措辞改进和拉取请求。标准参考文档为[西班牙语（墨西哥）](README.es.md)。

通过 ZeroTier 或 Tailscale 私有网络在移动端访问 DeepSeek Harness，无需开放端口，也不会破坏提示词缓存。

移动应用并未重新实现界面：它直接渲染 DeepSeek Harness 自带的 Web GUI，并叠加一层触控适配。你在手机上看到的，就是电脑上运行的同一个产品。

由 Ismael Muñoz Reyes 为 Tinta y Nodos 打造的加固版本。

当前版本：**5.0.0**（`versionCode` 38）。

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
├── offline-satellite.css      卫星区块
├── offline-core.js            共享状态、连接状态、导航
├── offline-reader.js          离线阅读器、列表、详情、阅读模式
├── offline-satellite.js       卫星交接（发送、分块、完成）
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
│   └── …                      发现、遥测、卫星、WOL、小组件
├── test/
│   ├── verify_*.mjs           十个验证套件（136 项检查）
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
请充当这台电脑上的技术安装助手。
你的目标是安装、启用、验证并完整配置“DSH Mobile Companion”（一个安全的伴随桥接服务，可通过 ZeroTier 或 Tailscale 私有网络在移动端访问 DeepSeek Harness），并向我提供清晰、不使用专业术语的说明，以便我连接手机。

请自主地按顺序执行以下步骤：
1. 检查“%USERPROFILE%\.dsh”，并定位 Node.js（在 PATH 中，或位于“%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe”）。
2. 如果当前不在该目录中，请克隆：git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
3. 使用“install-autostart.bat”配置静默自启动，并使用“run-hidden.vbs”启动服务。
4. 请求 http://127.0.0.1:57420/dsh-companion/status，确认桥接服务返回 200，并报告 DSH 状态。
5. 提供简洁、不使用专业术语的摘要，包含：我手机使用的 URL（http://<VPN_IP>:57420）、GitHub Releases 中的 APK 下载链接，以及如何从本地面板授权我的手机。
```

### 方法 2：手动安装

#### 电脑

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

需要 Node.js 20 或更新版本，且没有 npm 依赖。

1. 设置访问密钥（强烈推荐；见下文）。
2. 使用 `install-autostart.bat` 安装自动启动（Windows 登录时运行的静默任务）。
3. 桥接服务会自动检测 ZeroTier 或 Tailscale 接口并绑定到它。如果检测失败，请将 `DSH_BIND_HOST` 设置为你的私有 IP。

#### 手机

两种等效方式：

- **原生应用：** 从 *Releases* 区域安装 `DSH-Companion.apk`。多电脑选择器、自动重连、前台通知服务、生物识别锁。约 210 KB，零第三方依赖：纯净、可复现的 Java，一个资源图标和主题。
- **无需安装任何东西：** 在浏览器中打开 `http://<VPN_IP>:57420`，选择“添加到主屏幕”。

`/m` 会永久重定向到 `/`：旧的卫星模式已退役，改用真实界面。

---

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
| `DSH_ENABLE_TERMINAL` | — | `1` 启用远程终端（默认关闭，仅回环） |

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
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`。匿名调用者只会得到这一最小结构；设备列表与遥测需要授权。
- `POST /dsh-companion/sync` — 将会话以 Markdown 和 JSON 保存到 `synced_chats/`。
- `GET /dsh-companion/chats` — 已同步会话的索引。
- `GET /dsh-companion/chat/:id` — 会话内容（JSON，或带 `?format=md` 时返回 Markdown）。
- `GET /dsh-companion/pc-events` — Server-Sent Events 流，在电脑上某一轮结束时发出 `response-finished`。
- `POST /dsh-companion/pc-events/test` — 发出合成事件；“从 PC 测试”按钮会使用它。
- `GET /dsh-companion/pair-state` — 等待界面使用的轮询端点。
- `GET /dsh-companion/pair-events` — 等待界面使用的审批流。
- `POST /dsh-companion/open-panel` — 打开本地面板窗口（仅回环）。
- `POST /dsh-companion/retry` — 清除拒绝并重新请求访问。
- `POST /dsh-companion/kill-switch` — 撤销所有设备、关闭隧道并轮换访问密钥。
- `POST /dsh-companion/terminal` — 远程 shell，**除非 `DSH_ENABLE_TERMINAL=1` 否则禁用**，且仅回环。
- `POST /dsh-companion/action` — 工具审批中继。返回 `501`：审批存在于 GUI 的 DOM 中，桥接服务不会伪造它们。
- `GET /companion.webmanifest` — PWA 清单。

---

## 移动客户端功能

- **命令坞与代码按键。** 一行输入框快捷方式，以及一行仅在键盘打开时出现的代码符号。空间足够时显示在输入卡片下方，否则显示在上方。两行都可以在设置中开关。
- **Enter 行为。** 默认情况下 Enter 插入换行；“Enter 发送”会反转该行为。它通过 `execCommand` 针对 Lexical 实现，这是输入框唯一接受的写入方式。
- **PC 通知。** 启用前台服务后，电脑上某一轮结束时，手机就会收到通知，**即使应用已关闭**。桥接服务监视会话日志，并在 `turn/end` 记录上触发：无论模型或工具暂停多久，每一轮都只发一条通知。
- **前台通知渠道、关键渠道和审批渠道。** 关键通知（终止开关结果、访问被撤销）始终显示，绕过“仅在隐藏时”的过滤。
- **生物识别门禁**、支持扫码和手动输入的多电脑选择器、Wake-on-LAN、遥测胶囊、卫星交接、系统小组件。

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

- `DSH-Companion.apk` — 版本 **5.0.0**、`versionCode` 38、`minSdk` 26、`targetSdk` 35。
- 不使用 AndroidX，也不使用 Kotlin：纯 Java 字节码，约 210 KB。
- **阻止私有网络之外的明文流量**：`CleartextPolicy` 会拒绝任何不是 HTTPS、也未指向已配置堡垒节点或私有/回环地址的请求；网络安全配置也禁止向应用通信的公共服务（GitHub、DeepSeek）使用明文。该策略在 WebView 之上强制执行，因为 Android 的网络安全配置无法表达“仅私有 IP 段”。
- 禁用本地文件访问，阻止混合内容，禁用弹窗和远程调试。
- 麦克风访问仅限堡垒节点的精确来源（协议、主机和端口）。
- 导航限制在堡垒节点来源内；外部链接交给系统选择器处理。
- TLS 错误立即取消导航。
- `ERR_ABORTED` 与传输中断被区分开来，从而消除了无限重载循环。
- `onRenderProcessGone` 会重建视图，而不是让 Android 杀死应用。
- 应用进入后台时暂停重连，并采用带抖动的指数退避。
- 审批通知会从锁屏隐藏（`VISIBILITY_SECRET`），设备锁定时批准操作拒绝执行。

---

## 测试

```bash
npm test
```

十个套件、**136 项检查**，覆盖发现、移动端注入、`?dshc=off`、跨域拒绝、请求走私防御、请求体上限、内容净化、WebSocket 握手完整性、注册表损坏安全、访问控制、卫星交接、设备注册表 TTL、面板流程以及终止开关。

套件与**运行中的桥接服务**通信（不是模拟）：请先启动桥接服务。真正的终止开关运行具有破坏性——它会撤销设备并轮换密钥——因此需要以 `DSH_TEST_DESTRUCTIVE=1` 主动启用。

---

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

## 社区项目声明

> **声明：** DSH Mobile Companion 是由社区开发的伴随移动客户端，旨在方便开发者通过私有网络（ZeroTier / Tailscale）安全地远程访问 DeepSeek Harness。它不是 DeepSeek 的官方产品，也与 DeepSeek 不存在隶属、赞助或背书关系。文中提及的所有商标和徽标均归其各自所有者所有。

## 许可证

BSL 1.1 / PolyForm Noncommercial 1.0.0。个人、教育和非商业用途免费。未经明确授权，禁止商业再分发和商业利用。

著作权与版权归属：Ismael Muñoz Reyes · Tinta y Nodos。详见 [LICENSE](LICENSE)。
