/**
 * 担保模式四流 e2e 的共享配置与测试数据。
 *
 * 三个身份跑在三个 dev server 上，端口与账号见 `.cursor/rules/dev-servers.mdc`：
 * - 5173 需求方：吃 `user-client/.env.local` 里的自动登录账号
 * - 5175 开发者：启动时用进程环境变量覆盖自动登录账号（不能在 5173 上登开发者，
 *   `App.vue` 会把非 `.env.local` 账号强制登出重登）
 * - 5174 运营：admin_client 的 `.env.development` 开了 `VITE_DEV_AUTO_LOGIN_ENABLED`
 *
 * ⚠️ 三个前端的 dev 构建都用 hash 路由（`VITE_ROUTER_MODE` 不设或不是 `history`），
 * 所以页面地址一律要写成 `${origin}/#/业务路径`。直接访问 `/业务路径` 只会落到首页。
 */
export const BACKEND_BASE = process.env.E2E_BACKEND_BASE?.trim() || 'http://127.0.0.1:8080'
export const CLIENT_ORIGIN = process.env.E2E_CLIENT_ORIGIN?.trim() || 'http://localhost:5173'
export const DEVELOPER_ORIGIN = process.env.E2E_DEVELOPER_ORIGIN?.trim() || 'http://localhost:5175'
export const ADMIN_ORIGIN = process.env.E2E_ADMIN_ORIGIN?.trim() || 'http://localhost:5174'

/** 把业务路由拼成 hash 路由的完整地址。 */
export function hashUrl(origin: string, route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return `${origin}/#${normalized}`
}

/**
 * 平台运营（admin_client）在本地是免密的：`/api/auth/admin-auto-login` 会把超管
 * （本机库里是 `admin`）的令牌直接发下来，三个条件必须同时成立——debug 构建、
 * `dev_auto_login = true`、请求来自回环地址。
 */
export const ADMIN_USERNAME_HINT = 'admin'

/** 需求方账号：与 `user-client/.env.local` 一致。 */
export const CLIENT_ACCOUNT = {
  username: 'client_flow_03562487',
  password: 'Test@123456',
}

/** 开发者账号：与全站开发账号统一口令一致，见 `.cursor/rules/dev-accounts.mdc`。 */
export const DEVELOPER_ACCOUNT = {
  username: 'dev_flow_03562487',
  password: 'Test@123456',
}

/**
 * 需求预算：50 元 = 定金 10 元（20%）+ 尾款 40 元。
 * 开发者接单保证金可用余额约 350 元，够冻这一单。
 */
export const BUDGET_CNY = 50

/** 发布需求时填写的正文与验收标准（富文本编辑器里输入的纯文本）。 */
export const REQUIREMENT_DESCRIPTION = 'E2E 自动化用例创建的担保模式需求：实现一个演示用的信息展示页面。'
export const REQUIREMENT_ACCEPTANCE = '页面在 320/375/414 宽度下无横向滚动，接口返回 200，控制台无报错。'

/** 用例整体超时：跨三次外部跳转（爱签签署页）与一次分账扫描，给足余量。 */
export const FLOW_TEST_TIMEOUT_MS = 25 * 60 * 1000

/** 单步等待（元素出现、状态推进）的上限。 */
export const STEP_TIMEOUT_MS = 60 * 1000

/** 单次点击 / 输入的上限，也是接口探针的单次请求上限。 */
export const REQUEST_TIMEOUT_MS = 30 * 1000

/**
 * 分账等待上限：扫描间隔 10s、等待期 0 天，正常几十秒内结单。
 * 给到 3 分钟是因为「这一步超时」的代价是整条用例（十来分钟 + 5 分钟发布冷却）重跑一次，
 * 宁可多等一会儿，也不要卡在边界上误判成失败。
 */
export const SETTLEMENT_TIMEOUT_MS = 3 * 60 * 1000

/** 本机爱签测试环境短信验证码。 */
export const ASIGN_SMS_CODE = process.env.E2E_ASIGN_SMS_CODE?.trim() ?? '111111'

/**
 * 本合同双方在签署环节走哪条路。
 *
 * - `asign`（目标形态，真实电子签）：在爱签签署页上签。**本机目前跑不通全自动**——
 *   已实测：签署页本身可用（不需要爱签实名/MSCA，直接进文档签署页），点「完成签署」
 *   会弹「签署意愿确认」短信框，但该 app_id 下万能码 `111111` 与 `123456` 都被爱签
 *   拒绝（`{"code":0,"msg":"验证码错误，请重新输入"}`），短信发往
 *   `18087039381`，只能由人工读取真实短信码。有头模式下用例会停在签署页等人工输入，
 *   也可以用 `E2E_ASIGN_SMS_CODE` 传入真实验证码。
 * - `local`（默认，可全自动）：双方都走平台自带的在线签署端点
 *   `POST /api/contract/{id}/sign`（手写签名）。落库的合同、签署字段、状态流转与
 *   爱签路径完全一致，差别只在签名页由平台自己渲染，不经爱签。
 *
 * 默认取 `local` 是为了让 `pnpm test:e2e` 能无人值守地跑完四流；要验爱签真实签署时
 * 用 `E2E_SIGN_MODE=asign`。
 */
export const SIGN_MODE: 'asign' | 'local' =
  process.env.E2E_SIGN_MODE === 'asign' ? 'asign' : 'local'

/**
 * `asign` 模式下在签署页等人工输短信码的上限。
 * 设为 0 表示不等人工，直接拿 `ASIGN_SMS_CODE` 试一次，失败即失败。
 */
export const SIGN_HUMAN_WAIT_MS = Number(process.env.E2E_SIGN_HUMAN_WAIT_MS ?? 3 * 60 * 1000)

/** 本地在线签署用的最小合法 PNG（1×1 透明），后端要求 `data:image/png;base64,` 前缀。 */
export const HANDWRITTEN_SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='

/** 每次运行生成一个可辨识的需求标题，便于在列表与库里定位。 */
export function buildRequirementTitle(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(4, 14)
  return `E2E-担保四流-${stamp}`
}
