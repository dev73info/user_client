# 工具链与质量门禁（user_client）

本文只管**这个前端仓库自己的命令**。跨工程的端口表、后端重启、提交粒度、临时文件与收工清理，见根仓
`docs/规则/` 下的 `dev-servers.md`、`sync-and-commit.md`、`temp-tools.md`——不要在这里重抄一遍。

## 一、所有 `pnpm` 脚本在 POSIX shell 里跑

`package.json` 里的 `dev` / `build` / `build-only` / `type-check` / `generate:sitemap` 都是普通的 `vite` /
`vue-tsc --build` 之类的命令。**WSL bash 与 Windows Git Bash 都能直接跑**，`cd` 进仓库即可，不需要再包一层（下面以 WSL 路径为例）：

```bash
cd /home/banch/dev73info/user_client && pnpm type-check
```

- 工作区根在 Windows `E:\dev73info` / WSL `/home/banch/dev73info`；旧副本 `E:\yl73info` 已废弃，不要再把路径写回去。
- `pnpm lint`、`pnpm format`、`pnpm test:unit` 同样在这个 bash 里直接跑。
- **当前 shell 是 PowerShell 7 时不能照抄上面这条**：PowerShell 的 PATH 上没有 Git 的 `usr\bin`，裸写 `bash` 会解析到
  `C:\Windows\System32\bash.exe`（WSL 的 bash，里面没有 node，跑 `pnpm` 报 `exec: node: not found`）。要显式写
  `& 'C:\Program Files\Git\bin\bash.exe' -lc '...'`，见第三节「情形二」。

## 二、命令表

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 起 dev server（默认 5173，被占用会自动递增） |
| `pnpm type-check` | `vue-tsc --build`，**改 `src/**` 后的硬门禁** |
| `pnpm test:unit` | vitest，用例在 `src/__tests__/` |
| `pnpm lint` | `lint:oxlint` + `lint:eslint`，两者都带 `--fix` |
| `pnpm format` | prettier 写 `src/` |
| `pnpm build` | 生产构建，串起 `generate:sitemap` → `type-check` → `build-only` |
| `pnpm preview` | 预览构建产物 |

Node 版本有下限（`engines` 要求 `^20.19.0 || >=22.12.0`），包管理用 pnpm。

## 三、起 dev server

先看自己在哪种 shell 里（`pwd`）：WSL 是 bash，Windows 侧可能是 PowerShell 7，也可能是 Git Bash。5175 那一行在 POSIX 与 PowerShell 里写法不同，下面分两种情形写。

**情形一：WSL bash / Windows Git Bash（都是 POSIX，前缀赋值有效）**

```bash
# 需求方：5173，吃 .env.local 里的自动登录
pnpm dev

# 开发者：5175，用进程环境变量覆盖自动登录账号
VITE_DEV_AUTO_LOGIN_USERNAME=dev_flow_03562487 VITE_DEV_AUTO_LOGIN_PASSWORD=Test@123456 pnpm dev --port 5175
```

**情形二：Windows PowerShell 7（显式调 Git for Windows 的 `bash.exe`）**

PowerShell 的 PATH 上没有 Git 的 `usr\bin`，裸写 `bash -lc "..."` 会解析到 `C:\Windows\System32\bash.exe`——那是 WSL 的
bash，进去跑 `pnpm` 报 `/mnt/c/nodejs/pnpm: 15: exec: node: not found`（WSL 里没有这个 node）。PowerShell 也不支持
`VAR=val cmd` 的前缀赋值（5.1 明确不支持，7 也不行；`$env:X = '...'` 只能当独立语句写，不能贴在命令前面）。所以显式给
Git Bash 完整路径，赋值写在 `-lc` 的字符串里：

```powershell
# 需求方：5173，吃 .env.local 里的自动登录
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /e/dev73info/user_client && pnpm dev'

# 开发者：5175，用进程环境变量覆盖自动登录账号
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /e/dev73info/user_client && VITE_DEV_AUTO_LOGIN_USERNAME=dev_flow_03562487 VITE_DEV_AUTO_LOGIN_PASSWORD=Test@123456 pnpm dev --port 5175'
```

实测（2026-10-20，PowerShell 7）：这样起出来的 vite argv 是 `vite "--port" "5175"`，端口不会靠自增去凑。

