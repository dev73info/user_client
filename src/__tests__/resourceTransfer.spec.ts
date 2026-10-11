import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestJsonMock = vi.hoisted(() => vi.fn())
const authHeaderMock = vi.hoisted(() => vi.fn((token: string) => ({ Authorization: `Bearer ${token}` })))

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  requestJson: requestJsonMock,
  authHeader: authHeaderMock,
}))

import { HttpError } from '@/api/http'
import {
  acceptResourceTransfer,
  cancelResourceTransfer,
  createResourceTransfer,
  listMyResourceTransferInbox,
  listMyResourceTransfers,
  rejectResourceTransfer,
  type ResourceTransferPayload,
} from '@/api/resourceTransfers'
import {
  describeTransferError,
  describeTransferReceiver,
  isTransferCancelable,
  transferStatusLabel,
  transferStatusTone,
  validateTransferReceiver,
} from '@/shared/resourceTransfer'

/* R015 资源过户的前端契约：接收方二选一校验、状态文案与配色、接收方展示名、错误翻译，
   以及「接口路径必须与后端路由一致」——后者用被 mock 的 requestJson 的第一参数断言。 */

describe('发起过户：接收方二选一校验', () => {
  it('选开发者时用户名不能为空，去空白后为空也算未填', () => {
    expect(
      validateTransferReceiver({ receiverType: 'user', toUser: '', toTeamId: null }),
    ).toBe('请填写接收方的开发者用户名')
    expect(
      validateTransferReceiver({ receiverType: 'user', toUser: '   ', toTeamId: null }),
    ).toBe('请填写接收方的开发者用户名')
    expect(
      validateTransferReceiver({ receiverType: 'user', toUser: 'bob', toTeamId: null }),
    ).toBeNull()
  })

  it('选团队时必须选中一个团队，未选 / 无效值都拦住', () => {
    expect(
      validateTransferReceiver({ receiverType: 'team', toUser: '', toTeamId: null }),
    ).toBe('请选择接收团队')
    expect(
      validateTransferReceiver({ receiverType: 'team', toUser: '', toTeamId: Number.NaN }),
    ).toBe('请选择接收团队')
    expect(
      validateTransferReceiver({ receiverType: 'team', toUser: '', toTeamId: 7 }),
    ).toBeNull()
  })
})

describe('只有 pending 才允许撤销', () => {
  it('pending 可撤销，其余状态一律不可', () => {
    expect(isTransferCancelable('pending')).toBe(true)
    expect(isTransferCancelable('accepted')).toBe(false)
    expect(isTransferCancelable('rejected')).toBe(false)
    expect(isTransferCancelable('cancelled')).toBe(false)
    expect(isTransferCancelable('unknown-status')).toBe(false)
  })
})

describe('过户状态文案与配色', () => {
  it('四种状态各有中文名', () => {
    expect(transferStatusLabel('pending')).toBe('等待对方同意')
    expect(transferStatusLabel('accepted')).toBe('已同意')
    expect(transferStatusLabel('rejected')).toBe('已拒绝')
    expect(transferStatusLabel('cancelled')).toBe('已撤销')
    // 未知状态原样回显，不吞掉信息
    expect(transferStatusLabel('weird')).toBe('weird')
  })

  it('配色与语义对应', () => {
    expect(transferStatusTone('pending')).toBe('warning')
    expect(transferStatusTone('accepted')).toBe('success')
    expect(transferStatusTone('rejected')).toBe('danger')
    expect(transferStatusTone('cancelled')).toBe('neutral')
    expect(transferStatusTone('weird')).toBe('neutral')
  })
})

describe('接收方展示名', () => {
  it('个人取用户名，团队取团队名，缺名回落 #id，都没有给占位符', () => {
    expect(describeTransferReceiver({ to_user: 'bob', to_team_id: null, to_team_name: null })).toBe(
      '开发者 bob',
    )
    expect(describeTransferReceiver({ to_user: null, to_team_id: 3, to_team_name: '星火团队' })).toBe(
      '团队 星火团队',
    )
    expect(describeTransferReceiver({ to_user: null, to_team_id: 3, to_team_name: null })).toBe(
      '团队 #3',
    )
    expect(describeTransferReceiver({ to_user: null, to_team_id: null, to_team_name: null })).toBe(
      '—',
    )
  })
})

