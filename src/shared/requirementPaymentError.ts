import { HttpError } from '@/shared/api/httpClient'
import { REQUIREMENT_CONTRACT_NOT_SIGNED } from '@/shared/api/errorCodes'

/**
 * legacy 1.x 的「合同未签」文案。
 *
 * 1.x 的错误体是纯文本、没有 `code`，所以这几条文案只能靠 `includes` 认。
 * **这是过渡期兜底，不是分支主判据**：主判据是后端 2.0 的业务错误码
 * （`REQUIREMENT_CONTRACT_NOT_SIGNED`）。
 *
 * 什么时候删：前端切到后端 2.0 之后——2.0 的错误体统一成 `{ code, message }`，
 * 这三句英文再也不会出现。届时删掉 `LEGACY_CONTRACT_NOT_SIGNED_TEXTS` 与
 * `isLegacyContractNotSignedMessage`，`isRequirementContractNotSigned` 只留按码判断。
 *
 * 为什么现在还留着：前端今天调的是 1.x 的 `/api/adapay/requirements/{id}/deposit`，
 * 这条路径 2.0 整个域都还没实现（2.0 那边是 `/api/payment/*`，路径与语义都不同）。
 * 现在删掉，线上「付定金时合同还没签」的用户就会从「先签再付」的提示
 * 掉回一句看不懂的英文原文。
 */
const LEGACY_CONTRACT_NOT_SIGNED_TEXTS = [
  'developer must sign first and user must sign after that before paying deposit',
  'requirement contract must be signed by developer before paying deposit',
  'contract must be created before paying deposit',
]

/** 1.x 纯文本错误体里的「合同未签」文案（过渡期兜底，见上面的说明）。 */
export function isLegacyContractNotSignedMessage(message: string): boolean {
  return LEGACY_CONTRACT_NOT_SIGNED_TEXTS.some((text) => message.includes(text))
}

/**
 * 「《需求开发合同》未双方签署，不能发起付款」。
 *
 * 主判据是**业务错误码**——文案会改、错误码不会，所以判码不判文案。
 * 1.x 的纯文本错误体走上面那条兜底。
 */
export function isRequirementContractNotSigned(error: unknown): boolean {
  if (error instanceof HttpError && error.code === REQUIREMENT_CONTRACT_NOT_SIGNED) {
    return true
  }
  const message = error instanceof Error ? error.message : ''
  return isLegacyContractNotSignedMessage(message)
}
