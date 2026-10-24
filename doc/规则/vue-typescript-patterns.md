# Vue / TypeScript 编码规范（user_client）

`doc/README.md` 与 `doc/设计规范.md` 都把「Vue / TypeScript 编码规范（目录命名、SFC 元素顺序、禁 `any`）」指向本文件
`doc/规则/vue-typescript-patterns.md`。本文按现有代码的实际口径整理。**它与 `doc/` 下的三份文档并列，
不是它们的替代**：目录职责与路由见 `doc/架构.md`，视觉口径见 `doc/设计规范.md`，命令与代理见 `doc/开发指南.md`。

## 一、目录与命名

| 位置 | 约定 | 例子 |
| --- | --- | --- |
| `src/views/` | 页面组件，PascalCase 且以 `View` 结尾 | `PointsCenterView.vue`、`DevWalletView.vue` |
| `src/components/` | 可复用组件，PascalCase，**不带** `View` 后缀 | `InvitePanel.vue`、`PublishModal.vue` |
| `src/components/<域>/` | 只服务单一页面的子组件可以收进子目录 | `src/components/home/HomeHeroSection.vue` |
| `src/composables/` | `useXxx.ts`，导出同名函数 | `useToast.ts` → `useToast()` |<!-- driftlint-ignore -->
| `src/stores/` | 文件名 camelCase，内部 `defineStore('名字', ...)` | `tagTree.ts`、`teamStore.ts` |
| `src/api/` | **一个业务域一个文件**，camelCase；导出动词开头的函数 | `afterSales.ts` → `listAfterSales()` |
| `src/shared/` | 跨页面纯逻辑，按业务域命名，不做副作用 | `requirementStatus.ts`、`invoiceAction.ts` |
| `src/utils/` | 无业务状态的纯函数与安全工具 | `sanitizeHtml.ts`、`seo.ts` |

- **页面组件只在 `src/views/`，可复用件只在 `src/components/`**，不要互相放。
- 需要给页面算派生数据、做展示映射时，优先放 `src/shared/<域>.ts` 写成纯函数并**加单测**（`src/__tests__/` 里有大量先例），
  不要塞进组件里当局部函数——同一份口径往往有两个工作台要用。

## 二、导入顺序与路径别名

站内引用**一律走 `@/` 别名**，不写 `../` 相对路径。分组顺序与空行分隔照现有文件：

```ts
import { computed, onMounted, ref } from 'vue'          // ① 框架
import { useRouter } from 'vue-router'
import { defineStore } from 'pinia'                     // ② 状态
import { getMyPoints } from '@/api/points'               // ③ 站内（@/）
import { useToast } from '@/composables/useToast'

import { TButton, TIcon, Search } from 'ui_73info'       // ④ 组件库（空行隔开）
```

`ui_73info` 必须**具名按需导入**，不要 `app.use(Ui73info)` 全局注册——显式导入让「这一页用了哪些组件」在文件顶部一眼可见。
图标同样从 `ui_73info` 引，理由与清单见 `doc/规则/ui-73info-components.md`。

## 三、SFC 结构与元素顺序

块顺序固定为 **`<script setup lang="ts">` → `<template>` → `<style scoped>`**，三段之间空一行：

```vue
<script setup lang="ts">
// 1. import
// 2. 常量与类型
// 3. 组件内状态（ref / computed）
// 4. 生命周期与事件处理
</script>

<template>
  <!-- 页面结构 -->
</template>

<style scoped>
/* 只写这一页独有的样式 */
</style>
```

- 样式**默认写 `scoped`，用原生 CSS，不加 `lang="scss"`**（全站没有 sass 依赖）。
- 需要 `<style>`（非 scoped）时必须写明理由，现有先例只有 `App.vue`、`MobileResourceList.vue`、`DevProfileView.vue` 少数几处。
- 大部分页面样式落在 `src/styles/*.css` 的全局样式表里，**`<style scoped>` 只装页面独有的部分**；令牌与档位见 `doc/规则/design-tokens.md`。

## 四、类型纪律

- **不要写 `any`。** 全仓只有 `RichTextEditor.vue` 里两处 `as any`（tiptap 的内部构造器，绕不过去）。新增 `any` 之前先想清楚，
  实在绕不过就**在同一行写明为什么**，照那两处的做法。
- `tsconfig.app.json` 开了 `noUncheckedIndexedAccess`，所以 `arr[0]`、`record[key]` 的结果是 `T | undefined`：
  用 `??` 兜底或先判空，**不要用 `!` 硬断言压掉**。
- 后端字段名是 **snake_case**，`src/api/` 里的类型**原样照抄后端字段名**（`page_size`、`created_at`、`requires_two_factor`），
  不要在前端改成 camelCase——改了就要在映射层多做一次翻译，且和接口文档对不上。
- 类型用 `type` 声明（全仓一致），联合字面量优先于 `enum`。
- 给 API 响应、事件载荷、组件 props 都写显式类型；函数返回值能推断就不重复标注。

## 五、状态与逻辑的落点

按「谁需要它」决定写在哪，不要一律塞进组件：

| 需求 | 放哪 |
| --- | --- |
| 跨页面共享、需要持久化或异步请求的登录态 / 字典 | Pinia store（`defineStore` 用 **setup 写法**，不用 options 写法） |
| 页面内的临时状态、表单草稿 | 组件内 `ref` |
| 两个以上页面要用的纯计算（状态文案、金额换算、动作可用性） | `src/shared/<域>.ts` 纯函数 + 单测 |
| 有生命周期的行为（分页、上传、SSE、草稿） | `src/composables/useXxx.ts` |<!-- driftlint-ignore -->

`src/composables/useToast.ts` 的状态是**模块级单例**（`toastVisible` 等定义在函数外），所以在哪个组件里调 `useToast()` 拿到的都是同一个提示条。

## 六、用户提示与文案

- **用户反馈以 `useToast().showToast(消息, 'success' | 'error' | 'info' | 'warning')` 为主**——全站约 55 个页面在用，
  是新代码的默认选择。`TMessage` / `TMessageBox` 只在已经在用它的页面里沿用（如 `MallView.vue`），不要在同一个页面里混两套。
- 弹窗确认用 `TDialog`；`TMessageBox` 只有 `confirm` / `alert`，**没有带输入框的 `prompt`**，
  需要输入时自己在 `TDialog` 里搭（先例见 `RichTextEditor.vue`）。
- 文案一律中文，与既有措辞风格一致；**注释也一律中文**。

## 七、格式化口径

以 `.prettierrc.json` 与 `.editorconfig` 为准，手写代码直接按这个风格写，不要等 `pnpm format` 兜底：

- 行尾不加分号，字符串用单引号，打印宽度 100，缩进 2 空格，LF 换行，文件末尾留一个换行。
- 校验入口见 `doc/规则/toolchain-and-gates.md`。
