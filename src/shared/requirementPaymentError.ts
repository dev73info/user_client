import { REQUIREMENT_CONTRACT_NOT_SIGNED } from '@/shared/api/errorCodes'
import { HttpError } from '@/shared/api/httpError'

/**
 * 1.x 纯文本错误体里的「合同未签」文案兜底。
 *
 * **当前后端不会再命中**：2.0 的错误体统一是 `{ code, message }`，判定走
 * `isRequirementContractNotSigned` 里的错误码。保留它只是因为 `requirementPaymentError.spec.ts`
 * 还断言着这三句；要删的话请连同那三条用例一起删（别只删实现，那会让用例红）。
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
 */
export function isRequirementContractNotSigned(error: unknown): boolean {
  if (error instanceof HttpError && error.code === REQUIREMENT_CONTRACT_NOT_SIGNED) {
    return true
  }
  const message = error instanceof Error ? error.message : ''
  return isLegacyContractNotSignedMessage(message)
}