- 端口用 **`--port` 直接传**，**不要写成 `pnpm dev -- --port 5175`**：pnpm 会把那个 `--` 原样转给 vite（实测命令行变成
  `vite "--" "--port" "5175"`），端口靠自增才凑对，不可靠。两种 shell 都照此；PowerShell 里要把 `--port 5175` 一起写进
  `-lc` 的字符串，别留在 PowerShell 那一层。
- **端口 ↔ 身份是硬绑定，不许串**：5173 = 需求方（`client_flow_03562487`）；**5175 = 开发者端，登录必须用开发者账号**（`dev_flow_03562487`，口令 `Test@123456`）。在 5175 上手动登录、自动登录、浏览器走查、mock 切身份，都不得改用需求方账号。
- 5173 与 5175 是**不同 origin**，localStorage 各存各的令牌，所以同一个浏览器里两个身份可以同时在线、互不顶号，不需要无痕窗口。
- **服务一律留在当前会话的终端里前台运行**，不要用 `nohup` / `&`（bash 的后台符，别和上面 PowerShell 的调用运算符 `&` 混了）/ `disown` /
  `setsid` / `screen` / `tmux` 之类撒手跑——脱离会话的进程看不到日志、停不掉，会话结束还占着端口。做法与理由见根仓 `docs/规则/dev-servers.md` 第一节。
- 账号与口令见根仓 `docs/规则/dev-accounts.md`（本机开发库统一口令 `Test@123456`）；`.env.local` **不入库**。

## 四、依赖顺序有个前置

`tags-wasm` 是 `link:../tags-wasm/pkg`，而 `tags-wasm/pkg/` 被忽略、不进仓库。**新克隆的仓库必须先构建 `tags-wasm` 产出 `tags-wasm/pkg/`，再 `pnpm install`**，
否则这个依赖解析不到。另外 `tags-wasm` 通过 `vite-plugin-wasm` 加载，**改完它的 Rust 源码必须重建 `tags-wasm/pkg/`**，否则前端仍跑旧的 WASM。
`ui_73info` 同样是 link 依赖（源码），改它不用重建，宿主 HMR 直接生效——见 `doc/规则/ui-73info-components.md`。

## 五、环境变量与 mock

| 变量 | 用途 |
| --- | --- |
| `VITE_API_BASE_URL` | 接口基地址，留空表示同源（走 dev 代理） |
| `VITE_ROUTER_MODE` | `history` 时用 history 路由，否则 hash（默认 hash） |
| `VITE_DEV_AUTO_LOGIN_USERNAME` / `VITE_DEV_AUTO_LOGIN_PASSWORD` | 本地自动登录 |
| `VITE_DEV_HOME_MOCK` | 开发者工作台总览改用演示数据，只 dev 生效 |
| `VITE_MOCK` / `VITE_MOCK_DELAY` | 整站走假后端 / 假响应延迟 |

**不需要后端也能把客户端点一遍**：地址上加 `?mock=1`，或 `.env.local` 里写 `VITE_MOCK=true`。
确认生效的标志是控制台打印 `[mock] 已启用…` 且左上角出现「MOCK」浮标；两者都没有就硬刷新一次（Ctrl+F5）。
`?mockAs=dev` 切换身份，`?mock=0` 当场关掉。细节见 `doc/开发指南.md` 第七节。

## 六、质量门禁

改动落在 `src/**` 时，**提交前必须过**：

1. `pnpm type-check` —— **这是硬门禁**，不是可选项。`pnpm build` 里也串了它，所以「build 过了」不等于「type-check 单独过了」也无所谓，
   但**别拿 `pnpm build` 当校验入口**：它慢，而且失败信息混在 sitemap 与 SEO 生成里。
2. `pnpm test:unit` —— 改了 `src/shared/` 的纯逻辑、状态文案、金额换算时必跑（`src/__tests__/` 里有对应用例就先跑它）。
3. `pnpm lint` —— 带 `--fix`，会直接改文件，跑完看一眼 diff。

只改样式值、文案、注释这类不动符号结构的改动，可以只跑 `pnpm type-check`。**校验不过就不要提交。**

## 七、不要手改生成物

- `components.d.ts`：`unplugin-vue-components` 生成，**但入库**，改完组件后它出现 diff 属正常，**不要手工编辑**。
- `dist/`、`node_modules/`：产物与缓存，不要提交。
- `auto-imports.d.ts` 已随 `unplugin-auto-import` 删除，不再生成——看到旧文档提到它，是过时信息。
