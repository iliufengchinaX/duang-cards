---
name: duang-site-guardrails
description: Privacy, publishing, and compatibility rules for this public site. Use when editing pages, previews, images, styles, audio, pull requests, or agent configuration. Refer to the child only as Duang / 端端.
---

# Duang 站点护栏

这个仓库是公开的。这里只写规则，不写私人数据的例子。

## 隐私

- 公开站点不得出现孩子的真名、生日、住址、照片、日记，也不得出现任何家庭相册页面。
- 提到孩子时只用 Duang / 端端。
- 不要列出或描述任何私人文件夹里的内容。
- 永远不要提交 `home/` 或 `family/`。

## 截图

- PR 和评论里的截图不得出现孩子的照片或家庭页面。这是公开仓库。

## 分支与合并

- 只在新分支上工作，并通过 PR 提交。
- 不要直接推送到 `main`。
- 合并前必须等仓库所有者批准。

## 预览页

- `preview/` 下的每个页面都必须有：`<meta name="robots" content="noindex">`。

## 微信内置浏览器与 iOS Safari

- `backdrop-filter` 要有不支持时的降级，并写上 `-webkit-` 前缀。
- `preserve-3d` 和 3D 翻页在这些浏览器里不可靠，要准备淡入淡出降级。
- 音频只能在用户点击之后播放。
- 尊重 `prefers-reduced-motion`。
- 用 390px 的手机宽度做检查。

## 图片体积

- 图片保持压缩。能用 WebP 或 AVIF 时就用。
- 首屏以外的图片使用懒加载。

## 现有视觉

- 保持卡片页现有的视觉风格，以及家庭像素风图标。

## 工具与安装

- 未经所有者在安全审查之后批准，不要运行 `npx impeccable update` 或 `impeccable login`，也不要安装新的工具、插件或 npm 包。
- 版本必须钉死。不要使用 `@latest`，不要使用 `npx -y`。
- 运行任何 Impeccable 命令时设置 `DO_NOT_TRACK=1`。
