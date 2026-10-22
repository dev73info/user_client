import { describe, expect, it } from 'vitest'

import { HttpError } from '@/api/http'
import {
  describeBackendError,
  isShowableBackendText,
  readBackendErrorText,
} from '@/shared/backendErrorText'

/**
 * BUG-012：后端把权限拒绝与参数校验失败统一成了中文，前端按约定原样展示；
 * 但后端偶尔还会回英文裸串（`Forbidden` / `forbidden` / `not found`），
 * 那种不能原样甩到页面上。这里锁住「含中文才展示」这条口径。
 */
describe('后端错误文案口径（BUG-012）', () => {
  it('后端给的中文业务原因原样透出，不在前端另编一套', () => {
    expect(readBackendErrorText('该资源正被需求绑定，暂不能过户', '兜底')).toBe(
      '该资源正被需求绑定，暂不能过户',
    )
    expect(readBackendErrorText('  仅已发布资源可购买  ', '兜底')).toBe('仅已发布资源可购买')
    // 带英文技术名词的中文句子照样能用
    expect(readBackendErrorText('client_platform 只能是 pc 或 mobile', '兜底')).toBe(
      'client_platform 只能是 pc 或 mobile',
    )
  })

  it('英文裸串、空 body 与 HTML 一律回落到中文兜底', () => {
    for (const body of [
      'Forbidden',
      'forbidden',
      'not found',
      'unsupported pay_channel',
      'resource id must be a positive integer',
      'internal server error',
      '',
      '   ',
      '<!doctype html><html><body>502</body></html>',
    ]) {
      expect(isShowableBackendText(body)).toBe(false)
      expect(readBackendErrorText(body, '操作失败，请稍后重试')).toBe('操作失败，请稍后重试')
    }
  })

  it('从异常里取文案：HttpError 按状态取后端原文，其它异常取 message', () => {
    expect(describeBackendError(new HttpError(403, '无权执行该操作'), '兜底')).toBe(
      '无权执行该操作',
    )
    expect(describeBackendError(new HttpError(403, 'forbidden'), '无权执行该操作')).toBe(
      '无权执行该操作',
    )
    expect(describeBackendError(new Error('网络异常'), '兜底')).toBe('网络异常')
    expect(describeBackendError(new Error('Failed to fetch'), '网络异常，请稍后重试')).toBe(
      '网络异常，请稍后重试',
    )
    expect(describeBackendError('boom', '兜底')).toBe('兜底')
    expect(describeBackendError(undefined, '兜底')).toBe('兜底')
  })
})