describe('过户错误翻译：后端中文说明优先，401/403/404 回落固定文案', () => {
  it('4xx 带后端中文提示时原样透出，不前端自己编原因', () => {
    const conflict = describeTransferError(
      new HttpError(409, '该资源正被需求绑定，暂不能过户'),
    )
    expect(conflict.message).toBe('该资源正被需求绑定，暂不能过户')
    // 409 说明列表已过期，调用方刷新即可
    expect(conflict.needRefresh).toBe(true)

    const badRequest = describeTransferError(new HttpError(400, '接收方不能是自己'))
    expect(badRequest.message).toBe('接收方不能是自己')
    expect(badRequest.needRefresh).toBe(false)
  })

  it('401 / 403 用固定中文，不把英文串甩给用户', () => {
    expect(describeTransferError(new HttpError(401, 'unauthorized')).message).toBe(
      '登录状态已失效，请重新登录',
    )
    expect(describeTransferError(new HttpError(403, 'forbidden')).message).toBe(
      '只有过户的接收方本人（或该团队的管理者）可以处理这条申请',
    )
  })

  it('404 空 body 视为申请已不存在，并提示刷新', () => {
    const missing = describeTransferError(new HttpError(404, ''))
    expect(missing.message).toBe('过户申请不存在或已被删除')
    expect(missing.needRefresh).toBe(true)
  })

  it('非 HttpError 用 Error.message，其它回落 fallback', () => {
    expect(describeTransferError(new Error('网络异常')).message).toBe('网络异常')
    expect(describeTransferError('boom', '发起过户失败').message).toBe('发起过户失败')
    expect(describeTransferError(new HttpError(500, ''), '发起过户失败').message).toBe(
      '发起过户失败',
    )
  })
})

describe('接口路径与后端路由一致（`/api/resources/...`）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestJsonMock.mockResolvedValue({})
  })

  it('发起过户', async () => {
    await createResourceTransfer('tok', 5, { to_user: 'bob' })
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/resources/5/transfers',
      expect.objectContaining({ method: 'POST' }),
      '发起过户失败',
    )
  })

  it('我发起的 / 待我同意', async () => {
    await listMyResourceTransfers('tok')
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/transfers/mine',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
      '加载我发起的过户失败',
    )

    requestJsonMock.mockClear()
    await listMyResourceTransferInbox('tok')
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/transfers/inbox',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
      '加载待我同意的过户失败',
    )
  })

  it('同意 / 拒绝 / 撤销', async () => {
    await acceptResourceTransfer('tok', 9)
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/transfers/9/accept',
      expect.objectContaining({ method: 'POST' }),
      '同意过户失败',
    )

    requestJsonMock.mockClear()
    await rejectResourceTransfer('tok', 9)
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/transfers/9/reject',
      expect.objectContaining({ method: 'POST' }),
      '拒绝过户失败',
    )

    requestJsonMock.mockClear()
    await cancelResourceTransfer('tok', 9)
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/dev/resources/transfers/9/cancel',
      expect.objectContaining({ method: 'POST' }),
      '撤销过户失败',
    )
  })
})

/** 「我发起的」与「待我同意」同形状：锁住字段名，避免后端改名时前端静默读到 undefined。 */
const samplePayload: ResourceTransferPayload = {
  transfer_id: 1,
  resource_id: 5,
  resource_name: '资源',
  from_user: 'a',
  from_team_id: null,
  from_team_name: null,
  to_user: 'b',
  to_team_id: null,
  to_team_name: null,
  status: 'pending',
  message: null,
  from_ownership_type: 'individual',
  initiated_at: '2026-10-11 09:00:00',
  responded_at: null,
  responded_by: null,
  cancelled_at: null,
}

describe('ResourceTransferPayload 形状', () => {
  it('列表项字段与后端返回一一对应', () => {
    expect(Object.keys(samplePayload).sort()).toEqual(
      [
        'cancelled_at',
        'from_ownership_type',
        'from_team_id',
        'from_team_name',
        'from_user',
        'initiated_at',
        'message',
        'resource_id',
        'resource_name',
        'responded_at',
        'responded_by',
        'status',
        'to_team_id',
        'to_team_name',
        'to_user',
        'transfer_id',
      ].sort(),
    )
  })
})
