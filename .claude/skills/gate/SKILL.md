---
name: gate
description: 在本仓跑质量门禁（类型 / lint / 单测 / 结构检查 / 契约 / 构建）并按失败类别处置。改到 src/** 之后、git commit 之前、开 PR 之前使用；门禁红了但不确定是哪一类问题时也用它。
---

# 跑门禁（user-client）

## 一、两条命令

| 时机 | 命令 | 包含什么 |
| --- | --- | --- |
| 改一版就验一次（提交前） | `pnpm gate:quick` | type-check + lint:check + test:ci + check:frontend + contract:check |
| 开 PR / 合并前 | `pnpm gate` | 同 quick，再加 `build`（含 type-check 与 SEO 页面生成） |

只改文档、注释、`.claude/` 资产时不必跑全套，但**提交前至少跑一次 `pnpm gate:quick`** 确认没有顺手带坏代码。

## 二、逐项命令与判据

| 项 | 命令 | 判据 / 失败怎么办 |
| --- | --- | --- |
| 类型 | `pnpm type-check` | `vue-tsc --build`；本仓开了 `noUncheckedIndexedAccess`，下标/数组取值要判空 |
| Lint | `pnpm lint:check` | `eslint . --max-warnings=0`；存量抑制在 `eslint-suppressions.json`（6 文件 / 11 处），只减不增 |
| 单测 | `pnpm test:ci` | `vitest run`；改到已被覆盖的行为要同步改测试 |
| 结构检查 | `pnpm check:frontend` | 行数预算 / API 依赖 / 裸色值 / 断点；存量在 `frontend-baseline.json`，只减不增 |
| 契约 | `pnpm contract:check` | **目前恒打印「未就绪」并放行 —— 这不是通过** |
| 构建 | `pnpm build` | `vue-tsc` + `vite build` + SEO 页面生成；`admin_client` 的 build 才不含类型检查，本仓含 |

## 三、按失败类别处置

1. **类型错**（`TS2xxx`）：不要用 `any` / `@ts-expect-error` 糊过去；先判断是类型声明错、还是真的取值可能为空
   （本仓开了 `noUncheckedIndexedAccess`，取数组/下标要显式判空）。
2. **lint 错**：修代码，**不要手写 `eslint-disable`**；既有存量走 `eslint-suppressions.json`（只减不增）。
3. **结构检查错**：说明本次新增了结构债——拆文件或改用令牌，**不要**把新条目写进基线
   （基线是迁移台账，只登记改造前就存在的条目）。
4. **契约漂移**：说明后端 spec 变了。重跑 `pnpm contract:write` 生成物后再看 diff 是否符合预期；
   如果后端还没产出 spec，门禁打印的是「未就绪」并放行——**那不是通过**，在 PR 里写明。
5. **单测失败**：先确认是本次改动引起的还是环境问题（`git stash` 后重跑一次对照）。
   不要为了变绿删断言或改成 `skip`；确实要跳过的，在 PR 里写明原因与恢复计划。

## 四、留证据

跑完把**真实输出**（末尾几行统计 + 失败项全文）贴进 PR 正文的「验证证据」一节。
不要写「门禁应该能过」「本地跑过没问题」这类没有输出的结论。

## 五、本仓特别提醒

- 双实例：5173（需求方）+ 5175（开发者），端口 ↔ 身份硬绑定，**5175 只能用开发者账号**。
  做法见根仓 `.claude/rules/dev-servers.md`。
- `components.d.ts` 是自动生成且**已被跟踪**的文件：不要手工改，也不要单独夹带进无关提交。
- 改到 `tags-wasm` 或 `ui_73info` 的宿主侧联动时，先在兄弟仓跑一次类型检查再开 PR。
