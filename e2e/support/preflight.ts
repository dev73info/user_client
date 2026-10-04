/**
 * 前置探针：缺什么就直接失败，并说清楚怎么补。
 *
 * 用例要同时用到后端（8080）与三个前端 dev server（5173 / 5174 / 5175）。
 * Playwright 不负责拉服务：`pnpm dev` 是 `env -u NODE_USE_ENV_PROXY vite`，要 POSIX shell，
 * 而一条用例要用到三个实例，`webServer` 只认得一个。所以三个实例必须先在 Cursor 终端里跑着，
 * 这里只做检查（`.cursor/rules/dev-servers.mdc`）。
 */
import { expect, type APIRequestContext } from '@playwright/test'

import {
  ADMIN_ORIGIN,
  BUDGET_CNY,
  CLIENT_ACCOUNT,
  CLIENT_ORIGIN,
  DEVELOPER_ACCOUNT,
  DEVELOPER_ORIGIN,
} from './config'
import {
  adminToken,
  clientToken,
  developerToken,
  ensurePublishCooldownClear,
  expectFrontendUp,
  getAdapayMember,
  getDevAccessStatus,
  getDevOrderDeposit,
  getRealnameMe,
  isBindableResource,
  listDevResources,
  type AdapayMemberAccount,
  type DevAccessStatus,
  type DevOrderDeposit,
  type McResource,
} from './api'

/** 探针结论：后续步骤直接复用这里取到的令牌与数据，避免重复登录（写接口限流 15 次/分）。 */
export type Preflight = {
  client: string
  developer: string
  admin: string
  developerDeposit: DevOrderDeposit
  devAccess: DevAccessStatus
  developerMember: AdapayMemberAccount
  /** 可供开发者接单的私有资源项目（`visibility === 'draft'` 且未绑定需求）。 */
  bindableResources: McResource[]
}

export async function runPreflight(request: APIRequestContext): Promise<Preflight> {
  // 1) 三个前端 dev server 必须已经在跑。
  for (const origin of [CLIENT_ORIGIN, ADMIN_ORIGIN, DEVELOPER_ORIGIN]) {
    await expectFrontendUp(request, origin)
  }

  // 2) 令牌：后端在不在，同时也是账号口令是否有效的检查。
  //    管理端自动登录只在「debug 构建 + dev_auto_login + 回环地址」时可用。
  const admin = await adminToken(request)
  const client = await clientToken(request)
  const developer = await developerToken(request)

  // 3) 开发者资格：实名通过、已交保证金、可接单。
  const devAccess = await getDevAccessStatus(request, developer)
  expect(devAccess.is_dev, `开发者账号 ${DEVELOPER_ACCOUNT.username} 没有 dev 角色`).toBeTruthy()
  expect(
    devAccess.realname_approved,
    `开发者账号 ${DEVELOPER_ACCOUNT.username} 实名未通过：先在 admin_client /console/users/realname 复核通过`,
  ).toBeTruthy()

  const developerDeposit = await getDevOrderDeposit(request, developer)
  expect(
    developerDeposit.has_paid_deposit,
    '开发者账号没有已支付的接单保证金：先在开发者工作台缴纳保证金',
  ).toBeTruthy()
  expect(
    developerDeposit.can_bind_requirement,
    '开发者账号当前不可接单（保证金可用额为 0）：先补缴或释放保证金',
  ).toBeTruthy()
  expect(
    developerDeposit.available_cny >= BUDGET_CNY,
    `接单要冻结 ${BUDGET_CNY} 元保证金，当前可用只有 ${developerDeposit.available_cny} 元`,
  ).toBeTruthy()

  // 4) 入驻协议：接单前置（`bind_project` 里 `DeveloperAgreementUnsigned` 的来源）。
  //    本机夹具里这份协议是待签的，用例不改业务数据，只把它当作前置条件报出来，
  //    并在断言消息里给出补齐用的两个端点。签署模式说明见 `guarantee-flow.spec.ts` 顶部。
  expect(
    devAccess.developer_agreement_signed,
    `开发者账号 ${DEVELOPER_ACCOUNT.username} 还没有已签署的《开发者入驻协议》，` +
      '担保模式接单会被拦下。补齐方式：先让该账号完成实名（`real_name` 与 `id_card_no` 都要有值，' +
      '企业主体填经办自然人），再签一次入驻协议；本地可用平台在线签署端点：\n' +
      `  1) GET  /api/contract/developer-agreement\n` +
      `  2) POST /api/contract/{id}/sign（body 里带 data:image/png;base64, 前缀的手写签名）\n` +
      '爱签路径同样需要人工短信码，不适合当自动化前置。',
  ).toBeTruthy()

  // 5) 接单要选一个私有且未绑定的资源项目。
  const bindableResources = (await listDevResources(request, developer)).filter(isBindableResource)
  expect(
    bindableResources.length > 0,
    `开发者账号 ${DEVELOPER_ACCOUNT.username} 名下没有可绑定的资源项目（需要 visibility=draft 且未绑定需求）：`
      + '先在开发者工作台的「资源项目」里新建一个',
  ).toBeTruthy()

  // 6) 担保合同乙方签署前必须有可用的 Adapay 结算账户，否则
  //    `sign_contract_by_user` 会直接返回 AdapayAccountRequired，签署这一步根本走不到。
  const developerMember = await getAdapayMember(request, developer)
  expect(
    developerMember.settlementReady,
    `开发者账号 ${DEVELOPER_ACCOUNT.username} 的 Adapay 结算账户未就绪`
      + `（onboardingStatus=${developerMember.onboardingStatus}，settleAccountId=${developerMember.settleAccountId ?? '空'}）：`
      + '担保模式合同的乙方签署要求结算账户 active 且已绑卡，先在 admin_client /console/users/realname 处理。',
  ).toBeTruthy()

  // 需求方实名：`POST /api/requirement/` 要求需求方实名通过。
  const clientRealname = await getRealnameMe(request, client)
  expect(
    clientRealname.status === 'approved',
    `需求方账号 ${CLIENT_ACCOUNT.username} 实名未通过（当前 ${clientRealname.status}）`,
  ).toBeTruthy()

  // 发布冷却：同一发布人 5 分钟内只能发布 1 条需求。命中就在这里带着「还要等多少秒」失败，
  // 不要等走到发布那一步才被 UI 的一句 toast 拦下（见 `ensurePublishCooldownClear` 的说明）。
  await ensurePublishCooldownClear(request, client)

  return { client, developer, admin, developerDeposit, devAccess, developerMember, bindableResources }
}
