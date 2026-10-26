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
