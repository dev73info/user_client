import { describe, expect, it } from 'vitest'

import { hasInitiatedSigning, signingLogLabel } from '@/shared/contractSign'

describe('合同签署发起标记', () => {
  it('识别 2.0 的 sign_initiated', () => {
    expect(hasInitiatedSigning([{ action: 'sign_initiated' }])).toBe(true)
    expect(signingLogLabel({ action: 'sign_initiated' })).toBe('已发起电子签署')
  })

  it('不把旧动作名或其它日志当成已发起', () => {
    expect(hasInitiatedSigning([{ action: 'asign_sign_initiated' }])).toBe(false)
    expect(hasInitiatedSigning([{ action: 'created' }])).toBe(false)
    expect(hasInitiatedSigning(undefined)).toBe(false)
    expect(hasInitiatedSigning(null)).toBe(false)
  })
})
