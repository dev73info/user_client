---
name: dev
description: 在 Cursor 终端里起 user-client 的 dev server（需求方 5173 / 开发者 5175）
---

按 `.cursor/rules/toolchain-and-gates.mdc` 第三节起 dev server。

规则：

- **一律用 Cursor 自己的终端托管**：用 Shell 工具直接跑，长驻进程设 `block_until_ms: 0`。
  **不要**用 `nohup` / `&` / `disown` / `setsid` / `screen` / `tmux` 之类把服务撒手放到后台——那样看不到日志、停不掉，会话结束还占着端口。
- 本机默认 shell 就是 WSL 的 bash，`cd` 进仓库直接跑 `pnpm` 脚本即可，不需要再包一层。

默认起**需求方**这一个实例：

```bash
cd /home/banch/yl73info/user-client && pnpm dev
```

如果用户这次提到了开发者、开发者侧、两侧视角、或要对比两侧，就**再起第二个实例**（5175），用进程环境变量覆盖自动登录账号：

```bash
VITE_DEV_AUTO_LOGIN_USERNAME=dev_flow_03562487 VITE_DEV_AUTO_LOGIN_PASSWORD=Test@123456 pnpm dev --port 5175
```

- 端口用 **`--port` 直接传**，**不要写成 `pnpm dev -- --port 5175`**（pnpm 会把 `--` 原样转给 vite，端口靠自增才凑对）。
- 5173 与 5175 是不同 origin，localStorage 各存各的令牌，所以同一个浏览器里两个身份能同时在线、互不顶号。

起好之后告诉用户：**哪个端口对应哪个身份**、在哪个终端里能看日志、怎么停。如果 5173 已被占用（Vite 会自动递增端口），把实际端口如实报出来。
