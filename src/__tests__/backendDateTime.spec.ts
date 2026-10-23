import { describe, expect, it } from 'vitest'

import { formatBackendDateTime, parseBackendDateTime } from '@/shared/datetime'

/**
 * 后端时间是**东八区墙钟串、不带偏移**。这里钉死三件事：
 * 1) 不带偏移的串按 +08:00 解析（不是浏览器本地时区）；
 * 2) 已带偏移的串原样交给 Date，不再叠加；
 * 3) 解析不出来返回 null，不抛错、不回退成「现在」。
 */
describe('parseBackendDateTime', () => {
  it('墙钟串按 +08:00 解析（同一时刻的 UTC 表示）', () => {
    expect(parseBackendDateTime('2026-10-24 15:00:00')?.toISOString()).toBe(
      '2026-10-24T07:00:00.000Z',
    )
    expect(parseBackendDateTime('2026-01-01 00:00:00')?.toISOString()).toBe(
      '2025-12-31T16:00:00.000Z',
    )
  })

  it('带 T 的写法与带空格的写法等价', () => {
    expect(parseBackendDateTime('2026-10-24T15:00:00')?.toISOString()).toBe(
      '2026-10-24T07:00:00.000Z',
    )
  })

  it('已带偏移的串不叠加 +08:00', () => {
    expect(parseBackendDateTime('2026-10-24T07:00:00Z')?.toISOString()).toBe(
      '2026-10-24T07:00:00.000Z',
    )
    expect(parseBackendDateTime('2026-10-24T15:00:00+08:00')?.toISOString()).toBe(
      '2026-10-24T07:00:00.000Z',
    )
  })

  it('空值与非时间串返回 null', () => {
    expect(parseBackendDateTime('')).toBeNull()
    expect(parseBackendDateTime(null)).toBeNull()
    expect(parseBackendDateTime(undefined)).toBeNull()
    expect(parseBackendDateTime('不是时间')).toBeNull()
  })

  it('跨日边界：东八区 00:00 落在 UTC 前一天 16:00', () => {
    const d = parseBackendDateTime('2026-03-01 00:00:00')
    expect(d?.toISOString()).toBe('2026-02-28T16:00:00.000Z')
  })
})

describe('formatBackendDateTime', () => {
  it('按传入的时区渲染，跨时区不改瞬时', () => {
    const shanghai = formatBackendDateTime('2026-10-24 15:00:00', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const utc = formatBackendDateTime('2026-10-24 15:00:00', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(shanghai).toContain('15')
    expect(utc).toContain('07')
  })

  it('无效时间给「时间未知」而不是崩溃', () => {
    expect(formatBackendDateTime('')).toBe('时间未知')
  })
})
