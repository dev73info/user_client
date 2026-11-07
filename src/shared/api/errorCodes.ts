/**
 * 后端业务错误码：前端**真正要分支**的那一部分。
 *
 * 事实源是后端仓 `crates/platform/src/error_codes.rs`（全站错误码字典）——
 * 那边有守门用例保证「新增错误码必须登记」，前端这边只取用其中一部分，
 * 取的是哪几条由本文件说了算，不要在别处再写一遍字面量。
 *
 * 为什么按 `code` 分支、而不是按文案：
 * 后端《接口契约规范》第 6 节要求 `code` 是**稳定的机器码**、`message` 是给人看的文案。
 * 文案会改、错误码不会——按文案分支的逻辑，后端改一次文案就碎一次。
 * 后端 1.x 的错误体是纯文本，没有 `code`；2.0 起统一成 `{ code, message, field? }`。
 */

/** 《需求开发合同》未双方签署，不能发起付款（HTTP 400）。 */
export const REQUIREMENT_CONTRACT_NOT_SIGNED = 'REQUIREMENT_CONTRACT_NOT_SIGNED'
/** 社区发帖要求已完成实名认证（HTTP 403）。 */
export const COMMUNITY_REALNAME_REQUIRED = 'REALNAME_REQUIRED'
/** 社区悬赏冻结或积分推广时余额不足（HTTP 400）。 */
export const COMMUNITY_INSUFFICIENT_POINTS = 'COMMUNITY_INSUFFICIENT_POINTS'
/** 未绑定微信 openid，需先微信登录（邀请 / 活动奖励共用，HTTP 409）。 */
export const WECHAT_NOT_BOUND = 'WECHAT_NOT_BOUND'
/** 邀请现金奖励：邀请人未绑定微信 openid（沿用 `WECHAT_NOT_BOUND`）。 */
export const INVITE_REWARD_WECHAT_NOT_BOUND = WECHAT_NOT_BOUND
/** 邀请现金奖励：没有可领取奖励（HTTP 409）。 */
export const INVITE_REWARD_NONE = 'NO_REWARD_TO_CLAIM'
/** 邀请现金奖励：活动未开启（HTTP 409）。 */
export const INVITE_REWARD_DISABLED = 'REWARD_DISABLED'

/** 活动：不存在（HTTP 404）。 */
export const ACTIVITY_NOT_FOUND = 'ACTIVITY_NOT_FOUND'
/** 活动：当前不可参与（未开始、已结束或未开启，HTTP 409）。 */
export const ACTIVITY_NOT_ACTIVE = 'ACTIVITY_NOT_ACTIVE'
/** 活动：未开放报名（HTTP 409）。 */
export const ACTIVITY_SIGNUP_DISABLED = 'SIGNUP_DISABLED'
/** 活动：已经报名过（HTTP 409）。 */
export const ACTIVITY_ALREADY_JOINED = 'ALREADY_JOINED'
/** 活动：名额已满（HTTP 409）。 */
export const ACTIVITY_QUOTA_FULL = 'QUOTA_FULL'
/** 活动：已达单人参与上限（HTTP 409）。 */
export const ACTIVITY_PER_USER_LIMIT = 'PER_USER_LIMIT'
/** 活动 key：不存在（HTTP 404）。 */
export const ACTIVITY_KEY_INVALID = 'KEY_INVALID'
/** 活动 key：已被使用（HTTP 409）。 */
export const ACTIVITY_KEY_USED = 'KEY_USED'
/** 活动 key：已停用（HTTP 409）。 */
export const ACTIVITY_KEY_DISABLED = 'KEY_DISABLED'
/** 活动 key：已过期（HTTP 409）。 */
export const ACTIVITY_KEY_EXPIRED = 'KEY_EXPIRED'
/** 活动：奖励金额超过单笔转账上限（HTTP 409）。 */
export const ACTIVITY_REWARD_TOO_LARGE = 'REWARD_AMOUNT_TOO_LARGE'
/** 活动要求实名认证但参与人未通过（HTTP 409）。 */
export const ACTIVITY_REALNAME_REQUIRED = 'REALNAME_REQUIRED'
/** 账号已注销 / 黑名单等非 active 状态，不能参与活动（HTTP 403）。 */
export const ACTIVITY_ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE'
