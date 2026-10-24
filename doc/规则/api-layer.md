# 接口层与鉴权口径（user_client）

## 一、前端路径 ≠ 后端路径

页面与 `src/api/` 里写的是「前端路径」，真正发出去之前由 `src/shared/api/url.ts` 的 `normalizeBackendPath()` 改写成后端真实路径。
**排查 404、对着接口文档核对时，一律以后端真实路径为准。**

| 前端路径 | 后端真实路径 |
| --- | --- |
| `/requirements` | `/requirement` |
| `/public/requirements` | `/requirements` |
| `/dev/requirements` | `/requirement` |
| `/dev/requirements/mine` | `/requirement/dev/mine` |
| `/payments`、`/dev/payments` | `/payment` |
| `/contracts`、`/dev/contracts` | `/contract` |
| `/coupons` | `/coupon` |
| `/dev/resources` | `/resources` |
| `/dev/credit` | `/credit/credit` |
| `/team/teams` | `/teams` |
| `/team/invitations` | `/teams/invitations` |
| `/settings` | `/system/settings` |
| `/resources/tags` | `/tag/tags` |

`normalizeBackendPath()` 的完整行为：补前导 `/` → 命中 `/uploads` 前缀**直接返回**（静态资源不重写）→ 否则剥掉已有的 `/api` 前缀 → 查别名表替换 → 补回 `/api`。
`apiUrl()` 对已经是 `http(s)://` 的地址原样返回；`apiBaseForPath()` 有个特例：`/uploads` 且 `VITE_API_BASE_URL` 以 `/api` 结尾时，要先把 `/api` 去掉再拼。

**新增一条路径别名时，改 `src/shared/api/url.ts` 的 `backendPathAliases`，不要在各处硬写后端路径。**

## 二、dev 代理前缀是「后端真实路径」

`vite.config.ts` 里硬编码了目标 `http://127.0.0.1:8080` 和一组代理前缀（全部带 `changeOrigin` 与 `ws`）：

```
/api  /auth  /coupons  /public/requirements  /realname  /requirements
/tickets  /payments  /settings  /resources/resources  /resources/tags  /uploads
```

**这些是后端真实路径的前缀，不是第一节的前端路径**——两套前缀同时存在是这个项目最容易绕晕的地方。
要新增代理前缀时，先确认它属于哪一套：写进 `vite.config.ts` 的应该是**后端真实路径**。

## 三、请求一律走 `src/api/`

**不要在页面里直接 `fetch`。** 一个业务域一个文件，内部从 `@/api/http` 取 `requestJson` / `requestText` / `requestVoid` / `authHeaders` / `HttpError`：

```ts
import { authHeaders, requestJson } from '@/api/http'

export type UserPointsLog = { id: number; created_at: string; /* 字段名照抄后端 snake_case */ }

export async function getMyPoints(token: string): Promise<UserPointsSelf> {
  return requestJson<UserPointsSelf>('/points/me', { headers: authHeaders(token) }, '获取积分失败')
}
```

- 第三个参数是**兜底错误文案**（中文），一定要写：接口不返回内容、返回 HTML 页面、返回无效 JSON 时用的就是它。
- 需要带令牌的请求用 `authHeaders(token, headers?)`，它会合并出 `Authorization: Bearer <token>`；空令牌不会带上这个头。
- 需要取消、SSE 时用 `src/shared/api/sse.ts` 与 `AbortSignal`，不要另起一套 fetch 封装。
- 客户端内部固定 `credentials: 'omit'`，**鉴权只靠 Bearer 令牌，不依赖 cookie**。

## 四、鉴权与 401

- 令牌存 localStorage，键是 `AUTH_TOKEN_STORAGE_KEY`（`src/shared/auth/storage.ts`，值 `auth_token_73hub`）。
  登录态与令牌生命周期在 `src/shared/auth/`（`token` / `session` / `storage` / `client` / `tokenLifecycle`），store 是 `src/stores/auth.ts`。
- 401 由 `src/shared/api/authEvents.ts` 广播，`App.vue` 监听后**自动登出并弹登录框**。
  **这是设计行为**（改密后旧令牌即失效），排查时不要当成 bug。登录 / 注册 / 重置密码三条路径不触发这个广播。
- 开发者相关的路径守卫是 `installDevRouteGuard`（`src/router/dev.ts`）：未登录跳 `buildUnifiedAuthUrl('login', ...)`，
  `meta.requiresRealname` 查实名状态，`meta.requiresDevAccess` 查 `auth.ensureDevAccess()`。
  **新增开发者页面必须带 `meta.devArea: true`**，否则进页时侧边栏会当它是用户页面、切回用户工作台。
- `dev-home` 刻意**不带** `requiresRealname`，这是有意为之，不是漏写。

## 五、mock 要跟着一起补

`src/mock/` 是一套完整的假后端（`?mock=1` 或 `VITE_MOCK=true` 打开，只对 dev 模式生效）。
**新增或修改接口时，顺手确认 `src/mock/` 里有没有对应实现**：没有的接口会返回空数组/空对象并在控制台 `warn` 一次，
口径是「够用但不假装」。补的时候让它返回能撑住页面的最小数据，不要伪造一份看起来像真的业务数据。

## 六、后端语义不在这里

状态机、字段含义、权限判定都在后端。要核对某条业务规则，看 `backend_73info/doc/README.md`，**不要从 `src/api/` 的类型反推业务含义**。
