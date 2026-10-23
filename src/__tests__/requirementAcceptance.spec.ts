import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestJson = vi.fn()

vi.mock('@/api/http', () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
  authHeaders: (token: string, extra?: Record<string, string>) => ({
    Authorization: `Bearer ${token}`,
    ...(extra ?? {}),
  }),
}))

const { listRequirementAcceptances, submitRequirementAcceptance } =
  await import('@/api/requirements')

describe('验收接口（2.0 新路径）', () => {
  beforeEach(() => {
    requestJson.mockReset()
  })

  it('打回：POST /requirements/{id}/acceptance，body 带 result 与去掉首尾空格的 note', async () => {
    requestJson.mockResolvedValueOnce({
      status: 'in_development',
      remediation_due_at: '2026-10-30 12:00:00',
    })

    const res = await submitRequirementAcceptance('t', 'R-1', 'rejected', '  接口没按文档实现  ')

    expect(requestJson).toHaveBeenCalledTimes(1)
    const [path, init] = requestJson.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/requirements/R-1/acceptance')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ result: 'rejected', note: '接口没按文档实现' })
    expect(res.remediation_due_at).toBe('2026-10-30 12:00:00')
  })

  it('通过：同样走 acceptance，note 允许为空串', async () => {
    requestJson.mockResolvedValueOnce({ status: 'pending_final' })

    await submitRequirementAcceptance('t', 'R-1', 'passed')

    const [, init] = requestJson.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({ result: 'passed', note: '' })
  })

  it('需求编号会被 URL 编码，避免编号里的特殊字符破坏路径', async () => {
    requestJson.mockResolvedValueOnce({})
    await submitRequirementAcceptance('t', 'a/b c', 'passed')
    const [path] = requestJson.mock.calls[0] as [string]
    expect(path).toBe('/requirements/a%2Fb%20c/acceptance')
  })

  it('验收留档走 GET /requirements/{id}/acceptances', async () => {
    requestJson.mockResolvedValueOnce([
      { id: 1, result: 'passed', submittedBy: 'u', note: '', createdAt: '' },
    ])

    const rows = await listRequirementAcceptances('t', 'R-1')

    const [path, init] = requestJson.mock.calls[0] as [string, { method?: string }]
    expect(path).toBe('/requirements/R-1/acceptances')
    expect(init.method).toBeUndefined()
    expect(rows).toHaveLength(1)
  })
})
