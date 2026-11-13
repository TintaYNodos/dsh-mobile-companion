# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · **[简体中文](README.zh.md)** · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **语言说明：** 本文档翻译旨在方便全球开发者使用 DSH Mobile Companion。非常欢迎社区提出语言修正和 Pull Request（拉取请求）。标准参考原版文档为[西班牙语 (墨西哥)](README.es.md)。

通过 ZeroTier 或 Tailscale 零信任私有网络在移动端安全访问 DeepSeek Harness，无需公网开放端口，且不破坏提示词缓存（Prompt Cache）。

移动应用并未重新实现前端界面：它直接呈现 DeepSeek Harness 原生 Web GUI，并自动注入移动端触控优化。你在手机上看到的，就是电脑端运行的完全相同的产品。

由 Ismael Muñoz Reyes 为 Tinta y Nodos 打造的高安全加固版本。

---

## 解决的问题

DeepSeek Harness 监听在 `127.0.0.1`，并通过由 `.credentials.yaml` 派生的 HMAC Cookie 保护其会话。因此，仅靠开放端口或通用隧道工具远远不够：没有该 Cookie，界面会直接返回 401 未授权；若随意重写请求来源（Origin），则会破坏维持提示词缓存（Prompt Cache）所需的稳定前缀。

本项目同时解决了这三项核心问题：

- **透明会话签名**：桥接服务读取本地密钥，生成 HMAC-SHA256（版本 1）Cookie，并在其过期前自动续期。移动端浏览器永远不会接触到底层密钥。
- **真实产品的触控优化**：仅注入视口（viewport）元数据与极简样式表。不替换原生界面，也不向文档中注入外置 JavaScript。
- **网络层严密隔离**：套接字仅绑定至 VPN 虚拟网络接口，且仅接受来自该私有网络的客户端连接。

---

## 架构

```text
手机（ZeroTier / Tailscale 零信任私有网络）
        |
        v
bridge.mjs  ——独占绑定至 VPN 私有 IP——
   |-- /                      反向代理至 DeepSeek Harness + 移动端触控适配
   |-- /offline               Harness 尚未响应时的等待页面（集成离线阅读器）
   |-- /dsh-companion/status  连接发现与链路健康检查
   |-- /dsh-companion/sync    对话转储至本地磁盘
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

模块结构：

```text
companion/
├── bridge.mjs              服务启动、路由分发、套接字与访问控制策略
├── offline.html            与产品原生美学一致的待机页面（内置离线阅读器）
├── manifest.webmanifest    渐进式 Web 应用（PWA）安装清单
├── icon.svg
├── android_src/
│   └── MainActivity.java   原生 Android 客户端：加固 WebView、状态胶囊、自动重连
├── test/
│   ├── verify_bridge.mjs      路由、注入、来源校验、框架与边界测试
│   ├── verify_sync_ws.mjs     内容无害化与 WebSocket 握手验证
│   └── verify_access_key.mjs  共享访问密钥认证校验
├── src/
│   ├── config.mjs          统一集中管理配置参数与阈值限制
│   ├── log.mjs             带毫秒级时间戳的高性能日志记录
│   ├── network.mjs         VPN 接口发现、客户端授权与 Harness 端口探测
│   ├── crypto.mjs          安全密钥管理、HMAC v1 Cookie、访问密钥与常量时间比对
│   ├── http.mjs            HTTP 请求头净化、限制请求体大小与受信任来源验证
│   ├── proxy.mjs           HTTP 反向代理与 WebSocket 隧道通信
│   ├── mobile.mjs          视口注入与触摸交互优化
│   ├── sync.mjs            对话记录的原子化持久化存储
│   ├── static.mjs          带 ETag 缓存验证的本地静态资源托管
│   └── ratelimit.mjs       基于每客户端令牌桶算法的访问限流
└── synced_chats/           导出的对话记录（.md 与 .json 格式）
```

---

## 安装指南

### 电脑端

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. 配置访问密钥（强烈推荐，详见下文）。
2. 使用 `install-autostart.bat` 安装开机自启（在 Windows 启动时注册静默计划任务）。
3. 桥接服务会自动探测 ZeroTier 或 Tailscale 网络接口并绑定。若自动探测失败，请通过环境变量 `DSH_BIND_HOST` 指定私有 IP。

### 手机端

提供两种完全等效的使用方式：

- **原生应用：** 从 *Releases* 页面下载安装 `DSH-Companion.apk`。提供网络自动重连、堡垒节点选择器以及沉浸式全屏体验。安装包体积小于 160 KB，不包含任何第三方库依赖：仅包含客户端纯净代码、应用图标与定制主题。
- **免安装浏览器访问：** 在手机浏览器中直接访问 `http://<VPN_IP>:57420` 并选择“添加到主屏幕”。

