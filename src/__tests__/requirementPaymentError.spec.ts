import { describe, expect, it } from 'vitest'

import { HttpError } from '@/api/http'
import { REQUIREMENT_CONTRACT_NOT_SIGNED } from '@/shared/api/errorCodes'
import {
  isLegacyContractNotSignedMessage,
  isRequirementContractNotSigned,
} from '@/shared/requirementPaymentError'

/**
 * 「合同未签」按**业务错误码**分支，而不是按文案匹配。
 *
 * 这组用例钉的是三件事：
 * 1. 同一个 `code` 配不同 `message`，判定不变——文案会改、错误码不会；
 * 2. `code` 不是那一个，判定就不成立——不能把别的错误也当成「合同没签」；
 * 3. legacy 1.x 的纯文本错误体还有一条兜底（过渡期，前端切到 2.0 后端就删）。
 */

describe('合同未签的判定', () => {
  it('错误码对上就成立，不管文案写成什么', () => {
    const error = new HttpError(400, '《需求开发合同》未双方签署，不能发起付款', REQUIREMENT_CONTRACT_NOT_SIGNED)

    expect(isRequirementContractNotSigned(error)).toBe(true)
  })

  it('同一条错误码、文案换成别的，判定照样成立', () => {
    const error = new HttpError(400, '合同还没签呢，先签了再付', REQUIREMENT_CONTRACT_NOT_SIGNED)

    expect(isRequirementContractNotSigned(error)).toBe(true)
  })

  it('错误码不是那一个就不成立（哪怕文案看着像）', () => {
    const other = new HttpError(400, '请求参数不合法', 'INVALID_ARGUMENT')

    expect(isRequirementContractNotSigned(other)).toBe(false)
  })

  it('后端没给错误码时（兜底成 HTTP_400）不成立', () => {
    const withoutCode = new HttpError(400, '请求参数不合法')

    expect(isRequirementContractNotSigned(withoutCode)).toBe(false)
  })

  it('不是异常对象时也不成立', () => {
    expect(isRequirementContractNotSigned(null)).toBe(false)
    expect(isRequirementContractNotSigned('合同没签')).toBe(false)
  })
})

describe('legacy 1.x 的纯文本兜底', () => {
  it('三句 legacy 文案都认（前端切到 2.0 后端后这段就删）', () => {
    expect(
      isLegacyContractNotSignedMessage(
        'developer must sign first and user must sign after that before paying deposit',
      ),
    ).toBe(true)
    expect(
      isLegacyContractNotSignedMessage(
        'requirement contract must be signed by developer before paying deposit',
      ),
    ).toBe(true)
    expect(isLegacyContractNotSignedMessage('contract must be created before paying deposit')).toBe(true)
  })

  it('别的文案不认', () => {
    expect(isLegacyContractNotSignedMessage('网关超时')).toBe(false)
  })

  it('走同一套判定：1.x 的纯文本错误体也走「合同未签」分支', () => {
    const legacy = new HttpError(400, 'contract must be created before paying deposit')

    expect(isRequirementContractNotSigned(legacy)).toBe(true)
  })
})
