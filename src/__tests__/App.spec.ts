import { describe, it, expect } from 'vitest'

import { apiUrl, authHeader, HttpError, normalizeBackendPath } from '@/api/http'

describe('api/http utilities', () => {
  it('apiUrl preserves absolute http(s) URLs as-is', () => {
    expect(apiUrl('https://example.com/api/users')).toBe('https://example.com/api/users')
    expect(apiUrl('http://example.com/api')).toBe('http://example.com/api')
  })

  it('apiUrl normalizes API paths to the backend /api prefix', () => {
    expect(apiUrl('auth/login')).toBe('/api/auth/login')
    expect(apiUrl('/auth/login')).toBe('/api/auth/login')
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login')
  })

  it('normalizeBackendPath maps user-client aliases to backend routes', () => {
    expect(normalizeBackendPath('/payments/orders')).toBe('/api/payment/orders')
    expect(normalizeBackendPath('/coupons/available')).toBe('/api/coupon/available')
    expect(normalizeBackendPath('/settings/deposit-ratio')).toBe(
      '/api/system/settings/deposit-ratio',
    )
    expect(normalizeBackendPath('/api/settings/deposit-ratio')).toBe(
      '/api/system/settings/deposit-ratio',
    )
    expect(normalizeBackendPath('/requirements/')).toBe('/api/requirement/')
    expect(normalizeBackendPath('/api/requirements/')).toBe('/api/requirement/')
    expect(normalizeBackendPath('/requirements/mine')).toBe('/api/requirement/mine')
    expect(normalizeBackendPath('/contracts/signing-status/rq_1')).toBe(
      '/api/contract/signing-status/rq_1',
    )
    expect(normalizeBackendPath('/public/requirements/public-overview')).toBe(
      '/api/requirements/public-overview',
    )
    expect(normalizeBackendPath('/resource/resources')).toBe('/api/resource/resources')
    expect(normalizeBackendPath('/dev/resources/resources')).toBe('/api/resources/resources')
    expect(normalizeBackendPath('/resources/tags')).toBe('/api/tag/tags')
    expect(normalizeBackendPath('/api/resources/tags')).toBe('/api/tag/tags')
    expect(normalizeBackendPath('/dev/requirements/hall/query')).toBe('/api/requirement/hall/query')
    expect(normalizeBackendPath('/dev/credit/me')).toBe('/api/credit/credit/me')
  })

  it('apiUrl keeps backend static uploads outside the /api prefix', () => {
    expect(apiUrl('/uploads/resource-cover.png')).toBe('/uploads/resource-cover.png')
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
