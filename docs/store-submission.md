# 上架 Chrome Web Store 的准备清单

面向本仓库的 `extension/`（1.1.0，Manifest V3，无 host_permissions）。控制台字段偶尔调整，以 [开发者控制台](https://chrome.google.com/webstore/devconsole) 实际页面为准。

## 一、上架前必须先解决的两件事

### 1. 没有工具栏入口（强烈建议改）

当前 manifest 不声明 `action`，装完后工具栏没有图标，用户只能靠 ⌘E 打开。如果快捷键被别的扩展占用（你自己就遇到过），新用户会**完全无法使用这个扩展**，既拿不到反馈也找不到设置入口——这是审核和评分的高风险点。

推荐做法：加回 `action` 但不设 `default_popup`，用 `chrome.action.onClicked` 调同一个 `toggle()`。这样点图标 = 按 ⌘E：普通网页出居中浮层，受限页面出备用面板；代价是快捷键设置页会重新出现「激活该扩展程序」那一行。

### 2. 商店截图尺寸不合规

商店要求 **1280×800** 或 **640×400**，1–5 张。`docs/e2e/*.png` 是 2200×1120，不能直接用，需要按 1280×800 重新截。

## 二、账号与费用

1. 用 Google 账号登录开发者控制台，接受开发者协议，支付**一次性 5 美元**注册费（不可退）。
2. 完成邮箱验证，建议同时开启两步验证（Google 对发布者账号有强制趋势）。
3. **EU DSA「trader」声明**：若要面向欧盟分发，必须声明是否为商业实体并提供联系地址；声明为非 trader 时欧盟地区的分发会受限。

## 三、素材清单

| 素材 | 要求 | 现状 |
|---|---|---|
| 打包 zip | `manifest.json` 在根目录 | ✅ `quick-switch-extension.zip` |
| 图标 | 128×128 PNG | ✅ `extension/icons/128.png` |
| 截图 | 1280×800 或 640×400，1–5 张 | ❌ 需重截 |
| 小型宣传图 | 440×280（可选） | ❌ 可选 |
| 大型宣传图 | 1400×560（可选，用于推荐位） | ❌ 可选 |
| 隐私政策链接 | 收集数据时必填；建议无论如何都提供 | ❌ 需一个公开 URL |

## 四、商店文案（可直接粘贴）

**名称**（≤45 字符）

```
瞬搜 · QuickSwitch — 标签与历史速搜
```

**简短说明**（≤132 字符）

```
按 ⌘E 唤起命令面板：搜索网址、切换已打开标签、匹配本机浏览历史。纯本地运行，不上传任何数据。
```

**详细说明**

```
瞬搜是一个键盘优先的本地命令面板，交互参考 Arc 的 Command Bar。

按下 ⌘E（Windows/Linux 为 Ctrl+Shift+E）即在当前网页中央唤出搜索框，直接输入即可：

• 输入网址直接跳转，已打开的同一页面会被切换过去，不重复开新标签、不刷新
• 输入标题关键词，快速切换到任意已打开的标签，跨窗口也能跳过去
• 输入任意文字，用 Chrome 当前默认搜索引擎搜索
• 空输入时列出最近访问的页面，最多 8 条

特点：
• 全部检索在本机完成，不联网、不埋点、不保存查询和浏览历史副本
• 不申请任何站点的常驻权限，只在按下快捷键时临时注入面板
• 相同域名不等于相同页面：路径、参数、锚点、协议差异都会保留，避免误跳转

首次安装后若快捷键被其他扩展占用，请打开 chrome://extensions/shortcuts 修改。

本扩展不开源托管于商店之外的服务器，无远程代码，所有逻辑都在安装包内。
```

## 五、隐私标签页的答案

**单一用途说明（Single purpose）**

```
一个本地命令面板：解析用户输入，用于打开网址、切换到已打开的标签、检索本机浏览历史，或用默认搜索引擎搜索。
```

**远程代码**：否（Manifest V3，全部代码在包内，无 eval、无远程脚本）。

**数据使用声明**：不收集、不上传、不共享任何用户数据；不使用分析或遥测；浏览历史仅在本机内存中按需查询，不写入存储、不发送到任何服务器。

**权限逐条说明（英文，审核员通常看英文）**

| 权限 | 说明文案 |
|---|---|
| `tabs` | Enumerate open tabs (title and URL) to offer tab switching, deduplicate results, and activate/focus the chosen tab and its window. |
| `history` | Query local browsing history on demand as search candidates. Results are used in-memory for the current query only; nothing is stored or transmitted. |
| `search` | Run the user's search with Chrome's current default search engine via `chrome.search.query`, instead of hard-coding an engine URL. |
| `activeTab` | Grant temporary access to the current page only when the user invokes the command, so the panel can be injected without requesting permanent host permissions. |
| `scripting` | Inject the panel content script into the active tab at invocation time (paired with `activeTab`). |
| `favicon` | Display site icons for candidates using Chrome's built-in `chrome-extension://<id>/_favicon/` endpoint. No third-party icon service is contacted. |
| `storage` | Use `chrome.storage.session` only to keep a random, per-tab panel token so unauthorized frames cannot query the extension. No queries or history are stored. |

**隐私政策**（需一个公开 URL，例如 GitHub Pages 单页）

```
本扩展不收集、不存储、不传输任何用户数据。浏览历史与标签信息仅在本机内存中用于当次检索，关闭面板即释放。扩展不包含分析、追踪或远程代码。
```

## 六、提交流程

1. 控制台 → 新建条目 → 上传 `quick-switch-extension.zip`。
2. 填写商店列表（名称、简短说明、详细说明、分类选「工具」、语言选中文）。
3. 上传图标与至少 1 张 1280×800 截图。
4. 填隐私标签页（上面第五节的文案）。
5. 选择可见性：Public / Unlisted（仅链接可装）/ Private（仅测试者）。
6. 提交审核。首次审核通常几天；涉及 `history` 这类较敏感权限时可能更久，Google 可能来信要求补充说明。
7. 通过后自动上架。后续更新：改版本号 → 上传新 zip → 再次审核（一般更快）。

## 七、容易被卡住的点

- **权限说明太笼统**：`history` 必须说清"本地按需查询、不落盘、不上传"，否则容易被要求整改。
- **没有可见入口**：见第一节，审核和用户都会困惑。
- **截图带占位数据或与功能不符**：截图必须展示真实功能。
- **版本号不递增**：重复上传同一版本号会被拒绝。
- **隐私政策缺失**：即使声明不收集数据，也建议给一个可访问的链接。
