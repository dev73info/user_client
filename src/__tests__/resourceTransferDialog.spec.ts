import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McResourcePayload } from '@/api/mcResources'
import type { TeamDetailResponse, TeamResponse } from '@/api/team'
import ResourceTransferDialog from '@/components/ResourceTransferDialog.vue'

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  create: vi.fn(),
  listTeams: vi.fn(),
  teamDetail: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'dev-token', username: 'developer' }),
}))
vi.mock('@/api/resourceTransfers', () => ({ createResourceTransfer: mocks.create }))
vi.mock('@/api/team', () => ({
  listMyTeams: mocks.listTeams,
  getTeamDetail: mocks.teamDetail,
}))
vi.mock('ui_73info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ui_73info')>()),
  TMessage: { success: mocks.success, warning: mocks.warning, error: mocks.error },
}))

const resource = { id: 12, title: '过户测试资源' } as McResourcePayload

function team(id: number, name: string): TeamResponse {
  return {
    team_id: id,
    name,
    description: '',
    avatar_url: null,
    owner_username: 'developer',
    member_count: 1,
    created_at: '2026-10-27 10:00:00',
    updated_at: '2026-10-27 10:00:00',
  }
}

function detail(id: number, name: string, role: string): TeamDetailResponse {
  return {
    team: team(id, name),
    members: [{ username: 'developer', role, joined_at: '2026-10-27 10:00:00' }],
  }
}

type DialogState = {
  form: { receiverType: 'user' | 'team'; toUser: string; toTeamId: number | null; message: string }
  manageableTeams: TeamResponse[]
  submit: () => Promise<void>
}

function state(wrapper: VueWrapper): DialogState {
  return (wrapper.vm.$ as unknown as { setupState: DialogState }).setupState
}

function mountDialog(open = false): VueWrapper {
  return shallowMount(ResourceTransferDialog, { props: { open, resource } })
}

describe('资源过户弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTeams.mockResolvedValue([])
    mocks.create.mockResolvedValue({})
  })

  it('没有接收方时不发请求', async () => {
    const wrapper = mountDialog()
    await state(wrapper).submit()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('请填写接收方的登录用户名')
    wrapper.unmount()
  })

  it('向用户发起过户并清理首尾空白', async () => {
    const wrapper = mountDialog(true)
    state(wrapper).form.toUser = '  receiver  '
    state(wrapper).form.message = '  交接说明  '
    await state(wrapper).submit()
    expect(mocks.create).toHaveBeenCalledWith('dev-token', 12, {
      to_user: 'receiver',
      to_team_id: null,
      message: '交接说明',
    })
    expect(wrapper.emitted('submitted')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toContainEqual([false])
    wrapper.unmount()
  })

  it('只列出本人可管理的团队，并按真实契约传团队编号', async () => {
    mocks.listTeams.mockResolvedValue([team(1, '管理团队'), team(2, '普通成员团队')])
    mocks.teamDetail.mockImplementation((_token: string, id: number) =>
      Promise.resolve(
        detail(id, id === 1 ? '管理团队' : '普通成员团队', id === 1 ? 'admin' : 'member'),
      ),
    )
    const wrapper = mountDialog()
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(state(wrapper).manageableTeams.map((item) => item.team_id)).toEqual([1])
    state(wrapper).form.receiverType = 'team'
    state(wrapper).form.toTeamId = 1
    await state(wrapper).submit()
    expect(mocks.create).toHaveBeenCalledWith('dev-token', 12, {
      to_user: null,
      to_team_id: 1,
      message: null,
    })
    wrapper.unmount()
  })

  it('提交冲突时保留后端原因并通知列表刷新', async () => {
    mocks.create.mockRejectedValue(new Error('该资源正被需求绑定，暂不能过户'))
    const wrapper = mountDialog()
    state(wrapper).form.toUser = 'receiver'
    await state(wrapper).submit()
    expect(mocks.error).toHaveBeenCalledWith('该资源正被需求绑定，暂不能过户')
    wrapper.unmount()
  })
})
