/**
 * mock 的内存数据集（入口）。
 *
 * 三条约定，写 handler 时照着用：
 *
 * 1. **一份数据、两侧视角**。需求单、合同、支付单、资源都只有一份，
 *    客户侧（`/requirement/mine`）与开发者侧（`/dev/requirements/mine`、需求大厅）
 *    只是同一批数据的不同过滤方式，所以两侧看到的状态永远对得上。
 * 2. **用户名取自身份档案**，不写字面量。`.env.local` 里的自动登录账号可能与本机默认值不同，
 *    数据里的 creator / developer 跟着身份档案走，「我的需求」才不会过滤成空列表。
 * 3. **状态自洽**。需求的 `status` 决定合同签到哪一步、定金尾款各付了多少，
 *    见 `REQUIREMENT_SEEDS` 里的注释；状态与金额对不上会让页面同时显示互相矛盾的文案。
 *
 * 数据只在内存里，刷新页面即回到初始状态（不做持久化，避免脏数据在各个页面之间累积）。
 *
 * 数据按业务域分在 `db/` 下（身份名与时间口径 / 需求种子 / 需求单 / 合同 / 支付单 /
 * 资源与版本 / 开发者钱包与保证金 / 通用账户 / 变更操作），本文件只做汇总再导出，
 * 对外导出名与拆分前一致。变更操作与其他模块共用同一份数组引用，内存状态仍然只有一份。
 */

export { communityPosts, coupons, points } from './db/accounts'
export { contractOfRequirement, contracts } from './db/contracts'
export {
  devDailyIncome,
  devOrderDeposit,
  devWallet,
  devWithdrawalLimits,
  devWithdrawalSetting,
  devWithdrawals,
} from './db/devWallet'
export {
  bindRequirementRecord,
  createRequirementRecord,
  createResourceRecord,
  createVersionRecord,
  markPaymentPaid,
  withdrawRecords,
} from './db/mutations'
export type { MockPayment } from './db/payments'
export { paymentOf, payments, settledIncome } from './db/payments'
export {
  PLATFORM_DEPOSIT_PERCENT,
  depositAmountOf,
  finalAmountOf,
  findRequirement,
  requirements,
  seedOfRequirement,
} from './db/requirements'
export { mcResourceVersions, mcResources, versionsOf } from './db/resources'
export {
  CLIENT_NICKNAME,
  CLIENT_USERNAME,
  DEV_NICKNAME,
  DEV_USERNAME,
  datetime,
  iso,
} from './db/shared'
