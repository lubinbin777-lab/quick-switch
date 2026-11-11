# 验证记录

2026-11-10，macOS。本机 Chrome 157.0.8103.39。代码尚未加载进真实 Chrome 配置。

## 已完成

- Node 测试：31/31 通过。
- Manifest、8 个 JavaScript 文件语法与已声明资源路径检查通过。
- 实际面板代码在浏览器中使用人工数据运行：11/11 交互测试通过。
- 独立来源框架人工输入 `private-search-test`，宿主文档 capture 阶段 keydown/input 计数均为 0。
- 独立代码审查后修复：凭据 URL 误作搜索、Shadow DOM 输入事件隔离不足、快速关闭再打开导致旧撤销删除新会话。每个确定的逻辑问题均补充了回归用例。

## 覆盖范围

核心测试包括网址分类、安全协议、完整 URL 去重、中文与多词匹配、排序、补全、上限；API 边界测试包括调用默认引擎、同网址不新建、跨窗口聚焦、失效标签、错误传播、普通/无痕隔离。API 测试使用替身，不代表真实 Chrome API 已端到端验收。

浏览器交互测试覆盖：初始焦点、方向键/回车、快速输入立即执行、中文组合输入（合成 CompositionEvent）、异步旧结果丢弃、补全选区/删除、前导空格、重复提交、失败重试、Esc 焦点恢复、遮罩关闭及文本渲染。

输入隔离测试使用 localhost/127.0.0.1 不同来源验证浏览器事件边界；实际 chrome-extension 来源及 Chrome API 消息集成仍需加载后验收。

## 待真实 Chrome 验收

> 2026-11-10 补测：以下项目已用独立 Chrome 配置覆盖了大部分，见文末「端到端验收」。剩余未覆盖项在文末列出。

- ⌘E 是否成功注册并覆盖原生查找选中文字操作。
- 原生 ⌘T 保留、受限页面 fallback、favicon 显示。
- 真实历史读取、实际默认搜索引擎跳转、跨窗口激活和不新增标签。
- 扩展来源 iframe 的 ready/close 消息、service worker 暂停恢复。
- 用户实际中文输入法与当前 Chrome 配置兼容性。

本记录将自动化/人工数据验证与实机验收明确分开，不把演示页作为已安装插件的证明。

## 端到端验收（2026-11-10 补测）

可复现：`npm run e2e`（`scripts/e2e-acceptance.mjs`）。Chrome for Testing 156、临时 profile、原版 `extension/`（manifest 未改），⌘E 经浏览器级按键注入触发。

- 1–5、7、8 通过；6 首次运行直达 Google 结果页，重复运行会被人机验证拦截；9（原生 ⌘T）需人工按键。
- 关键证据：`chrome.commands.getAll()` 返回 `toggle-palette = ⌘E`，徽标为空；原版 manifest 只有 `activeTab`，键盘命令仍成功注入浮层，说明 `activeTab` 由命令手势授予。
- 未覆盖：真实中文输入法、favicon 实际加载、service worker 长时暂停恢复、用户日常配置中的扩展与快捷键冲突。
- 详见 `docs/e2e-acceptance-2026-11-10.md`。