`/m` 路由会返回永久重定向（301）至 `/`：旧版的精简卫星模式已被废弃，全面由真实产品的完整界面取代。

---

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DSH_BIND_HOST` | 自动检测 | 强制绑定特定的私有 VPN IP |
| `DSH_TARGET_PORT` | `52710` | DeepSeek Harness 服务端口 |
| `DSH_LISTEN_PORT` | `57420` | 桥接服务监听端口 |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | 凭据及访问密钥存放目录 |
| `DSH_BROWSER_SECRET` | — | 直接传入会话密钥，免去读取 YAML 配置文件 |
| `DSH_ACCESS_KEY` | 自动生成 | 共享访问密钥；优先覆盖文件中的密钥 |
| `DSH_ACCESS_DISABLE` | — | 设为 `1` 禁用密钥验证（仅限绑定回环接口 loopback 时） |
| `DSH_COMPANION_TOKEN` | 空 | 用于 `/dsh-companion/sync` 的附加安全令牌 |
| `DSH_ALLOW_CIDR` | 空 | 额外允许访问的子网列表（逗号分隔 CIDR） |

### 电脑端一次性配对批准

无需在手机上手动输入复杂的访问密钥：

1. 在手机上打开应用，屏幕提示“请在电脑上确认”（Confirma en la computadora）。
2. 在电脑浏览器打开 `http://<VPN_IP>:57420/pair`。
3. 界面会显示发起配对请求的设备及其 IP 地址。点击 **授权 (Autorizar)**。
4. 手机端将自动无感登入，之后不再需要重复验证。

会话有效期为 **30 天，且随使用自动续期**：每次在间隔 24 小时后打开应用，有效期倒计时便重置回 30 天。只要每月至少使用一次，会话将永久有效。

配对管理面板 **仅监听在 127.0.0.1**，并要求独立的管理员凭据，因此无法通过 VPN 或局域网外部机器访问。面板中清晰列出所有已授权的设备，并支持单独撤销特定设备的访问权。

已授权设备数据持久化存储在 `%USERPROFILE%\.dsh\companion-devices.json`。面板提供 **全部撤销 (Revocar todos)** 按钮。详细机制请参阅 [DISPOSITIVOS.md](DISPOSITIVOS.md)。

传统的手动访问密钥依然保留在 `%USERPROFILE%\.dsh\companion-access-key` 中，作为普通移动浏览器登录的备选凭据。原生 App 无需使用该密钥。

**客观安全限制：** HTTP Basic 认证在网络传输中采用 Base64 编码密钥，本身不具备传输加密性。该设计之所以能够保障安全，是因为 ZeroTier 和 Tailscale 在传输层提供了强制的端到端隧道加密。若在公开或共享的 ZeroTier 网络中，恶意成员可能会尝试在数据链路层（二层）截获数据包；因此标准的安全防御实践是保持私有网络的手动审批授权模式。

---

## 路由端点

