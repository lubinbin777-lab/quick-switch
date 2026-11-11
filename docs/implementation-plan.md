# QuickSwitch Implementation Plan

> **For agentic workers:** Inline execution in this chat using executing-plans. No external publication or user-profile installation until the result is reviewable.

**Goal:** 实现用户确认的 Chrome 临时搜索浮层及本地标签/历史检索。

**Architecture:** Manifest V3 service worker 调用 Chrome API；独立纯函数负责 URL 与候选排序。一个面板实现由独立扩展来源 iframe 和工具栏弹窗复用，内容脚本仅在快捷键触发时注入。代码审查后增加面板令牌与按标签串行的创建/撤销。

**Tech Stack:** 原生 JavaScript、HTML/CSS、Chrome Extensions API、Node.js node:test。无运行时依赖。

## Task 1 — 核心规则

- [x] 在 tests/core.test.mjs 先写 URL 分类、协议安全、中文与多词匹配、同站不同路径、已有标签去重、查询参数保留、强弱排序和空状态的行为测试。
- [x] `node --test tests/core.test.mjs` 验证缺失实现导致失败。
- [x] 新建 extension/core.mjs，导出 classifyInput/normalizeUrl/buildResults/findMatchingTab，满足测试。
- [x] 再运行核心测试；只修改与失败有关的行为。

## Task 2 — Chrome API 服务

- [x] tests/service.test.mjs 使用 Chrome API 边界替身，验证默认搜索、跨窗口切换、同 URL 不重复、目标标签变化、API 错误和普通/无痕隔离。
- [x] 先运行失败，再实现 extension/service.mjs；历史查询有上限、导航重新确认标签、禁止不安全 URL。
- [x] extension/worker.mjs 接入 commands/onMessage；默认 action popup 作为受限页面入口。extension/manifest.json 定义所需权限和 Command+E。
- [x] `node --test tests/*.test.mjs` 验证服务与核心。

## Task 3 — 面板与交互

- [x] extension/palette.js 提供全局 QuickSwitchPalette.mount(root, adapter, options) 工厂，adapter.search(query)/execute(item) 由两个宿主提供。
- [x] 独立扩展来源 iframe 内渲染固定居中面板：输入、可滚动 listbox、状态、快捷键提示。使用 textContent、焦点恢复、组合输入保护和请求序号。
- [x] extension/content.js 负责页面注入生命周期、遮罩关闭；extension/popup.html + popup.js 提供工具栏模式。
- [x] work/preview 仅使用人工示例数据调用同一 UI 工厂，页面显式标注演示数据。用 CUA 验证展示、检索、上下选择、无结果和关闭；该预览不打包进插件。

## Task 4 — 验证与交付

- [x] 运行所有测试、JS 语法和 manifest 文件路径检查；审查查询与导航 race、协议限制、权限、错误提示和输入法处理。
- [x] 写 README.md：本地加载步骤、快捷键设置、权限用途、受限页面、跨配置限制、已验证与待实测项目。
- [x] 输出可加载 extension 文件夹及 quick-switch-extension.zip，不包含预览数据、测试缓存或用户历史。
- [ ] 如需加载到用户真实 Chrome 配置并授予标签/历史访问，完成代码和包后再请求确认；未完成实机验收则明确说明。

## Verification commands

```sh
node --test tests/*.test.mjs
node scripts/check.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory /Users/lubinbin/Documents/Codex/2026-11-10/ban
```

当前目录没有既有 Git 仓库，不创建无关 worktree，不操作用户其他项目。
