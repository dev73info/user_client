# user-client 文档

73Info 的用户端与开发者端（Vue 3 · Vite 8 · TypeScript · Pinia · 自研组件库 [`ui_73info`](../../ui_73info/README.md)），一个 SPA 同时承载需求方与开发者两种视角。

## 本目录覆盖什么

- `src/` 的目录职责与分层、路由的两套装配、Pinia 状态、API 层封装
- 前端路径到后端真实路径的重写规则（`src/shared/api/url.ts`）
- 移动端响应式适配、SEO 与 sitemap 静态生成、部署侧的 history fallback
- 门户侧与开发者工作台两套视觉体系的令牌、样式加载顺序、布局骨架、组件视觉口径 → [设计规范.md](设计规范.md)

## 本目录不覆盖什么

- 跨项目约定（仓库布局、端口、各端命令表、发布顺序）→ [AGENTS.md](../../AGENTS.md)
- 后端接口的真实语义、状态机、字段含义 → [backend_73info/doc/README.md](../../backend_73info/doc/README.md)
- Vue / TypeScript 编码规范（目录命名、SFC 元素顺序、禁 `any`）→ [doc/规则/vue-typescript-patterns.md](规则/vue-typescript-patterns.md)（与 [AGENTS.md](../../AGENTS.md) 第 6 节「通用约定」并列）

## 文档清单

| 文件 | 状态 | 覆盖 |
| --- | --- | --- |
| [架构.md](架构.md) | 已写 | `src/` 分层、路由、状态管理、API 层与路径重写 |
| [开发指南.md](开发指南.md) | 已写 | dev/build/lint/test 命令、代理配置、本地自动登录 |
| [设计规范.md](设计规范.md) | 已写 | 配色令牌与并存的两套视觉体系、样式加载顺序、字体排版、布局骨架、组件视觉口径、响应式与移动端要求 |
| `SEO与静态生成.md` | 待补 | `scripts/` 下四个 SEO 脚本的产物与触发时机 |
| `部署.md` | 待补 | OpenResty 配置与 history fallback |

## 待补说明

| 待补文件 | 重建要点 |
| --- | --- |
| `SEO与静态生成.md` | `pnpm build` 会串起 `generate:sitemap` → `type-check` → `build-only`，后者是 `vite build` + `scripts/generate-seo-pages.mjs`；另有 `submit-baidu.mjs`、`submit-indexnow.mjs` 两个提交脚本与 `scripts/lib/seo-utils.mjs`。需要先确认每个脚本的输入输出与线上何时执行 |
| `部署.md` | `deploy/openresty/73info-user-client.conf` 负责 history 路由 fallback。**上传动作不要在这里重写**，指向技能 `deploy-73info` |

> 原登记为待补的 `移动端适配.md` 已并入 [设计规范.md](设计规范.md) 的「响应式与移动端」一节——断点、触摸目标与安全区属于布局口径，分两处写必然漂移。
