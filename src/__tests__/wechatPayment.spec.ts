import { describe, expect, it } from 'vitest'
import { isWechatPaymentHandoff, parseWechatPayInfo } from '@/utils/wechatPayment'

const paymentInfo = {
  appId: 'wx-test', timeStamp: '1234567890', nonceStr: 'nonce-test',
  package: 'prepay_id=test', signType: 'RSA', paySign: 'test-signature',
}
const handoff = {
  adapay: '1', payment_handoff: '1', channel: 'wechat', client_platform: 'mobile',
  payment_id: 'payment-test', qr_content: JSON.stringify(paymentInfo),
}

describe('WeChat payment handoff', () => {
  it('allows an existing payment with complete JSAPI parameters', () => {
    expect(isWechatPaymentHandoff(handoff)).toBe(true)
    expect(parseWechatPayInfo(handoff.qr_content)).toEqual(paymentInfo)
  })

  it.each([
    { payment_id: '' }, { payment_handoff: '' }, { intent: '1' },
    { adapay: '0' }, { channel: 'alipay' }, { client_platform: 'pc' },
    { qr_content: '{}' }, { qr_content: 'invalid' }, { qr_content: [] },
  ])('does not exempt other payment pages from login: %j', (overrides) => {
    expect(isWechatPaymentHandoff({ ...handoff, ...overrides })).toBe(false)
  })

  it.each(Object.keys(paymentInfo))('requires the %s payment field', (field) => {
    expect(parseWechatPayInfo(JSON.stringify({ ...paymentInfo, [field]: '' }))).toBeNull()
  })

  it('retains supported provider field names', () => {
    expect(parseWechatPayInfo(JSON.stringify({
      app_id: 'wx-test', time_stamp: '1234567890', nonce_str: 'nonce-test',
      package: 'prepay_id=test', sign_type: 'RSA', pay_sign: 'test-signature',
    }))).toEqual(paymentInfo)
  })
})