- `GET /` — DeepSeek Harness Web GUI，当客户端为移动设备时自动注入触控适配。
- `GET /offline` — Harness 正在启动时的等待页面，集成支持预加载会话的离线阅读器（Lector Editorial Offline）。
- `GET /dsh-companion/status` — 返回 `{ service, version, status, dshOnline, targetPort, time }`，绝不暴露主机名或底层平台信息。
- `POST /dsh-companion/sync` — 将会话历史以 Markdown 和 JSON 格式保存至 `synced_chats/`。
- `GET /dsh-companion/chats` — 获取已同步会话的时间倒序列表，供离线阅读使用。
- `GET /dsh-companion/chat/:id` — 获取指定会话的完整内容（默认返回结构化 JSON，支持 `?format=md` 获取纯 Markdown）。
- `POST /dsh-companion/action` — 在后台远程响应工具调用授权与沙盒权限确认（如 `danger-full-access`）。
- `GET /companion.webmanifest` — PWA 应用安装清单。

---

## 安全模型

**访问控制**

- 所有路由端点（包括状态发现）均强制通过 HTTP Basic 校验共享密钥；采用常量时间算法进行比对以抵御时序攻击，并具备针对单 IP 的请求频次限制。
- 严密的客户端准入控制：仅允许本地回环（loopback）、绑定网络接口所在的子网（**基于真实网络掩码计算**）或显式声明的 CIDR。
- 请求头 `Host` 必须与桥接服务监听地址严格一致，彻底杜绝 DNS 重绑定（DNS Rebinding）攻击。
- 严格拒绝 `Origin: null`、空来源以及 `Sec-Fetch-Site` 不为 `same-origin`/`none` 的请求。
- 拒绝同时携带 `Content-Length` 与 `Transfer-Encoding` 的请求（防御 HTTP 请求走私攻击）。
- 客户端访问密钥与鉴权令牌在进行反向代理前被彻底剥离，绝不透传给后端 Harness 服务。
- WebSocket 隧道遵循完全一致的来源校验标准、CRLF 字符过滤净化机制与优雅切断流程。

**凭据安全**

- 会话密钥仅在启动时读取一次，不计入任何日志，且绝不向客户端传输。在服务初始化时即验证其有效性：若缺失，进程立即报错退出，而非让请求无限挂起。
- 自动生成与 DeepSeek Harness 官方完全一致的 HMAC-SHA256（版本 1）Cookie，具备 12 小时有效期并在到期前提前自动续期。
- 若后端返回 401 状态码，桥接服务会重新加载密钥文件并自动重试一次：即使 `.credentials.yaml` 发生轮换，也无需重启桥接服务即可平滑恢复。

**数据与存储安全**

- 同步的对话记录以原子写入（atomic write）方式落盘，文件名由严格受控的安全标识符派生，并执行严格的路径沙盒限定校验（防御目录穿越漏洞）。
- 所有对话内容在序列化前均经过转义处理：恶意可执行 HTML 绝不会扩散至本地文件或索引视图中。
- 对 HTTP 请求体体积、单会话消息总数及单条消息长度均设有显式的硬性上限。
- 限流器（Rate Limiter）设有严格的内存占用上限：恶意攻击者无法通过伪造大量随机请求键来耗尽系统内存。

**原生应用安全（Android）**

