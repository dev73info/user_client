import { describe, expect, it } from 'vitest'

import { parseResourcePayChannel } from '@/shared/resourceSale'

/**
 * `?pay=` 的白名单：只认现金两渠道。
 * 身份 / 令牌类参数（token、ticket、open_id…）不在白名单里，也永远不会被当成渠道。
 */
describe('parseResourcePayChannel', () => {
  it('只接受现金两渠道，其余一律丢弃', () => {
    expect(parseResourcePayChannel('wechat')).toBe('wechat')
    expect(parseResourcePayChannel('alipay')).toBe('alipay')
    expect(parseResourcePayChannel('points')).toBeNull()
    expect(parseResourcePayChannel('union')).toBeNull()
    expect(parseResourcePayChannel('WECHAT')).toBeNull()
    expect(parseResourcePayChannel('session-token')).toBeNull()
    expect(parseResourcePayChannel(undefined)).toBeNull()
    expect(parseResourcePayChannel(['alipay'])).toBe('alipay')
    expect(parseResourcePayChannel(['evil', 'alipay'])).toBeNull()
  })
})
