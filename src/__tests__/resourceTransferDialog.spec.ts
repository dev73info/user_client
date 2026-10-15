import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  create: vi.fn(),
  listTeams: vi.fn(),
  teamDetail: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_flow_03562487',
    hydrate: vi.fn(),
  }),
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ showToast: mocks.toast }),
}))
vi.mock('@/api/resourceTransfers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resourceTransfers')>()),
  createResourceTransfer: mocks.create,
}))
vi.mock('@/api/team', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/team')>()),
  listMyTeams: mocks.listTeams,
  getTeamDetail: mocks.teamDetail,
}))

import { HttpError } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import type { TeamDetailResponse, TeamResponse } from '@/api/team'
import ResourceTransferDialog from '@/components/ResourceTransferDialog.vue'

function resourceFixture(): McResourcePayload {
  return {
    id: 12,
    creator: 'dev_flow_03562487',
    ownership_type: 'individual',
    team_id: null,
    requirement_id: null,
    platform: 'windows',
    title: '示例资源',
    author: '开发者',
    description: '简介',
    tag_selections: [],
    file_name: 'example.zip',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'draft',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    // R029：推广分成比例（万分比），0 = 未开启（普通资源默认关闭）
    promo_share_bps: 0,
    created_at: '2026-10-11 09:00:00',
    updated_at: '2026-10-11 09:00:00',
  }
}

function team(id: number, name: string): TeamResponse {
  return {
    team_id: id,
    name,
    description: '',
    avatar_url: null,
    owner_username: 'dev_flow_03562487',
    member_count: 1,
    created_at: '2026-10-11 09:00:00',
    updated_at: '2026-10-11 09:00:00',
  }
}

function teamDetail(id: number, name: string, role: string): TeamDetailResponse {
  return {
    team_id: id,
    name,
    description: '',
    avatar_url: null,
    owner_username: role === 'owner' ? 'dev_flow_03562487' : 'someone_else',
    members: [
      { username: 'dev_flow_03562487', role, joined_at: '2026-10-11 09:00:00' },
    ],
    created_at: '2026-10-11 09:00:00',
    updated_at: '2026-10-11 09:00:00',
  }
}

function mountDialog(open = true): VueWrapper {
  return shallowMount(ResourceTransferDialog, {
    props: { open, resource: resourceFixture() },
    global: { config: { warnHandler: () => {} } },
  })
}

type DialogState = {
  form: { receiverType: 'user' | 'team'; toUser: string; toTeamId: number | null; message: string }
  manageableTeams: TeamDetailResponse[]
  submitting: boolean
  submit: () => Promise<void>
}

function state(wrapper: VueWrapper): DialogState {
  return (wrapper.vm.$ as unknown as { setupState: DialogState }).setupState
}

describe('ResourceTransferDialog：发起表单校验', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({})
    mocks.listTeams.mockResolvedValue([])
  })

  it('接收方选开发者但用户名为空：拦住并提示，不发请求', async () => {
    const wrapper = mountDialog()
    await state(wrapper).submit()
    await flushPromises()

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('请填写接收方的开发者用户名', 'warning')
    expect(wrapper.emitted('submitted')).toBeUndefined()
    wrapper.unmount()
  })

  it('接收方选团队但未选中团队：拦住并提示，不发请求', async () => {
    const wrapper = mountDialog()
    state(wrapper).form.receiverType = 'team'
    await state(wrapper).submit()
    await flushPromises()

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('请选择接收团队', 'warning')
    wrapper.unmount()
  })

  it('填写后提交：参数二选一只传一边，说明去空白后传 null', async () => {
    const wrapper = mountDialog()
    state(wrapper).form.toUser = '  bob_flow  '
    state(wrapper).form.message = '  交接说明  '
    await state(wrapper).submit()
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', 12, {
      to_user: 'bob_flow',
      to_team_id: null,
      message: '交接说明',
    })
    // 提交成功后关闭弹窗并通知宿主刷新「我发起的」
    const openEvents = wrapper.emitted('update:open') ?? []
    expect(openEvents[openEvents.length - 1]).toEqual([false])
    expect(wrapper.emitted('submitted')).toHaveLength(1)
    wrapper.unmount()
  })

  it('团队接收时只传 to_team_id，不传 to_user', async () => {
    const wrapper = mountDialog()
    state(wrapper).form.receiverType = 'team'
    state(wrapper).form.toTeamId = 8
    await state(wrapper).submit()
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', 12, {
      to_user: null,
      to_team_id: 8,
      message: null,
    })
    wrapper.unmount()
  })

  it('后端拒绝时原样透出中文说明，不自行编原因', async () => {
    mocks.create.mockRejectedValue(new HttpError(409, '该资源正被需求绑定，暂不能过户'))
    const wrapper = mountDialog()
    state(wrapper).form.toUser = 'bob_flow'
    await state(wrapper).submit()
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('该资源正被需求绑定，暂不能过户', 'error')
    // 409 时列表已过期，宿主应刷新
    expect(wrapper.emitted('submitted')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('ResourceTransferDialog：团队下拉只列我有 owner / admin 的团队', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTeams.mockResolvedValue([team(1, '我管理的团队'), team(2, '我只是成员')])
    mocks.teamDetail.mockImplementation((_token: string, teamId: number) =>
      Promise.resolve(
        teamId === 1 ? teamDetail(1, '我管理的团队', 'admin') : teamDetail(2, '我只是成员', 'member'),
      ),
    )
  })

  it('打开弹窗后过滤掉仅具 member 身份的团队', async () => {
    const wrapper = mountDialog(false)
    await wrapper.setProps({ open: true })
    await flushPromises()

    const teams = state(wrapper).manageableTeams
    expect(teams).toHaveLength(1)
    expect(teams[0]?.team_id).toBe(1)
    // 没有可管理团队时表单回落到「开发者」这一侧
    expect(state(wrapper).form.receiverType).toBe('user')
    wrapper.unmount()
  })

  it('每次打开都重置表单，上一次的接收方不会串到这一次', async () => {
    const wrapper = mountDialog(false)
    await wrapper.setProps({ open: true })
    await flushPromises()

    state(wrapper).form.toUser = 'leftover'
    state(wrapper).form.receiverType = 'team'
    state(wrapper).form.toTeamId = 1

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()

    expect(state(wrapper).form.toUser).toBe('')
    expect(state(wrapper).form.receiverType).toBe('user')
    expect(state(wrapper).form.toTeamId).toBeNull()
    wrapper.unmount()
  })
})
