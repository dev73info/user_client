import { describe, expect, it } from 'vitest'

import {
  API_CALLBACK_SIGNATURE_RULE,
  buildApiPurchaseCurl,
  findInvalidAllowedOrigin,
  formatAllowedOriginsText,
  isApiResourceKind,
  isValidAllowedOrigin,
  isValidCallbackUrl,
  listApiChannelBlockers,
  parseAllowedOriginsInput,
  resourceKindFromQuery,
  resourceKindLabel,
} from '@/shared/resourceApi'

describe('resourceApi', () => {
  it('isApiResourceKind / resourceKindLabel 按 normal 与 api 分档', () => {
    expect(isApiResourceKind('api')).toBe(true)
    expect(isApiResourceKind(' API ')).toBe(true)
    expect(isApiResourceKind('normal')).toBe(false)
    expect(isApiResourceKind(null)).toBe(false)
    expect(isApiResourceKind(undefined)).toBe(false)
    expect(isApiResourceKind('')).toBe(false)
    expect(resourceKindLabel('api')).toBe('接口资源')
    expect(resourceKindLabel('normal')).toBe('普通资源')
    expect(resourceKindLabel(undefined)).toBe('普通资源')
  })

  it('resourceKindFromQuery 只认 api，其余一律普通', () => {
    expect(resourceKindFromQuery('api')).toBe('api')
    expect(resourceKindFromQuery(' API ')).toBe('api')
    expect(resourceKindFromQuery('normal')).toBe('normal')
    expect(resourceKindFromQuery('')).toBe('normal')
    expect(resourceKindFromQuery(null)).toBe('normal')
    expect(resourceKindFromQuery(undefined)).toBe('normal')
    // vue-router 在 ?kind=a&kind=b 时给的是数组，不能当成接口资源
    expect(resourceKindFromQuery(['api'])).toBe('normal')
    expect(resourceKindFromQuery(['api', 'normal'])).toBe('normal')
    expect(resourceKindFromQuery(123)).toBe('normal')
    expect(resourceKindFromQuery({ kind: 'api' })).toBe('normal')
  })

  it('parseAllowedOriginsInput 丢空行、去空白、去重', () => {
    expect(parseAllowedOriginsInput('')).toEqual([])
    expect(parseAllowedOriginsInput(null)).toEqual([])
    expect(parseAllowedOriginsInput(undefined)).toEqual([])
    expect(parseAllowedOriginsInput('   \n\n  \r\n')).toEqual([])
    expect(
      parseAllowedOriginsInput('https://shop.example.com\n\n  *.example.com  \r\n203.0.113.9'),
    ).toEqual(['https://shop.example.com', '*.example.com', '203.0.113.9'])
    // 重复项按不区分大小写去重，保留首次出现的写法
    expect(parseAllowedOriginsInput('HTTPS://Shop.Example.com\nhttps://shop.example.com')).toEqual([
      'HTTPS://Shop.Example.com',
    ])
    expect(parseAllowedOriginsInput('203.0.113.9\n203.0.113.9\n2001:db8::1')).toEqual([
      '203.0.113.9',
      '2001:db8::1',
    ])
  })

  it('formatAllowedOriginsText 一行一个，空值安全', () => {
    expect(formatAllowedOriginsText(null)).toBe('')
    expect(formatAllowedOriginsText(undefined)).toBe('')
    expect(formatAllowedOriginsText([])).toBe('')
    expect(formatAllowedOriginsText(['https://shop.example.com', '', '203.0.113.9'])).toBe(
      'https://shop.example.com\n203.0.113.9',
    )
  })

  it('isValidAllowedOrigin 收完整源（含端口）与通配域名', () => {
    expect(isValidAllowedOrigin('https://shop.example.com')).toBe(true)
    expect(isValidAllowedOrigin('http://shop.example.com')).toBe(true)
    expect(isValidAllowedOrigin('https://shop.example.com:8443')).toBe(true)
    expect(isValidAllowedOrigin('*.example.com')).toBe(true)
    expect(isValidAllowedOrigin('  203.0.113.9  ')).toBe(true)
    // 完整源不接受路径 / 查询，也不接受裸域名（只有三种形态）
    expect(isValidAllowedOrigin('https://shop.example.com/callback')).toBe(false)
    expect(isValidAllowedOrigin('shop.example.com')).toBe(false)
    expect(isValidAllowedOrigin('example')).toBe(false)
    expect(isValidAllowedOrigin('*.com')).toBe(false)
    expect(isValidAllowedOrigin('*')).toBe(false)
    expect(isValidAllowedOrigin('')).toBe(false)
    expect(isValidAllowedOrigin('a'.repeat(254))).toBe(false)
  })

  it('isValidAllowedOrigin 收 v4 / v6 IP', () => {
    expect(isValidAllowedOrigin('203.0.113.9')).toBe(true)
    expect(isValidAllowedOrigin('127.0.0.1')).toBe(true)
    expect(isValidAllowedOrigin('2001:db8::1')).toBe(true)
    expect(isValidAllowedOrigin('[::1]')).toBe(true)
    expect(isValidAllowedOrigin('::ffff:203.0.113.9')).toBe(true)
    expect(isValidAllowedOrigin('999.0.113.9')).toBe(false)
    expect(isValidAllowedOrigin('203.0.113')).toBe(false)
    expect(isValidAllowedOrigin('not:an:ip')).toBe(false)
  })

  it('isValidAllowedOrigin 拒 ftp:// 与 javascript: 这类非法值', () => {
    expect(isValidAllowedOrigin('ftp://shop.example.com')).toBe(false)
    expect(isValidAllowedOrigin('javascript:alert(1)')).toBe(false)
    expect(isValidAllowedOrigin('data:text/html,<p>x</p>')).toBe(false)
    expect(isValidAllowedOrigin('file:///etc/passwd')).toBe(false)
    expect(isValidAllowedOrigin('https://')).toBe(false)
  })

  it('isValidAllowedOrigin 对本地回环的允许与不允许', () => {
    // 允许：完整源带端口、纯回环 IP
    expect(isValidAllowedOrigin('http://127.0.0.1:5173')).toBe(true)
    expect(isValidAllowedOrigin('http://localhost:5173')).toBe(true)
    // 不允许：非法端口、缺端口的裸主机名
    expect(isValidAllowedOrigin('http://127.0.0.1:99999')).toBe(false)
    expect(isValidAllowedOrigin('http://127.0.0.1:0')).toBe(false)
    expect(isValidAllowedOrigin('localhost')).toBe(false)
  })

  it('findInvalidAllowedOrigin 返回第一条不合法的来源，全合法时返回 null', () => {
    expect(findInvalidAllowedOrigin([])).toBeNull()
    expect(findInvalidAllowedOrigin(['', '   '])).toBeNull()
    expect(findInvalidAllowedOrigin(['https://shop.example.com', '*.example.com'])).toBeNull()
    expect(findInvalidAllowedOrigin(['https://shop.example.com', 'ftp://x.example.com'])).toBe(
      'ftp://x.example.com',
    )
    expect(findInvalidAllowedOrigin(['javascript:alert(1)', 'ftp://x.example.com'])).toBe(
      'javascript:alert(1)',
    )
  })

  it('isValidCallbackUrl 收 http(s) 绝对地址，本地回环放行', () => {
    expect(isValidCallbackUrl('https://shop.example.com/73info/callback')).toBe(true)
    expect(isValidCallbackUrl('http://shop.example.com/callback')).toBe(true)
    expect(isValidCallbackUrl('http://127.0.0.1:8080/callback')).toBe(true)
    expect(isValidCallbackUrl('http://localhost:5173/callback')).toBe(true)
    expect(isValidCallbackUrl('https://shop.example.com:8443/cb?a=1')).toBe(true)

    expect(isValidCallbackUrl('')).toBe(false)
    expect(isValidCallbackUrl('   ')).toBe(false)
    expect(isValidCallbackUrl(null)).toBe(false)
    expect(isValidCallbackUrl('shop.example.com/callback')).toBe(false)
    expect(isValidCallbackUrl('ftp://shop.example.com/callback')).toBe(false)
    expect(isValidCallbackUrl('javascript:alert(1)')).toBe(false)
    expect(isValidCallbackUrl(`https://shop.example.com/${'a'.repeat(500)}`)).toBe(false)
  })

  it('listApiChannelBlockers 指出暂不可被下单的原因', () => {
    expect(listApiChannelBlockers({})).toEqual([
      '未配置回调地址，暂不可被下单',
      '未配置允许来源，暂不可被下单',
    ])
    expect(
      listApiChannelBlockers({
        callback_url: 'https://shop.example.com/cb',
        allowed_origins: ['https://shop.example.com'],
      }),
    ).toEqual([])
    expect(
      listApiChannelBlockers({ callback_url: 'https://shop.example.com/cb', allowed_origins: [] }),
    ).toEqual(['未配置允许来源，暂不可被下单'])
    expect(
      listApiChannelBlockers({
        callback_url: '   ',
        allowed_origins: ['   '],
      }),
    ).toEqual(['未配置回调地址，暂不可被下单', '未配置允许来源，暂不可被下单'])
  })

  it('buildApiPurchaseCurl 带上资源编号、接口密钥头与来源', () => {
    const sample = buildApiPurchaseCurl(88, {
      apiBase: 'https://api.73info.cn/',
      origin: 'https://shop.example.com',
    })

    expect(sample).toContain('POST "https://api.73info.cn/api/resource/open/api-purchase"')
    expect(sample).toContain('X-Api-Key: sk-73info-')
    expect(sample).toContain('"resource_id": 88')
    expect(sample).toContain('"origin": "https://shop.example.com"')
    // 资源编号未知时用占位符，不要让开发者抄到一条假编号
    expect(buildApiPurchaseCurl(null, { apiBase: 'https://api.73info.cn' })).toContain(
      '{你的资源编号}',
    )
    expect(API_CALLBACK_SIGNATURE_RULE).toBe('HMAC-SHA256(secret, "{timestamp}.{raw_body}")')
  })
})
