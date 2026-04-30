import { describe, it, expect } from 'vitest'

import { apiUrl, authHeader, HttpError } from '@/api/http'

describe('api/http utilities', () => {
  it('apiUrl preserves absolute http(s) URLs as-is', () => {
    expect(apiUrl('https://example.com/api/users')).toBe('https://example.com/api/users')
    expect(apiUrl('http://example.com/api')).toBe('http://example.com/api')
  })

  it('apiUrl normalizes leading slash for relative paths', () => {
    expect(apiUrl('auth/login')).toBe('/auth/login')
    expect(apiUrl('/auth/login')).toBe('/auth/login')
  })

  it('authHeader returns Bearer header when token is non-empty', () => {
    expect(authHeader('abc.def.ghi')).toEqual({ Authorization: 'Bearer abc.def.ghi' })
    expect(authHeader('  token  ')).toEqual({ Authorization: 'Bearer token' })
  })

  it('authHeader returns empty object for blank token', () => {
    expect(authHeader('')).toEqual({})
    expect(authHeader('   ')).toEqual({})
  })

  it('HttpError carries status and message', () => {
    const err = new HttpError(401, '未登录')
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(401)
    expect(err.message).toBe('未登录')
    expect(err.name).toBe('HttpError')
  })
})