- `DSH-Companion.apk` — 版本 4.4.0，`versionCode` 21，`minSdk` 26，`targetSdk` 35。
- 体积小于 240 KB，完全不依赖 AndroidX 或 Kotlin：`classes.dex` 均为纯净、可重现构建的原生 Java 代码。
- **动态多电脑支持：** 支持无限添加与切换计算机节点，具备智能选择与安全删除机制。
- **后台交互式通知：** 支持直接在 Android 系统通知栏中批准或拒绝工具调用以及 `danger-full-access` 沙盒权限，无需打断当前工作流打开应用主界面。
- **离线阅读器：** 即使电脑端完全关机，也能在手机端浏览已同步的历史会话，内置专为章节与长篇叙事优化的出版级优雅排版字体。
- **严谨工业级控制台设计：** 界面完全摒弃不成熟的卡通表情符号，采用清晰的控制台信息层级结构，并搭载官方 DeepSeek / GitHub Dark 高清深色调色板。
- 彻底禁用本地文件系统访问（Local file access），严密拦截混合内容（Mixed Content），关闭一切弹出窗口与远程调试接口。
- 麦克风音频采集权限仅严格授予受信任堡垒节点的完全一致源（协议、主机与端口号）；对任何其他来源一律默认拒绝。
- 页面导航跳转严格限制在堡垒节点源内；外部超链接一律调起系统原生选择器在外部独立浏览器中打开。
- TLS 证书校验错误一律直接中断连接，绝无任何宽容例外。
- 页面加载中止（`ERR_ABORTED`）不会被错误视作网络故障，彻底杜绝异常条件下的无限重载死循环。
- 当应用退至后台时自动暂停连接重试逻辑，并在前台唤醒时引入带抖动的指数退避（Backoff + Jitter）算法以平抑瞬时重连风暴。

---

## 测试

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # 运行时需预先声明 DSH_ACCESS_KEY
```

测试集全面覆盖服务发现、移动端触控注入、对 `?dshc=off` 参数的遵循、跨域请求拦截、请求走私防御、请求体边界限制、内容无害化净化、WebSocket 握手流程以及严格访问控制。

---

## 诚实的设计边界

本架构专为**个人私有使用**打造：单用户、专属硬件设备、私有虚拟局域网。本项目并非多租户多用户云服务。

- 桥接服务授予对运行该进程的 Windows 账户下 DeepSeek Harness 会话的完全访问权限。不存在用户或设备间的数据隔离沙盒。
- 同一用户的多台手机共享同一个 Harness 会话，但每台设备均在控制面板中独立授权并可随时单点撤销。
- 系统不包含用户账户或角色权限（RBAC）体系：持有已授权设备的物理使用者即为会话拥有者。
- 授权管理面板仅展示近期接入活动记录，并非不可篡改的安全审计日志：支持一键清空记录。
- 任何公共或不受控的共享 ZeroTier 网络都会直接瓦解网络防火墙边界。请务必在 my.zerotier.com 上将其维持为需手动审批准入的私有网络。
- 宿主电脑的 Windows 本地管理员拥有最高权限，能够直接读取会话凭据与聊天记录。这是 Windows 系统的固有安全边界模型，而非桥接服务的逻辑缺陷。
- 同步保存的会话记录以明文形式存储于 `synced_chats/` 目录下。在 Windows 环境下，POSIX 的 `0600` 文件权限并不等同于严格的 ACL 保护：底层真实的权限隔离依赖于 Windows 用户配置文件的 ACL。如果是多人共享使用的电脑，请启用 BitLocker 等整盘加密技术。
- 私网内部流量采用 HTTP 明文传输。该方案在安全架构上是完全合理的，因为 ZeroTier 与 Tailscale 在底层传输协议中已提供高强度的端到端加密；切勿将此服务端口直接暴露至私有网络之外的公网环境。
- 网络层的客户端准入校验基于源 IP 地址。它无法防御已经黑入并控制了该私网内部其他设备的恶意攻击者：针对此类高对抗威胁模型，请务必启用 `DSH_ACCESS_KEY` 共享密钥保护。

---

## 社区项目声明

> **声明：** DSH Mobile Companion 是由社区主导开发的开源移动辅助客户端，旨在方便开发者通过私有网络（ZeroTier / Tailscale）安全远程访问 DeepSeek Harness。本项目并非 DeepSeek 官方产品，亦未与 DeepSeek 存在关联、赞助或背书关系。文档中提及的所有品牌名称及商标均归其各自所有者所有。

## 许可证

BSL 1.1 / PolyForm Noncommercial 1.0.0 协议。个人、教育及非商业用途免费授权使用。未经明确书面许可，严禁擅自进行二次分发或商业牟利。  
版权所有与著作权人：Ismael Muñoz Reyes · Tinta y Nodos。详见 [LICENSE](LICENSE)。
