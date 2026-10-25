---
name: branch-and-merge
description: 从 master 开分支、提交、推分支、开 PR（base=master）、跑门禁、合并的完整一条龙；以及打 tag 发版前的独立审阅。开始任何"改进/新增/修复"之前用它；不确定该不该开分支、PR base 写什么、能不能自己合并、发版要不要审阅时也用它。
---

# 开分支 → 门禁 → PR → 合并（审阅在发版前）

本仓（user_client）的基线与稳定线均为 `master`。**改动一律走分支 + PR**。

## 一、开工前 30 秒

```bash
pwd                                                       # 在本仓根
git fetch origin
git status --porcelain && git branch --show-current        # 有别人的脏改动？别动它
git log --oneline -1 origin/master                        # 基线在哪
```

- 当前已经在 `master` 上 → **必须新建分支**，不要在集成分支上直接改。
- 工作区有不是本次的改动 → 不要提交、不要还原，在回复里说明；需要干净基线时开 worktree。

## 二、开分支

```bash
git switch master && git pull --ff-only          # 基线必须是最新 origin/master
git switch -c feat/r0xx-<简称>                     # fix/… chore/… docs/… refactor/…
```

命名：`feat/<需求号>-<简称>`、`fix/<缺陷号>-<简称>`、`chore/…`、`docs/…`、`refactor/…`。
一条分支只做一件事；跨仓需求各仓用**同名**分支。`hotfix/` 从 `master` 切。

## 三、做 + 验

1. 改代码，`git add <具体文件>`（禁止 `git add -A`），`git diff --cached --check` 后提交；
2. 提交信息：Conventional Commits 前缀 + 中文简述，一个提交一件事，**不写任何工具或 agent 署名**；
3. 跑门禁：见技能 `gate`（提交前 `pnpm gate:quick`，开 PR 前 `pnpm gate`）。

## 四、推分支 + 开 PR

```bash
git fetch origin && git rebase origin/master
git push -u origin HEAD
gh pr create --base master --head "$(git branch --show-current)" \
  --title '[需求号] 类型(范围): 中文简述' \
  --body-file "$TMPDIR/pr-body.md" --draft
```

- **base 一律写 `master`**（包括 `hotfix/`）。仓的默认分支是 `master`，
  仍显式写 `--base master`，避免依赖 `gh` 推断；
- 正文按根仓 `docs/开发流程/PR模板.md` 五段填，写到**仓库外**的临时文件再 `--body-file`；
- 门禁绿了再 `gh pr ready <编号>` 并合并；跨仓 PR 互相贴链接。

## 五、合并

1. **日常 PR 不要求独立审阅**：门禁跑绿（`pnpm gate` / `cargo` 门禁）即可 squash 合并。
   合并动作由执行代理自己完成——这是流程默认，不用再问用户；
2. 合并用 squash；合并后删掉远端分支；
3. 合并进 `master` 之后才能说「已完成」；只在分支上、PR 开着都叫「待验收」。

## 五之二、审阅（只在打 tag 发版前）

**独立审阅不再逐 PR 做**，改成发版闸门，省掉每次评审的开销：

1. 准备打 tag 时，对 `master` 上**自上一个 tag 以来**的全部改动做一轮独立审阅
   （另一个会话 / 子代理 / 人，不看执行代理的自述，只看 diff 与真实门禁输出）；
2. 拿到 `PASS` 才打 tag；`FAIL` 就修完再走一轮；
3. 审阅范围：`git diff <上一个 tag>...master`，重点看路径/契约/金额单位/权限/迁移这类
   合进去就难回滚的东西；
4. 执行代理**永远不给自己写 `PASS`**——这条不因为审阅频率降低而放松。

## 六、不能自己决定的三件事

推 `master`、改别人的分支、**改 PR 的目标分支**——先问用户。

## 七、收尾

- 清掉临时脚本与走查截图（`.playwright-mcp/`、散落的 `*.png`）；
- 把证据与结论回写到对应的需求/任务文件里；任务文件在根仓 `docs/任务/` 下（根仓无远程，只 commit）。
