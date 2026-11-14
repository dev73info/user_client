/**
 * 挑战地址拼接：challenge 与接口共用 `apiUrl` 的基址口径。
 *
 * 这四个场景分别对应 production、本地代理、直连 8080、以及基址里已经带 `/api` 的写法，
 * 任何一种都不能拼出两个 `/api`，否则挂件请求会静默 404。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

async function challengeUrlFor(apiBase: string) {
  vi.stubEnv('VITE_API_BASE_URL', apiBase)
  vi.resetModules()
  const { getCaptchaChallengeUrl } = await import('@/shared/captcha')
  return getCaptchaChallengeUrl()
}

describe('getCaptchaChallengeUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('同源（本地代理）时为 /api/captcha/challenge', async () => {
    await expect(challengeUrlFor('')).resolves.toBe('/api/captcha/challenge')
  })

  it('直连 8080 时带上后端基址', async () => {
    await expect(challengeUrlFor('http://127.0.0.1:8080')).resolves.toBe(
      'http://127.0.0.1:8080/api/captcha/challenge',
    )
  })

  it('production 基址为 https://api.73info.cn', async () => {
    await expect(challengeUrlFor('https://api.73info.cn')).resolves.toBe(
      'https://api.73info.cn/api/captcha/challenge',
    )
  })

  it('基址已带 /api 时不重复拼接', async () => {
    await expect(challengeUrlFor('https://api.73info.cn/api')).resolves.toBe(
      'https://api.73info.cn/api/captcha/challenge',
    )
  })

  it('基址带尾斜杠时不会出现双斜杠', async () => {
    await expect(challengeUrlFor('https://api.73info.cn/')).resolves.toBe(
      'https://api.73info.cn/api/captcha/challenge',
    )
  })
})
