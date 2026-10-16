---
name: verify
description: 跑 user-client 的质量门禁（type-check + 单测 + lint）并报告失败位置
---

按 `.cursor/rules/toolchain-and-gates.mdc` 的第六节跑质量门禁，然后把结果汇总给用户。

步骤：

1. 先用 Shell 看当前改动范围：`git -C /home/banch/yl73info/user-client status --porcelain` 与 `git -C /home/banch/yl73info/user-client diff --name-only`。
   据此判断该跑哪几项——**改到 `src/**` 就必须跑 `pnpm type-check`**；改到 `src/shared/` 的纯逻辑、状态文案、金额换算时加跑 `pnpm test:unit`。
2. 把范围交给 **frontend-verifier** 子 agent 执行（用 Task 工具，subagent_type 为 `generalPurpose` 时请在提示里写明按
   `.cursor/agents/frontend-verifier.md` 的规程办）。本机默认 shell 就是 WSL 的 bash，直接跑 `pnpm type-check` 即可，不需要再包一层。
3. 拿到报告后，用中文给用户一段能独立看懂的结论：**跑了哪几项、过没过**；失败的给出 `文件:行号` 与具体改法。
   如果 `pnpm lint` 的 `--fix` 改了文件，逐条列出被改动的文件让用户复核。

如果用户在这次命令后附带了文字（例如某个模块名），把它当作限定范围：只跑与该范围相关的用例或只校验相关文件。
