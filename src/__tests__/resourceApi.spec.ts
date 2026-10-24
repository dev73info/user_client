import { describe, expect, it } from 'vitest'

import {
  API_CALLBACK_SIGNATURE_RULE,
  API_INTEGRATION_GUIDE_PATH,
  API_OPEN_PURCHASE_ALIAS_PATH,
  API_OPEN_PURCHASE_PATH,
  buildApiIntegrationPrompt,
  findInvalidAllowedOrigin,
  formatAllowedOriginsText,
  isApiResourceKind,
  isResourceRowActionAvailable,
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

  it('isResourceRowActionAvailable：接口资源藏掉版本 / 道具卡，其余动作照常', () => {
    // 接口资源没有可下载文件、也不进任何公开面（过户已按契约整组移除，不再是动作码）
    for (const action of ['publish', 'versions', 'use-promo'] as const) {
      expect(isResourceRowActionAvailable(action, 'api')).toBe(false)
    }
    // 仍成立的四项：审核、上下架、订单、删除
    for (const action of ['request-review', 'set-private', 'sold-orders', 'delete'] as const) {
      expect(isResourceRowActionAvailable(action, 'api')).toBe(true)
    }
    // 普通资源（含缺省 / 脏值）一项都不藏
    for (const kind of ['normal', null, undefined, ''] as const) {
      for (const action of ['publish', 'versions', 'use-promo', 'delete'] as const) {
        expect(isResourceRowActionAvailable(action, kind)).toBe(true)
      }
    }
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

  it('buildApiIntegrationPrompt 与 2.0 开放接口契约一致', () => {
    const prompt = buildApiIntegrationPrompt(88, { apiBase: 'https://api.73info.cn/' })

    expect(prompt).toContain(`https://api.73info.cn${API_INTEGRATION_GUIDE_PATH}`)
    // 2.0 只认 Authorization 头：Basic 客户端凭据 / Bearer 用户令牌，X-Api-Key 已取消
    expect(prompt).toContain('Authorization')
    expect(prompt).toContain('client_id:client_secret')
    expect(prompt).toContain('不再使用 X-Api-Key')
    expect(prompt).not.toContain('sk-73info-')
    // 下单走正式路径，兼容别名只作备注
    expect(prompt).toContain(`POST https://api.73info.cn${API_OPEN_PURCHASE_PATH}`)
    expect(API_OPEN_PURCHASE_PATH).toBe('/api/resource/open/purchases')
    expect(prompt).toContain(API_OPEN_PURCHASE_ALIAS_PATH)
    expect(prompt).toContain('resource_id = 88')
    // 2.0 的另外三个端点
    expect(prompt).toContain('/open/users/ensure')
    expect(prompt).toContain('/open/orders/{order_no}')
    // 票据换登录态在契约里的正式路径是 /api/resource/checkout/exchange（不带 /open 段）
    expect(prompt).toContain('/api/resource/checkout/exchange')
    // 2.0 不再自动建号：未绑定返回 409
    expect(prompt).toContain('409')
    // 下单返回 checkout_url（票据 10 分钟一次性），不再有 pay_url
    expect(prompt).toContain('checkout_url')
    expect(prompt).toContain('10 分钟')
    expect(prompt).not.toContain('pay_url')
    // 回调：四个头 + 签名口径 + 不可当唯一入账依据
    expect(prompt).toContain('X-73Info-Signature')
    expect(prompt).toContain(API_CALLBACK_SIGNATURE_RULE)
    expect(prompt).toContain('原始请求体重算')
    expect(prompt).toContain('不影响收款与分账')
    // 不再组装 curl：旧示例里的调用体字段不应再出现在提示词里
    expect(prompt).not.toContain('curl')
    // 资源编号未知时用占位符，不要让开发者抄到一条假编号
    expect(buildApiIntegrationPrompt(null, { apiBase: 'https://api.73info.cn' })).toContain(
      '{你的资源编号}',
    )
    expect(API_CALLBACK_SIGNATURE_RULE).toBe('HMAC-SHA256(secret, "{timestamp}.{raw_body}")')
  })
})
