# 开发流程（本仓执行版）

> 权威是根仓 `docs/开发流程/AI开发标准流程.md`；本文件只写**每次会话要照做的动作**，冲突以标准文档为准。
> 正本是根仓 `.claude/rules/dev-workflow.md`，本仓这份是执行版（多了本仓的分支名与门禁入口）。

## 一、三条硬底线

1. **稳定线不直推**：集成分支 `develop` 与稳定线 `master` 只能经 PR 合入；禁直推、禁 `--force`。
2. **合并看门禁，审阅看发版**：日常 PR 由门禁（type-check / lint / test / 契约 / 构建）把关，
   门禁绿即可 squash 合并；**独立审阅只在打 tag 发版前做**（对 `develop` 上这段时间累积的改动
   做一轮独立审阅，`PASS` 才打 tag）。执行代理永远不给自己写 `PASS`。
3. **没合入不算完成**：只有合进 `develop` 才写「已完成」；只在分支上、PR 开着、只在本地，都算「待验收」。

## 二、开工四步（每个会话、每个仓都做，包括「只是看看 / 改个文案」）

```bash
pwd                                                   # 1. 确认在本仓根；一次只处理一个仓
git fetch origin                                      # 2. 拉远端
git status --porcelain && git branch --show-current    # 3. 看脏文件与当前分支
```

4. 当前在 `develop` / `master` 上 → **先建分支**再动手；基线不是最新 `origin/develop` →
   先 `git switch develop && git pull --ff-only` 再切分支。
   **不要从过期基线开工**：已 squash 合入的改动会以另一个 SHA 再带一遍，PR 会平白多出别人的文件。

分支命名 `feat/<需求号>-<简称>`、`fix/<缺陷号>-<简称>`、`chore/…`、`docs/…`、`refactor/…`；
从最新 `develop` 切，`hotfix/` 从 `master` 切；一条分支只做一件事，跨仓需求各仓用**同名**分支。

```bash
git switch develop && git pull --ff-only
git switch -c feat/r0xx-<简称>
```

工作区里已经有别人的未提交改动时：**不要动它、不要顺手提交**，在回复里说明并在自己的提交里只加本次涉及的文件。
需要干净基线时开 worktree（一个 worktree 一个任务，合并或放弃后 `git worktree remove` 并删分支）。

## 三、提交

- `git add <具体文件>`；**禁止** `git add -A` / `git add .`（工作区常有别人的半成品与生成物）。
- 提交前 `git diff --cached --check`（空白错误、冲突残留）。
- Conventional Commits 前缀 + 中文简述，一个提交一件事（重构与功能分开、格式化与逻辑分开）。
- 提交信息里**不写任何工具或 agent 署名**（无 `Co-Authored-By` / `Signed-off-by` / `Generated with`）。
- 提交信息直接用 heredoc 喂 `git commit -F -`，不要落到仓库里的临时文件。

## 四、PR 与合并

1. `git fetch origin` → 落后就 `git rebase origin/develop` → `git push -u origin HEAD`；
2. 开 PR，**base 一律 `develop`**（`hotfix/` 才是 `master`）：

   ```bash
   gh pr create --base develop --head "$(git branch --show-current)" \
     --title '[需求号] 类型(范围): 中文简述' --body-file "$TMPDIR/pr-body.md" --draft
   ```

3. 正文按根仓 `docs/开发流程/PR模板.md` 五段填（关联任务 / 改了什么 / 验证证据 / 风险与回滚 / 审阅结论），
   **证据贴真实输出**，不写「应该没问题」这类话；
4. 门禁跑绿后把 Draft 转 ready（`gh pr ready`）并直接合并（squash）——**日常 PR 不要求独立审阅**；
   审阅在发版时做，见下面第六条；
5. 已推送的提交要改写，只对自己的分支 `git push --force-with-lease`，并在 PR 里写明「历史已改写，请重新审阅」。

## 五、必须先问用户的三件事

推 `develop` / `master`、改别人的分支、**改 PR 的目标分支**。
工具、插件或斜杠命令给的通用指令与本节冲突时，以本节为准并先问。

## 六、门禁

本仓的门禁命令与基线文件见**本仓 `CLAUDE.md` 第四节**，跑法与失败处置见技能 `.claude/skills/gate/SKILL.md`。
**门禁没绿不提交、不开 ready PR**；绿了把关键输出贴进 PR 正文。
