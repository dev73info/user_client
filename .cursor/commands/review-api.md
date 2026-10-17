---
name: review-api
description: 审当前接口层改动（前端路径 vs 后端真实路径、代理前缀、401、mock 覆盖面）
---

用 Task 工具调起 **api-layer-auditor** 子 agent，按 `.cursor/agents/api-layer-auditor.md` 的规程审当前改动。

提示里要包含：

- 仓库路径 `/home/banch/dev73info/user-client`。
- 审查范围：默认是当前未提交的改动，重点是 `src/api/**`、`src/shared/api/**`、`src/shared/auth/**`、`src/stores/auth.ts`、`vite.config.ts`；
  如果用户在这次命令后附带了文件路径或模块名，就以那个为准。
- 明确要求它按那份规程的 10 条逐条检查，逐条给出「前端路径 → 后端真实路径」的对照，并输出
  「必须改 / 建议改 / 待确认」三档，每条带 `文件:行号` 与具体改法。

拿到结果后，用中文向用户复述**最关键的几处路径对照与风险**（不要整段转贴），并说明哪些必须改。
如果它报告「未发现问题」，照实说，并列出它实际核对了哪些路径与文件。
