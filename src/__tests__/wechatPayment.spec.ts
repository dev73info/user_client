import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  invokeWechatJsapiPayment,
  isWechatPaymentHandoff,
  parseWechatPayInfo,
} from '@/utils/wechatPayment'

const paymentInfo = {
  appId: 'wx-test',
  timeStamp: '1234567890',
  nonceStr: 'nonce-test',
  package: 'prepay_id=test',
  signType: 'RSA',
  paySign: 'test-signature',
}
const handoff = {
  adapay: '1',
  payment_handoff: '1',
  channel: 'wechat',
  client_platform: 'mobile',
  payment_id: 'payment-test',
  qr_content: JSON.stringify(paymentInfo),
}

describe('WeChat payment handoff', () => {
  it('allows an existing payment with complete JSAPI parameters', () => {
    expect(isWechatPaymentHandoff(handoff)).toBe(true)
    expect(parseWechatPayInfo(handoff.qr_content)).toEqual(paymentInfo)
  })

  it.each([
    { payment_id: '' },
    { payment_handoff: '' },
    { intent: '1' },
    { adapay: '0' },
    { channel: 'alipay' },
    { client_platform: 'pc' },
    { qr_content: '{}' },
    { qr_content: 'invalid' },
    { qr_content: [] },
  ])('does not exempt other payment pages from login: %j', (overrides) => {
    expect(isWechatPaymentHandoff({ ...handoff, ...overrides })).toBe(false)
  })

  it.each(Object.keys(paymentInfo))('requires the %s payment field', (field) => {
    expect(parseWechatPayInfo(JSON.stringify({ ...paymentInfo, [field]: '' }))).toBeNull()
  })

  it('retains supported provider field names', () => {
    expect(
      parseWechatPayInfo(
        JSON.stringify({
          app_id: 'wx-test',
          time_stamp: '1234567890',
          nonce_str: 'nonce-test',
          package: 'prepay_id=test',
          sign_type: 'RSA',
          pay_sign: 'test-signature',
        }),
      ),
    ).toEqual(paymentInfo)
  })
})

describe('微信 JSAPI 调起', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete (window as Window & { WeixinJSBridge?: unknown }).WeixinJSBridge
  })

  function installBridge(errMsg: string) {
    const invoke = vi.fn(
      (_method: string, _params: unknown, callback: (result: { err_msg?: string }) => void) => {
        callback({ err_msg: errMsg })
      },
    )
    ;(window as Window & { WeixinJSBridge?: unknown }).WeixinJSBridge = { invoke }
    return invoke
  }

  it('微信回调 :ok 视为提交成功', async () => {
    const invoke = installBridge('get_brand_wcpay_request:ok')
    await expect(invokeWechatJsapiPayment(paymentInfo)).resolves.toBe('ok')
    expect(invoke).toHaveBeenCalledWith('getBrandWCPayRequest', paymentInfo, expect.any(Function))
  })

  it('用户取消与其它失败分开返回', async () => {
    installBridge('get_brand_wcpay_request:cancel')
    await expect(invokeWechatJsapiPayment(paymentInfo)).resolves.toBe('cancel')
  })

  it('没有 bridge 时等 5 秒后明确失败，不永远转圈', async () => {
    vi.useFakeTimers()
    const pending = invokeWechatJsapiPayment(paymentInfo)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toBe('unavailable')
  })
})
