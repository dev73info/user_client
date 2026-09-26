---
version: alpha
name: 73Info 用户端
description: "73Info 需求担保交易平台的用户端（需求方）与开发者端。同一个 SPA 内并存「门户」与「开发者工作台」两套视觉体系：门户是冷灰白底 + 大圆角卡片，开发者是冷白底 + 青绿与金色辅助强调，二者共用品牌蓝 #1f4ad1。"
colors:
  # —— 品牌与全局兜底（src/styles/resource-core.css 的 :root）——
  primary: "#1f4ad1"
  primary-deep: "#2563eb"
  primary-light: "#4f8cff"
  secondary: "#2aa6a4"
  tertiary: "#b9812b"
  neutral: "#edf3f5"
  portal-bg-deep: "#edf3f5"
  portal-bg-mid: "#f5f8fa"
  portal-bg-soft: "#ffffff"
  portal-card: "rgba(255, 255, 255, 0.92)"
  portal-card-border: "rgba(148, 163, 184, 0.3)"
  portal-text: "#172033"
  portal-text-sub: "#52627a"
  portal-success: "#16805c"
  # —— 门户（src/styles/home.css 的 .portal-home）——
  portal-panel: "rgba(255, 255, 255, 0.96)"
  portal-panel-strong: "#ffffff"
  portal-border: "rgba(203, 213, 225, 0.72)"
  portal-ink: "#0f172a"
  portal-muted: "#64748b"
  # —— 首页统计卡与流程状态色 ——
  portal-stat-blue: "#2563eb"
  portal-stat-indigo: "#1d4ed8"
  portal-stat-green: "#059669"
  portal-stat-amber: "#d97706"
  portal-stat-violet: "#7c3aed"
  portal-flow-violet: "#7c3aed"
  portal-flow-blue: "#2563eb"
  portal-flow-green: "#10b981"
  portal-flow-amber: "#f59e0b"
  portal-flow-red: "#ef4444"
  # —— 开发者体系（src/styles/dev-base.css 的 :root）——
  dev-bg: "#f1f4fb"
  dev-surface: "rgba(255, 255, 255, 0.96)"
  dev-surface-strong: "#ffffff"
  dev-ink: "#0f172a"
  dev-muted: "#64748b"
  dev-line: "rgba(203, 213, 225, 0.66)"
  dev-blue: "#1f4ad1"
  dev-cyan: "#2aa6a4"
  dev-gold: "#b9812b"
  # —— 状态色：一律「浅底 + 深字」（src/styles/profile.css 口径）——
  status-success-soft: "rgba(34, 197, 94, 0.12)"
  status-success-text: "#166534"
  status-warning-soft: "rgba(245, 158, 11, 0.14)"
  status-warning-text: "#92400e"
  status-danger-soft: "rgba(239, 68, 68, 0.12)"
  status-danger-text: "#b42318"
typography:
  body-md:
    fontFamily: "'Space Grotesk', 'Noto Sans SC', sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.7
  headline-lg:
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  headline-md:
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  headline-sm:
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.5
  body-sm:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.08em
  numeric:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  code:
    fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 8px
  md: 10px
  lg: 12px
  xl: 18px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  portal-grid-gap: 14px
  dev-grid-gap: 24px
  portal-shell-max: 1280px
  dev-page-max: 1120px
  right-rail-min: 300px
  touch-target: 44px
components:
  card-portal:
    backgroundColor: "{colors.portal-panel}"
    textColor: "{colors.portal-ink}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-portal-hover:
    backgroundColor: "{colors.portal-panel-strong}"
    textColor: "{colors.portal-ink}"
  card-dev:
    backgroundColor: "{colors.dev-surface}"
    textColor: "{colors.dev-ink}"
    rounded: "{rounded.lg}"
    padding: 20px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    height: 40px
  button-touch:
    height: "{spacing.touch-target}"
  tag-status-success:
    backgroundColor: "{colors.status-success-soft}"
    textColor: "{colors.status-success-text}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  tag-status-warning:
    backgroundColor: "{colors.status-warning-soft}"
    textColor: "{colors.status-warning-text}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  tag-status-danger:
    backgroundColor: "{colors.status-danger-soft}"
    textColor: "{colors.status-danger-text}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  input:
    backgroundColor: "{colors.portal-bg-soft}"
    textColor: "{colors.portal-text}"
    rounded: "{rounded.md}"
    height: 40px
  nav-item-mobile:
    textColor: "{colors.portal-text-sub}"
    height: "{spacing.touch-target}"
