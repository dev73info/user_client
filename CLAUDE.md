# CLAUDE.md（子工程执行版）——user_client

本仓是 73Info 工作区（Windows `E:\dev73info` / WSL `/home/banch/dev73info`）11 个子工程仓库之一，
根目录本身是只放文档与配置的第 12 个仓库。跨工程约定以根仓 `../CLAUDE.md`、`../AGENTS.md`
与 `../docs/开发流程/AI开发标准流程.md` 为准，**冲突以标准文档为准**；本文件只写本仓的差异项。

## 一、开工（在本仓动手之前，包括「只是看看 / 改个文案」）

1. `pwd` 确认在本仓目录；一次只处理一个仓库，不跨仓批量提交。
2. `git fetch origin` → `git status --porcelain` → `git branch --show-current`。
3. 当前分支落在 `dev` / `master` 上先停下：新建分支，不要在稳定线上直接改。
4. 基线落后 `origin/dev` 就先 `git switch dev && git pull --ff-only`。
   **不要从过期的 `dev` 开工**：已 squash 合入的改动会以另一个 SHA 再带一遍，PR 会平白多出别人的文件。
5. 分支从最新 `dev` 切（`hotfix/` 从 `master` 切），命名 `feat/<需求号>-<简称>` / `fix/…` /
   `chore/…` / `docs/…`；跨仓库需求在各仓用**同名**分支，一条分支只做一件事。

## 二、提交

- `git add <具体文件>`，禁止 `git add -A` / `git add .`；提交前 `git diff --cached --check`。
- Conventional Commits 前缀 + 中文简述，跟既有提交风格走；一个提交一件事
  （重构与功能分开、格式化与逻辑分开）。
- 提交信息里**不写任何工具或 agent 署名**（无 `Co-Authored-By` / `Signed-off-by` / `Generated with`）。
- 绝不提交：`.env.local`、`dist/`、`logs/`、`node_modules/`、`*.tsbuildinfo`。
- `components.d.ts` 是自动生成且已被跟踪的文件：不要手工改，也不要把它的 diff 单独夹带进无关提交；
  它随组件变更一起出现时，确认只是生成结果再 `git add`。

## 三、PR

- base 写 `dev`；`hotfix/` 写 `master`。
- 标题 `[需求号] 类型(范围): 中文简述`；正文按 `../docs/开发流程/PR模板.md` 五段填，
  写到仓库外的临时文件再 `--body-file` 传。
- 门禁没跑绿前开 Draft；绿了、描述填全再请求审阅。
- `dev` / `master` 只能经 PR 合入：不直推、不 `--force`，作者不自审自合，无审阅结论不合并。
- 推稳定线、改别人的分支、改 PR 的目标分支之前**先问用户**。

## 四、本仓门禁

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 改到 `src/**` | `pnpm type-check` | `vue-tsc --build`，提交前必跑 |
| 单测 | `pnpm test:unit` | Vitest |
| 完整构建 | `pnpm build` | `generate:sitemap` + `type-check` + `vite build` + SEO 页面生成 |
| 本地启动 | `pnpm dev` | 5173；开发者第二实例 5175 的做法见根仓 `docs/规则/dev-servers.md` |

## 五、本仓事实与红线

- 依赖方向：本仓 → `../ui_73info`（link 依赖，改源码 HMR 立刻生效）、`../tags-wasm`（吃 `pkg/` 产物，
  SDK 侧必须先 `wasm-pack build`）；接口一律走后端 HTTP。
- UI 现状：Element Plus 为主，正在按耦合度分批迁向 `ui_73info`；**写哪端就按哪端的组件库写**，
  不要串 `support_client` 的 Naive UI。
- 界面文案遵守根仓 `docs/规则/ui-copy.md`：错误、状态、必要警示之外的说明性文字不写进页面。
- 账号、口令与自动登录配置只在本机 `.env.local`，永不入库、不进对话。
- **公开仓，`master` 有服务端保护**：要求 PR 且至少 1 个批准、`enforce_admins`（管理员也绕不过）、
  线性历史（只能 squash / rebase）、禁强推、禁删除。你不能批准自己的 PR，直推与强推都会失败。
- 第二实例 5175 的启动方式与「端口 ↔ 身份」绑定见本仓 `doc/规则/toolchain-and-gates.md` 第三节。
- 测试身份只从 `../docs/测试指南/测试数据` 取，不要自己编。

## 六、本仓详细规则

- `doc/规则/api-layer.md`：接口层、路径重写、鉴权与 mock。
- `doc/规则/design-tokens.md`：两套视觉体系、档位、断点与移动端要求。
- `doc/规则/toolchain-and-gates.md`：命令、双实例与质量门禁。
- `doc/规则/ui-73info-components.md`：组件库口径与 link 源码联动。
- `doc/规则/vue-typescript-patterns.md`：Vue / TypeScript 编码规范。

这五份是 2026-10-20 从 `.cursor/rules/` 迁出的正文，按需阅读；与根仓 `AGENTS.md` / 根仓 `docs/规则/` 冲突时，以根仓为准。

## 跨仓需求

涉及多个子工程时，用根仓 `scripts/xrepo.sh` 编排（清单在根仓 `docs/任务/<需求号>-*/xrepo/`，用法见根仓 `skills/xrepo/SKILL.md`）；本仓内仍按上述规则。
