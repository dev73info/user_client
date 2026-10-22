import { describe, expect, it } from 'vitest'

import {
  formatRedirectUris,
  parseRedirectUrisInput,
  redirectUriError,
  validateRedirectUris,
} from '@/shared/oauthClient'

describe('oauthClient redirect_uris', () => {
  it('按行解析，去空白、去空行、原样去重', () => {
    expect(
      parseRedirectUrisInput(`
        https://shop.example.com/cb
        https://shop.example.com/cb
        http://127.0.0.1:5175/oauth/callback
      `),
    ).toEqual([
      'https://shop.example.com/cb',
      'http://127.0.0.1:5175/oauth/callback',
    ])
  })

  it('格式化回多行文本', () => {
    expect(formatRedirectUris(['a', 'b'])).toBe('a\nb')
    expect(formatRedirectUris([])).toBe('')
  })

  it('只接受 http(s) 绝对地址，拒绝 fragment 与空白', () => {
    expect(redirectUriError('https://shop.example.com/cb')).toBe('')
    expect(redirectUriError('http://127.0.0.1:5175/cb')).toBe('')
    expect(redirectUriError('shop.example.com/cb')).toContain('http(s)')
    expect(redirectUriError('ftp://shop.example.com/cb')).toContain('http(s)')
    expect(redirectUriError('https://shop.example.com/cb#frag')).toContain('fragment')
    expect(redirectUriError('https://shop.example.com/a b')).toContain('空白')
    expect(redirectUriError('https://')).not.toBe('')
  })

  it('整组校验：1–5 条，逐条校验', () => {
    expect(validateRedirectUris([])).toContain('至少需要 1 条')
    expect(
      validateRedirectUris(
        Array.from({ length: 6 }, (_, index) => `https://shop.example.com/cb-${index}`),
      ),
    ).toContain('最多 5 条')
    expect(validateRedirectUris(['https://shop.example.com/cb'])).toBe('')
    expect(validateRedirectUris(['https://shop.example.com/cb', 'bad'])).toContain('bad')
  })

  it('长度上限与后端一致（500）', () => {
    const longUrl = `https://shop.example.com/${'a'.repeat(480)}`
    expect(redirectUriError(longUrl)).toContain('500')
  })
})
