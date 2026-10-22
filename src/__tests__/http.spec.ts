/**
 * 统一请求层：地址拼接、令牌头、错误结构 `{ code, message, field? }`、401 分流。
 *
 * 这一层每个页面都过，写错的表现很分散（刷新掉登录、只看到兜底文案、把纯文本错误当成 JSON），
 * 所以按「调用方拿到的结果」来断言，而不是只测内部函数。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpError, apiUrl, authHeader, requestBlob, requestJson, requestText } from '@/api/http'
import { readErrorShape, toApiErrorShape } from '@/shared/api/httpError'
import { AUTH_UNAUTHORIZED_EVENT } from '@/shared/api/authEvents'

/** 用最小响应替身：jsdom 里不保证有全局 `Response`，这里只实现被测代码用到的成员。 */
function response(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    blob: async () => new Blob([body]),
    headers: new Headers(headers),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('错误结构：HttpError', () => {
  it('保留 status 与 message，并补上 code（缺省按状态兜底）', () => {
    const error = new HttpError(400, '参数不合法')
    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(400)
    expect(error.message).toBe('参数不合法')
    expect(error.code).toBe('HTTP_400')
    expect(error.field).toBeUndefined()
  })

  it('后端给了 code / field 就用后端给的', () => {
    const error = new HttpError(409, '合同已被签署', 'CONTRACT_ALREADY_SIGNED', 'contract_id')
    expect(error.code).toBe('CONTRACT_ALREADY_SIGNED')
    expect(error.field).toBe('contract_id')
  })
})

describe('错误结构：readErrorShape', () => {
  it('JSON 错误体带 code / message / field 时按结构取', async () => {
    const shape = await readErrorShape(
      response(400, JSON.stringify({ code: 'INVALID_ARGUMENT', message: '金额不合法', field: 'amount' })),
      '兜底文案',
    )
    expect(shape).toEqual({ code: 'INVALID_ARGUMENT', message: '金额不合法', field: 'amount' })
  })

  it('JSON 错误体没有这些字段时用原文，code 兜底 HTTP_<status>', async () => {
    const shape = await readErrorShape(response(500, JSON.stringify({ detail: 'boom' })), '兜底文案')
    expect(shape.code).toBe('HTTP_500')
    expect(shape.message).toBe(JSON.stringify({ detail: 'boom' }))
    expect(shape.field).toBeUndefined()
  })

  it('纯文本错误体用原文，code 兜底 HTTP_<status>', async () => {
    const shape = await readErrorShape(response(400, '合同不存在或已被删除'), '兜底文案')
    expect(shape).toEqual({ code: 'HTTP_400', message: '合同不存在或已被删除' })
  })

  it('响应体为空时用兜底文案', async () => {
    const shape = await readErrorShape(response(502, ''), '加载订单失败')
    expect(shape).toEqual({ code: 'HTTP_502', message: '加载订单失败' })
  })
})

describe('错误结构：toApiErrorShape', () => {
  it('HttpError 归一化成形状', () => {
    expect(toApiErrorShape(new HttpError(401, '未登录', 'UNAUTHORIZED'))).toEqual({
      code: 'UNAUTHORIZED',
      message: '未登录',
    })
  })

  it('普通 Error 归一化成 UNKNOWN', () => {
    expect(toApiErrorShape(new Error('网络断了'))).toEqual({ code: 'UNKNOWN', message: '网络断了' })
  })
})

describe('请求层：失败时抛结构化错误', () => {
  it('JSON 错误体的 code / field 落到 HttpError 上', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(422, JSON.stringify({ code: 'INVALID_ARGUMENT', message: '金额不合法', field: 'amount' })),
      ),
    )
    await expect(requestJson('/payment/orders', {}, '创建支付订单失败')).rejects.toMatchObject({
      status: 422,
      code: 'INVALID_ARGUMENT',
      message: '金额不合法',
      field: 'amount',
    })
  })

  it('纯文本错误体用原文 + HTTP_<status> 兜底', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(400, '合同不存在或已被删除')))
    await expect(requestJson('/contract/detail', {}, '加载合同失败')).rejects.toMatchObject({
      status: 400,
      code: 'HTTP_400',
      message: '合同不存在或已被删除',
    })
  })

  it('requestText 失败时同样抛 HttpError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(500, '服务器开小差了')))
    await expect(requestText('/payment/callback', {}, '加载支付回调失败')).rejects.toBeInstanceOf(
      HttpError,
    )
  })
})

describe('请求层：requestBlob', () => {
  it('成功时返回二进制内容', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(200, 'file-bytes')))
    const blob = await requestBlob('/resource/file', {}, '下载文件失败')
    expect(await blob.text()).toBe('file-bytes')
  })

  it('失败时抛结构化错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(404, '文件不存在')))
    await expect(requestBlob('/resource/file', {}, '下载文件失败')).rejects.toMatchObject({
      status: 404,
      code: 'HTTP_404',
      message: '文件不存在',
    })
  })
})

describe('请求层：401 分流', () => {
  it('公开接口（登录）的 401 不派发未授权事件', async () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener)
    vi.stubGlobal('fetch', vi.fn(async () => response(401, '用户名或密码错误')))

    await expect(requestJson('/auth/login', {}, '登录失败')).rejects.toMatchObject({
      status: 401,
      message: '用户名或密码错误',
    })
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener)
  })

  it('受保护接口的 401 派发未授权事件并抛统一文案', async () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener)
    vi.stubGlobal('fetch', vi.fn(async () => response(401, '令牌已失效')))

    await expect(requestJson('/requirement/mine', {}, '加载我的需求失败')).rejects.toMatchObject({
      status: 401,
      code: 'HTTP_401',
      message: '未登录或登录已过期，请重新登录',
    })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener)
  })
})

describe('地址拼接：不会拼出 /api/api/...', () => {
  it('相对 base 下调用方已带 /api 前缀不重复拼', () => {
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login')
  })

  it('绝对 base（带 /api 路径段）下也不重复拼', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
    const { apiUrl: absoluteApiUrl } = await import('@/api/http')
    expect(absoluteApiUrl('/api/auth/login')).toBe('https://api.example.com/api/auth/login')
    expect(absoluteApiUrl('/auth/login')).toBe('https://api.example.com/api/auth/login')
  })
})

describe('令牌头', () => {
  it('空令牌不发 Authorization', () => {
    expect(authHeader('')).toEqual({})
    expect(authHeader('   ')).toEqual({})
  })

  it('有令牌才发 Bearer', () => {
    expect(authHeader('tk-1')).toEqual({ Authorization: 'Bearer tk-1' })
  })
})
