import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOAuthClient,
  deleteOAuthClient,
  listOAuthClients,
  rotateOAuthClientSecret,
  updateOAuthClient,
} from '@/api/oauthClients'

const fetchMock = vi.fn()

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', '')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('OAuth 客户端管理 API', () => {
  it('列表走 /api/oauth/clients', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await expect(listOAuthClients('test-token')).resolves.toEqual([])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/oauth/clients')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token')
  })

  it('创建提交名称、回调地址与 scope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ client_id: 'c1', client_secret: 'secret-once' }, 201),
    )

    const created = await createOAuthClient('test-token', {
      name: '我的小站',
      redirect_uris: ['https://example.com/cb'],
      scopes: ['profile', 'purchase'],
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/oauth/clients')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      name: '我的小站',
      redirect_uris: ['https://example.com/cb'],
      scopes: ['profile', 'purchase'],
    })
    expect(created.client_secret).toBe('secret-once')
  })

  it('编辑只提交名称与回调地址', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ client_id: 'c1' }))

    await updateOAuthClient('test-token', 'c1', {
      name: '改名',
      redirect_uris: ['https://example.com/cb2'],
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/oauth/clients/c1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({
      name: '改名',
      redirect_uris: ['https://example.com/cb2'],
    })
  })

  it('轮换与删除都走各自端点', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ client_secret: 'new-secret' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const rotated = await rotateOAuthClientSecret('test-token', 'c1')
    expect(rotated.client_secret).toBe('new-secret')
    await deleteOAuthClient('test-token', 'c1')

    const [rotateUrl, rotateInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(rotateUrl).toBe('/api/oauth/clients/c1/rotate')
    expect(rotateInit.method).toBe('POST')
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(deleteUrl).toBe('/api/oauth/clients/c1')
    expect(deleteInit.method).toBe('DELETE')
  })
})