---

# 73Info 用户端 DESIGN.md

> **本文是什么**：按 [DESIGN.md 格式规范](https://github.com/google-labs-code/design.md) 写的、给 AI 代理读的**视觉身份**文件。上面 frontmatter 里的令牌是**规范性取值**，正文负责解释怎么用。
> **与 [设计规范.md](设计规范.md) 的分工**：本文管「长什么样」（令牌、视觉口径、禁令）；`设计规范.md` 管「怎么落到代码」（样式文件与加载顺序、Element Plus 的接入方式、交付自检清单）。
> **两处色值必须一致。** 改配色时两个文件一起改。令牌值以 `src/` 下的 CSS 为准。
> 章节标题沿用规范规定的英文名（`## Colors` 等）以便工具识别，正文一律中文。
> **lint 预期**：`npx @google/design.md lint` 应为 **0 error**。`orphaned-tokens` 警告是预期内的——这里登记的是一整份色板（含首页统计色、流程状态色、开发者强调色等**页面级**用法），而规范的组件属性只覆盖 `backgroundColor` / `textColor` / `rounded` / `padding` / `size` 等少数几项，**没有边框与阴影属性**，所以描边色、分隔色与页面级色必然显示成「未被组件引用」。不要为了让这个警告消失去编造组件。

## Overview

73Info 是需求担保交易平台，用户端同时服务两类人：**需求方**（发布需求、签合同、付定金与尾款、验收）与**开发者**（接单、交付、收款、提现）。前者要建立信任感，后者要高信息密度与效率。

因此这一端在一套代码里并存**两套视觉体系**：

| 体系 | 覆盖范围 | 令牌前缀 | 主色 | 气质 |
| --- | --- | --- | --- | --- |
| 门户 | 首页、需求大厅、资源、社区、个人中心、工作台外壳 | 无前缀与 `--portal-*` | `#1f4ad1` | 冷灰白底、大圆角卡片、毛玻璃，面向需求方的「可信、从容」 |
| 开发者 | 开发者工作台、资源管理、需求详情、钱包 | `--dev-*` | `#1f4ad1` + `#2aa6a4` + `#b9812b` | 冷白底 + 青绿与金色强调，面向开发者的「精确、好读」 |

两套共用同一个品牌蓝 `#1f4ad1`，靠**底色温度与辅助色**区分，而不是靠换主色。

**硬规则：不要新建第三套令牌。** 拿不准新页面属于哪一套时看路由：挂在 `src/router/dev.ts` 下的属开发者体系，其余属门户体系。个人中心的 `--profile-*` 是唯一一处**页面级**令牌，只在 `.profile-page` 内生效，不要当全局用。

另有两条与视觉无关但必须先知道的产品约束：富文本必须经 `src/utils/sanitizeHtml.ts`（DOMPurify）净化并做 URL 白名单校验（后端还有一道 ammonia）；这一端**必须做移动端响应式**。

## Colors

门户侧是**高对比冷灰中性色 + 单一品牌蓝**；开发者侧在同一中性色骨架上加了青绿（进行中）与金色（金额、提示）两支强调色。

- **Primary（`#1f4ad1`）**：品牌蓝，两套体系共用的唯一主色。用于主操作、选中态、链接与强调文字。**每个屏幕只用于一个最重要的动作。**
- **Primary deep / light（`#2563eb` / `#4f8cff`）**：主按钮渐变 `linear-gradient(135deg, #2563eb, #4f8cff)` 的两端，也用于首页统计卡。
- **Secondary（`#2aa6a4`）**：青绿，仅开发者侧使用，表示「进行中」与辅助强调。
- **Tertiary（`#b9812b`）**：金色，仅开发者侧使用，表示金额与需要留意的提示。
- **Neutral（`#edf3f5`）**：门户与开发者共用的页面最外层底色。`body` 在其上叠了三层径向渐变（左上蓝、右上青、右下金），这是这一端的标志性背景。
- **门户面板（`rgba(255,255,255,0.96)`）**：门户卡片底，比纯白略带透明，让底部渐变透出来一点。
- **开发者面板（`rgba(255,255,255,0.96)`）**：开发者卡片底。**注意**：这里曾经是带米色的暖白，已改为冷白以与工作台外壳的冷色对齐；不要再写回暖调。
- **状态色**：成功 / 警告 / 危险各是一组「浅底 + 深字」。**新写状态标签沿用这个组合，不要用饱和色直接铺底。**

文字色分三档：门户正文 `#172033`、次要 `#52627a`；开发者正文 `#0f172a`、次要 `#64748b`。

## Typography

字号**没有全局基准**，浏览器默认 16px 起步，实际字号由各页面显式声明。

- **Headlines（14–18px / 600）**：卡片标题。不要引入 20px 以上的新档位。
- **Body（13px / 400）**：正文主力字号。这是这一端出现最多的字号。
- **Body small（12px / 400）**：次要说明。
- **Label caps（11px / 500 / `letter-spacing: 0.08em`）**：大写英文角标与标签。不要再低于 11px。
- **Numeric**：金额与计数必须加 `font-variant-numeric: tabular-nums`，否则刷新时数字会跳动（`App.vue`、`InvoiceApplyDialog.vue` 有先例）。
- **Code**：富文本代码块用 `'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace`。

**关于 Web 字体的现状（务必知道）**：代码里声明了三套字体栈，但仓库里**没有任何 `@font-face`，也没有字体 CDN 引用**，所以声明的 `Space Grotesk` / `IBM Plex Sans` 一个都不会加载，实际渲染成操作系统默认无衬线字体（Windows 上通常是微软雅黑）。

- `body` 上的 `'Space Grotesk', 'Noto Sans SC', sans-serif` 是**实际生效**的那一条。
- `dev-base.css` 给 `:root` 声明了 `'IBM Plex Sans', ...`，但 `body` 自己有声明，所以这一条不会作用到正文——写着 IBM Plex Sans，实际看不到它。

想让 Web 字体真正生效，需要先补字体文件或 CDN，那是另一次改动，动之前先确认。

## Layout

门户用**固定上限的居中栅格**，开发者用**更窄的居中单列**。

| 位置 | 宽度 |
| --- | --- |
| 门户外壳 `.portal-shell` | `min(1280px, calc(100% - 24px))`，居中 |
| 门户两栏 `.portal-layout` | `minmax(0, 1.58fr) minmax(300px, 0.72fr)`，右栏 `position: sticky; top: 86px` |
| 开发者页 `.dev-page` | `min(1120px, 100%)`，居中 |

**写新页面时从这套现成值里继承容器宽度，不要自造 `max-width`。**

间距：门户侧栅格用 `gap: 14px`；开发者侧 `.dev-grid` / `.dev-page` 用 `gap: 24px`。

### 外壳与滚动（关键）

```
.app-shell
└── .app-content
    └── el-scrollbar.app-scrollbar
        └── .app-view-container          ← :class 上加 --no-footer 控制页脚
```

**滚动发生在外壳的 `el-scrollbar` 上，页面内不要再套一层滚动容器**，否则页内的 `sticky` 会失效。

### 响应式

新增代码**只用这四个断点**：

| 断点 | 用途 |
| --- | --- |
| `980px` | 门户与开发者主布局由多栏转单栏 |
| `900px` | 导航转移动端形态、侧栏折叠 |
| `780px` | 次级多栏结构收窄 |
| `640px` | 触屏档：按钮撑满、字号下调、弹窗全屏化 |

存量样式里有 116 处媒体查询、23 个互不相同的断点值（`200`–`1200px`），**那是债不是许可**。不要因为「别人也这么写」再加新断点；改老页面时顺手并到最近的约定断点上。

### 移动端硬要求

- **触摸目标不小于 `44px`**：低于 `640px` 时，按钮、列表项、菜单项要显式写 `min-height: 44px`。
- **安全区**：贴底或贴边的固定元素用 `env(safe-area-inset-*)`。
- **交付前必须在 `320 / 375 / 414px` 三个宽度实测无横向滚动。**
- 移动端优先复用现成组件：`components/PortalMobileDock.vue`（底部导航坞）、`components/MobileResourceList.vue`（资源列表移动版），不要重写一套。

## Elevation & Depth

深度主要靠**描边 + 大而淡的投影**，很少用重阴影。

- **门户卡片**：`1px solid rgba(203, 213, 225, 0.72)` 描边，投影 `0 14px 34px rgba(71, 85, 105, 0.08)`；悬浮时换成 `0 20px 44px rgba(71, 85, 105, 0.13)`。
- **开发者卡片**：投影 `0 20px 44px rgba(71, 85, 105, 0.1)`。
- **毛玻璃**：`--glass-blur: 12px`。门户的顶栏与弹窗用半透明底 + 模糊，让底部渐变透出来。

投影刻意做得淡——同屏卡片多，投影重了整页会显脏。**不要引入第二档投影。**

## Shapes

圆角是这一端最明显的识别特征：**偏大**。

按实测使用频次排序：胶囊 `999px`（最多的形态，用于标签与按钮）、`12px`、`8px`、`18px`、`10px`、`14px`、`16px`。

**新代码从这四个里选**：`12px`（卡片）、`10px`（小控件）、`8px`（内嵌块）、`999px`（胶囊）。不要再引入新的圆角值。

## Components

| 组件 | 口径 |
| --- | --- |
| 门户卡片 | `--portal-panel` 底 + `1px solid var(--portal-border)` 描边 + `var(--portal-shadow)`，悬浮换 `--portal-shadow-hover` |
| 开发者卡片 | `--dev-surface` 底 + `var(--dev-shadow)` |
| 主按钮 | 品牌蓝铺底 + 白字；门户侧主按钮用 `--primary-gradient` 蓝色渐变；形态默认胶囊 `999px` |
| 状态标签 | 「浅底 + 深字」（见 Colors 末段），胶囊形态 |
| 输入框 | `40px` 高，圆角 `10px`，白底 |
| 表格 / 数字列 | 金额与计数加 `font-variant-numeric: tabular-nums` |
| 移动端导航坞 | 复用 `PortalMobileDock.vue`，贴底并带安全区内边距 |

### Element Plus 怎么接的（易踩坑）

`vite.config.ts` 用 `unplugin-vue-components` + `ElementPlusResolver` 按需引入，且 `importStyle: false`（样式由 `main.ts` 手动整包引入）。图标库是 `@element-plus/icons-vue`。

**Element Plus 的主色没有被全局覆盖，仍是默认的 `#409eff`。** 工作台里看到的蓝/青按钮，是各页面在局部改写 `--el-*` 变量实现的：

```css
/* src/styles/dev-resource.css */
.el-button { --el-button-text-color: var(--dev-blue); --el-button-active-bg-color: var(--dev-blue); }
```

要改某一处 Element Plus 组件的外观，**照这个套路在对应页面或样式文件里改写 `--el-*`**，不要去写全局主题覆盖——目前没有那一层。

### 样式加载顺序

`src/main.ts` 的导入顺序**就是**覆盖顺序，越靠后越优先：

```ts
import 'element-plus/dist/index.css'   // 1. 组件库底座
import './styles/user.css'             // 2. 门户侧（内含 9 个 @import）
import './styles/unified-top-card.css' // 3. 统一顶部卡片
import './styles/dev.css'              // 4. 开发者侧（内含 5 个 @import）
```

## Do's and Don'ts

- **Do** 先定体系（门户 / 开发者）再动笔，只使用该体系已有的令牌。
- **Do** 从本文给出的容器宽度、圆角、字号档位里选现成值。
- **Do** 颜色只写令牌，不写裸十六进制——例外是那三处登记为「页面级令牌」的页面。
- **Do** 页内不套滚动容器，滚动交给外壳；`sticky` 依赖这一点。
- **Do** 数字列加 `tabular-nums`；金额与计数尤其必要。
- **Do** 移动端触摸目标 ≥ `44px`，并在 320 / 375 / 414px 实测无横向滚动。
- **Do** 富文本走 DOMPurify + 后端 ammonia 双重净化，URL 过白名单。
- **Don't** 新建第三套令牌，或把页面级 `--profile-*` / `--signature-accent` / `--points-teal` 当全局用。
- **Don't** 引入本文没登记的新的颜色值、圆角值或字号（尤其 10px 以下、20px 以上）。
- **Don't** 新增媒体查询断点，只用 980 / 900 / 780 / 640。
- **Don't** 写全局 Element Plus 主题覆盖，走局部 `--el-*`。
- **Don't** 把开发者侧写回暖白底——那套暖调已经移除。
- **Don't** 因为「代码里声明了 Space Grotesk」就以为它在生效。
