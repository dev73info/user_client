# CLAUDE.md（子工程执行版）——user_client

本仓是 73Info 工作区（Windows `E:\dev73info` / WSL `/home/banch/dev73info`）11 个子工程仓库之一，
根目录本身是只放文档与配置的第 12 个仓库。跨工程约定以根仓 `../CLAUDE.md`、`../AGENTS.md`
与 `../docs/开发流程/AI开发标准流程.md` 为准，**冲突以标准文档为准**；本文件只写本仓的差异项。

## 〇、Claude 资产与权威顺序

- 本仓的 Claude 资产**都入库、开会话自动加载**：`.claude/rules/`（规则四份）与 `.claude/skills/`（技能两个：
  `gate` 跑门禁、`branch-and-merge` 开分支到合并一条龙）。新增规则放 `.claude/rules/`，
  新增技能放 `.claude/skills/<name>/SKILL.md`；`.claude/` 下只入库这两处。
- 权威顺序：根仓 `AGENTS.md`（事实）+ 根仓 `docs/开发流程/AI开发标准流程.md`（流程）> 本文件 >
  `.claude/rules/` > `doc/规则/`（详细正文）。冲突时以更具体、更新的一方为准。
- 跨仓约定的**正本在根仓 `.claude/rules/`**；本仓 `.claude/rules/` 是执行版副本，改跨仓规则时根仓与 6 个前端仓一起改。

## 一、开工（在本仓动手之前，包括「只是看看 / 改个文案」）

> **CodeGraph 硬规则**：每次修改代码前先用 codegraph 定位符号与影响面
> （`codegraph_context` / `codegraph_search` → `codegraph_callers` / `codegraph_impact`），
> 详见 `.claude/rules/codegraph.md`。不要跳过索引直接 grep。

1. **先读** `.claude/rules/dev-workflow.md` 与 `.claude/rules/code-quality.md`；改界面文案还要看 `ui-copy.md`。
2. `pwd` 确认在本仓目录；一次只处理一个仓库，不跨仓批量提交。
3. `git fetch origin` → `git status --porcelain` → `git branch --show-current`。
4. 当前分支落在 `develop` / `master` 上先停下：**新建分支**，不要在集成分支上直接改。
5. 基线不是最新 `origin/develop` 就先 `git switch develop && git pull --ff-only`。
   **不要从过期基线开工**：已 squash 合入的改动会以另一个 SHA 再带一遍，PR 会平白多出别人的文件。
6. 分支从最新 `develop` 切（`hotfix/` 从 `master` 切），命名 `feat/<需求号>-<简称>` / `fix/…` /
   `chore/…` / `docs/…`；跨仓库需求在各仓用**同名**分支，一条分支只做一件事。
7. 做完的走向固定：分支 → 门禁绿 → PR(**base=`develop`**) → squash 合并；
   **日常 PR 不要求独立审阅**，独立审阅只在打 tag 发版前做（命令与检查单见
   `.claude/skills/branch-and-merge/SKILL.md`）。执行代理永远不给自己写 `PASS`。

## 二、提交

- `git add <具体文件>`，禁止 `git add -A` / `git add .`；提交前 `git diff --cached --check`。
- Conventional Commits 前缀 + 中文简述，跟既有提交风格走；一个提交一件事
  （重构与功能分开、格式化与逻辑分开）。
- 提交信息里**不写任何工具或 agent 署名**（无 `Co-Authored-By` / `Signed-off-by` / `Generated with`）。
- 绝不提交：`.env.local`、`dist/`、`logs/`、`node_modules/`、`*.tsbuildinfo`。
- `components.d.ts` 是自动生成且已被跟踪的文件：不要手工改，也不要把它的 diff 单独夹带进无关提交；
  它随组件变更一起出现时，确认只是生成结果再 `git add`。

## 三、PR

- base 写 `develop`；`hotfix/` 写 `master`。
- 标题 `[需求号] 类型(范围): 中文简述`；正文按 `../docs/开发流程/PR模板.md` 五段填，
  写到仓库外的临时文件再 `--body-file` 传。
