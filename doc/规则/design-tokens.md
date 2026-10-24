# 视觉与样式口径（user_client）

完整版在 `doc/设计规范.md`，**改样式时改代码、顺手改那份文档**。本文只收最容易踩错、必须每次记住的几条。

## 一、一个 SPA 里并存两套视觉体系

| 体系 | 覆盖范围 | 令牌前缀 | 主色 |
| --- | --- | --- | --- |
| 门户 | 首页、需求大厅、资源、社区、个人中心、工作台外壳 | 无前缀（`--accent` 等）与 `--portal-*` | `#1f4ad1` |
| 开发者 | 开发者工作台、资源管理、需求详情、钱包 | `--dev-*` | `#1f4ad1` + `#2aa6a4` + `#b9812b` |

**硬规则：不要新建第三套令牌。** 拿不准新页面属于哪一套时，看路由挂在哪：`src/router/dev.ts` 里的是开发者体系，其余是门户体系。

- 开发者侧是**冷调**（冷白卡 + 偏蓝灰描边 + 带蓝调的阴影）。**不要把暖调写回去**。
- `src/styles/profile.css` 的 `--profile-*` 是**页面级**色板，只在 `.profile-page` 内生效，不要当全局用。
- 页面自己的颜色只写令牌，不写裸十六进制。

## 二、档位（不要自造新值）

- **圆角**从这四个里选：`12px`（卡片）/ `10px`（小控件）/ `8px`（内嵌块）/ `999px`（胶囊）。
- **字号**：正文主力 `13px`，次要说明 `12px`，标签与角标 `11px`，卡片标题 `14px–18px`。不要引入 `10px` 以下或 `20px` 以上的新档位。
- **容器宽度**继承现成值，不要自造 `max-width`：门户外壳 `min(1280px, calc(100% - 24px))`，开发者页 `.dev-page` `min(1120px, 100%)`。
- **间距**：门户侧栅格 `gap: 14px`，开发者侧 `.dev-grid` / `.dev-page` 用 `gap: 24px`。
- **金额与计数**加 `font-variant-numeric: tabular-nums`，避免数字跳动。
- **状态标签**沿用「浅底 + 深字」思路（如 `rgba(34,197,94,.12)` 配 `#166534`），不要用饱和色做背景。
- **标题下不顶装饰性副标题**：只有承载必要信息（状态、倒计时、口径、必填提示）时才保留。

## 三、样式文件与加载顺序

`src/main.ts` 的导入顺序**就是**覆盖顺序，越靠后越优先：

```ts
import 'ui_73info/styles.css'          // 1. 组件库令牌与底座 —— 导出映射到 ui_73info/src/styles/index.css（driftlint-ignore：包导出别名，不是文件系统路径）
import './styles/user.css'             // 2. 门户侧 —— 实际文件 src/styles/user.css（driftlint-ignore：相对 src/main.ts 的导入写法）
import './styles/unified-top-card.css' // 3. 统一顶部卡片 —— 实际文件 src/styles/unified-top-card.css（driftlint-ignore：同上）
import './styles/dev.css'              // 4. 开发者侧 —— 实际文件 src/styles/dev.css（driftlint-ignore：同上）
```

`home.css`（首页专用）与 `toast.css` 是按需注入的，分别在 `HomeView.vue`、`AppToast.vue` 挂载时才加载。

**页面内不要再套一层滚动容器**——滚动发生在外壳的 `TScrollbar` 上，页内再套一层会让 `sticky` 失效。

## 四、响应式只允许四个断点

| 断点 | 用途 |
| --- | --- |
| `980px` | 门户与开发者主布局由多栏转单栏 |
| `900px` | 导航转移动端形态、侧栏折叠 |
| `780px` | 次级多栏结构收窄 |
| `640px` | 触屏档：按钮撑满、字号下调、弹窗全屏化 |

现有样式里有 **116 处媒体查询、23 个不同断点值**，那是**存量债，不是新代码的许可**。不要因为「别人也这么写」再加新断点；
动老页面时顺手把它并到最近的约定断点上。开发者侧的窄屏覆盖统一放 `src/styles/dev-responsive.css`，**那里只放媒体查询**。

## 五、移动端硬要求

- **触摸目标不小于 `44px`**：低于 `640px` 时按钮、列表项、菜单项要显式写 `min-height: 44px`。
- **安全区**：贴底或贴边的固定元素用 `env(safe-area-inset-*)`。
- **交付前必须在 `320 / 375 / 414px` 三个宽度实测无横向滚动。**
- 优先复用现成的移动端组件 `src/components/PortalMobileDock.vue`、`src/components/MobileResourceList.vue`，不要重写一套。

## 六、富文本必须净化

富文本渲染**必须经 `src/utils/sanitizeHtml.ts`（DOMPurify 封装）**，URL 走白名单校验，**不要绕过**。
前端净化只是第一道，后端还有一道 ammonia——两端都要过，不要因为前端已净化就省掉后端。
