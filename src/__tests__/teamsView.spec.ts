import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TeamInvitationResponse, TeamResponse } from '@/api/team'
import { useAuthStore } from '@/stores/auth'
import TeamsView from '@/views/TeamsView.vue'

/**
 * 团队列表页拆分后的接线回归：页面自己只剩排版，取数与动作在 `useTeams` / `useTeamInvitations` 里，
 * 由邀请卡、团队卡、创建弹窗的组件事件转上去。这里按用户的实际操作点一遍，
 * 确认「组件事件 → composable → 接口 / 路由」这条链在几处都没有断
 * （拆分前这些逻辑同在一个文件里，搬开时最容易漏接或接错参数）。
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  invitations: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  leave: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
}))

vi.mock('@/api/team', () => ({
  listMyTeams: mocks.list,
  listUserInvitations: mocks.invitations,
  createTeam: mocks.create,
  deleteTeam: mocks.remove,
  leaveTeam: mocks.leave,
  acceptInvitation: mocks.accept,
  rejectInvitation: mocks.reject,
}))

/** 只填列表页用得到的字段；其余字段与这些用例无关。 */
function teamOf(overrides: Partial<TeamResponse> = {}): TeamResponse {
  return {
    team_id: 1,
    name: '七星团队',
    description: '',
    avatar_url: null,
    owner_username: 'alice',
    member_count: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function invitationOf(overrides: Partial<TeamInvitationResponse> = {}): TeamInvitationResponse {
  return {
    id: 11,
    team_id: 7,
    team_name: '彝良团队',
    inviter_username: 'bob',
    invitee_username: 'alice',
    status: 'pending',
    created_at: '2026-10-21T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', () => true)
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  // 每次都给一份新的：视图会就地增删（创建 / 解散 / 退出），共用一份会串场
  mocks.list.mockImplementation(async () => [
    teamOf({ team_id: 1, name: '旧团队', owner_username: 'alice' }),
    teamOf({ team_id: 3, name: '新团队', description: '做资源整合', owner_username: 'bob' }),
    teamOf({ team_id: 2, name: '中间团队', owner_username: 'alice' }),
  ])
  mocks.invitations.mockImplementation(async () => [])
  mocks.create.mockResolvedValue(teamOf({ team_id: 9, name: '七星团队' }))
  mocks.remove.mockResolvedValue(undefined)
  mocks.leave.mockResolvedValue(undefined)
  mocks.accept.mockResolvedValue(undefined)
  mocks.reject.mockResolvedValue(undefined)
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'workbench-teams', path: '/workbench/teams', component: TeamsView },
      {
        name: 'workbench-team-detail',
        path: '/workbench/teams/:teamId',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/workbench/teams')
  await router.isReady()
  const wrapper = mount(TeamsView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

/** 读数条上的三个数：我的团队 / 我创建的 / 待处理邀请。 */
const stripValues = (wrapper: Awaited<ReturnType<typeof render>>['wrapper']) =>
  wrapper.findAll('.dev-meta-strip__value').map((node) => node.text())

const teamTitles = (wrapper: Awaited<ReturnType<typeof render>>['wrapper']) =>
  wrapper.findAll('.dev-teams__card .dev-stack-item__title').map((node) => node.text())

describe('团队列表页接线', () => {
  it('列表按 team_id 倒序渲染，读数条三个数各按自己的口径', async () => {
    mocks.invitations.mockResolvedValue([invitationOf()])

    const { wrapper } = await render()

    expect(teamTitles(wrapper)).toEqual(['新团队', '中间团队', '旧团队'])
    // 3 个团队、其中 2 个所有者是 alice、1 条待处理邀请
    expect(stripValues(wrapper)).toEqual(['3', '2', '1'])
    expect(wrapper.findAll('.dev-teams__invitations .dev-stack-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('由 bob 邀请')
    wrapper.unmount()
  })

  it('关键词即时收窄列表，并给出「筛选出 X / Y 个」', async () => {
    const { wrapper } = await render()
    expect(wrapper.find('.dev-toolbar__hint').exists()).toBe(false)

    await wrapper.find('.dev-toolbar__search input').setValue('资源')
    await flushPromises()

    // 命中的是简介（「做资源整合」），不是团队名
    expect(teamTitles(wrapper)).toEqual(['新团队'])
    expect(wrapper.find('.dev-toolbar__hint').text()).toContain('筛选出 1 / 3 个')
    wrapper.unmount()
  })

  it('别人的团队给「退出」、自己的给「解散」，各自打到对应接口并就地移除该行', async () => {
    const { wrapper } = await render()

    // 第一行是 bob 的团队：非所有者，只有「退出」
    const otherRow = wrapper.findAll('.dev-teams__card')[0]
    expect(otherRow?.find('.dev-btn--danger').exists()).toBe(false)
    await otherRow?.find('.dev-btn--ghost').trigger('click')
    await flushPromises()
    expect(mocks.leave).toHaveBeenCalledWith('test-token', 3)
    expect(teamTitles(wrapper)).toEqual(['中间团队', '旧团队'])

    // 自己的团队给「解散」（退出后剩下的是中间团队 2 / 旧团队 1，第一行是自己的）
    const ownRow = wrapper.findAll('.dev-teams__card')[0]
    expect(ownRow?.find('.dev-stack-item__title').text()).toBe('中间团队')
    expect(ownRow?.find('.dev-btn--ghost').exists()).toBe(false)
    await ownRow?.find('.dev-btn--danger').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith('test-token', 2)
    expect(teamTitles(wrapper)).toEqual(['旧团队'])
    wrapper.unmount()
  })

  it('点整行去团队详情', async () => {
    const { wrapper, router } = await render()

    await wrapper.findAll('.dev-teams__card')[0]?.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/workbench/teams/3')
    wrapper.unmount()
  })

  it('创建团队：弹窗里的名称 trim 后提交，成功后跳新团队详情', async () => {
    const { wrapper, router } = await render()

    await wrapper.find('.dev-card-head__actions .dev-btn--primary').trigger('click')
    await flushPromises()

    const nameInput = document.querySelector<HTMLInputElement>('.dev-dialog input')
    expect(nameInput).toBeTruthy()
    nameInput!.value = '  七星团队  '
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const submit = [...document.querySelectorAll<HTMLElement>('.dev-dialog button')].find(
      (button) => button.textContent?.trim() === '创建',
    )
    submit!.click()
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', { name: '七星团队', description: '' })
    expect(router.currentRoute.value.fullPath).toBe('/workbench/teams/9')
    wrapper.unmount()
  })

  it('接受邀请后重拉团队列表；拒绝只摘掉这一条', async () => {
    mocks.invitations.mockResolvedValue([
      invitationOf({ id: 11 }),
      invitationOf({ id: 12, team_name: '另一个团队' }),
    ])
    const { wrapper } = await render()
    expect(wrapper.findAll('.dev-teams__invitations .dev-stack-item')).toHaveLength(2)

    const acceptButtons = wrapper.findAll('.dev-teams__invitations .dev-btn--primary')
    await acceptButtons[0]?.trigger('click')
    await flushPromises()
    expect(mocks.accept).toHaveBeenCalledWith('test-token', 11)
    // 进页 1 次 + 接受后重拉 1 次
    expect(mocks.list).toHaveBeenCalledTimes(2)

    const rejectButtons = wrapper.findAll('.dev-teams__invitations .dev-btn--ghost')
    await rejectButtons[0]?.trigger('click')
    await flushPromises()
    expect(mocks.reject).toHaveBeenCalledWith('test-token', 12)
    // 邀请清空后整块不再渲染
    expect(wrapper.find('.dev-teams__invitations').exists()).toBe(false)
    wrapper.unmount()
  })
})