- 门禁没跑绿前开 Draft；绿了、描述填全即可合并（日常 PR 不要求独立审阅，审阅在打 tag 前做）。
- `develop` / `master` 只能经 PR 合入：不直推、不 `--force`。合并看门禁，**审阅看发版**：
  日常 PR 门禁绿即可合；打 tag 前必须有一轮独立审阅并给出 `PASS`。
- 推稳定线、改别人的分支、改 PR 的目标分支之前**先问用户**。

## 四、本仓门禁

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 改一版就验（提交前） | `pnpm gate:quick` | type-check + lint:check + test:ci + 结构检查 + 契约检查 |
| 开 PR / 合并前 | `pnpm gate` | `gate:quick` + `build`（含 SEO 页面生成） |
| 只查类型 | `pnpm type-check` | `vue-tsc --build` |
| 结构检查 | `pnpm check:frontend` | 行数 / API 依赖 / 裸色值 / 断点，存量在 `frontend-baseline.json` |
| 单测 | `pnpm test:unit` | Vitest |
| 完整构建 | `pnpm build` | `generate:sitemap` + `type-check` + `vite build` + SEO 页面生成 |
| 本地启动 | `pnpm dev` | 5173；开发者第二实例 5175 的做法见根仓 `.claude/rules/dev-servers.md` |

## 五、本仓事实与红线

- 依赖方向：本仓 → `../ui_73info`（link 依赖，改源码 HMR 立刻生效）、`../tags-wasm`（吃 `pkg/` 产物，
  SDK 侧必须先 `wasm-pack build`）；接口一律走后端 HTTP。
- UI 现状：Element Plus 为主，正在按耦合度分批迁向 `ui_73info`；**写哪端就按哪端的组件库写**，
  不要串 `support_client` 的 Naive UI。
- 界面文案遵守根仓 `.claude/rules/ui-copy.md`：错误、状态、必要警示之外的说明性文字不写进页面。
- 账号、口令与自动登录配置只在本机 `.env.local`，永不入库、不进对话。
- **公开仓，`master` 有服务端保护**：要求 PR 且至少 1 个批准、`enforce_admins`（管理员也绕不过）、
  线性历史（只能 squash / rebase）、禁强推、禁删除。你不能批准自己的 PR，直推与强推都会失败。
- 第二实例 5175 的启动方式与「端口 ↔ 身份」绑定见本仓 `doc/规则/toolchain-and-gates.md` 第三节。
- 测试身份只从 `../docs/测试指南/测试数据` 取，不要自己编。
- **后端没起就直接开 mock，不要回头问用户**：探测与起停口径见 `doc/规则/toolchain-and-gates.md` 第三节，
  mock 变量、生效标志与关闭方式见该文第五节。

## 六、本仓详细规则

- `doc/规则/api-layer.md`：接口层、路径重写、鉴权与 mock。
- `doc/规则/design-tokens.md`：两套视觉体系、档位、断点与移动端要求。
- `doc/规则/toolchain-and-gates.md`：命令、双实例与质量门禁。
- `doc/规则/ui-73info-components.md`：组件库口径与 link 源码联动。
- `doc/规则/vue-typescript-patterns.md`：Vue / TypeScript 编码规范。

这五份是 2026-10-20 从 `.cursor/rules/` 迁出的正文，按需阅读；与根仓 `AGENTS.md` / 根仓 `.claude/rules/` 冲突时，以根仓为准。

## 跨仓需求

根仓 `scripts/`（含 `xrepo`）已于 2026-10-22 删除，**没有跨仓编排脚本可用了**。
涉及多个子工程时手工按仓操作：各仓从 `develop` 建**同名分支** → 各自门禁绿 → 各自开 PR(base=`develop`) →
正文里互相贴链接；合并顺序按依赖来（先后端、再消费方前端）。根仓文档改动只 commit（根仓无远程、永不 push）。
