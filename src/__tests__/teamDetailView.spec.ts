import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import TeamDetailView from '@/views/TeamDetailView.vue'

/**
 * 团队详情页拆分后的接线回归：页面自己只剩排版，动作都在 `useTeamDetail` 里、
 * 由资料卡 / 成员卡的组件事件转上去。这里按用户的实际操作点一遍，确认「组件事件 → composable → 接口」
 * 这条链在这几处都没有断（拆分前这些逻辑同在一个文件里，搬开时最容易漏接或接错参数）。
 */
const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  update: vi.fn(),
  invite: vi.fn(),
  role: vi.fn(),
  remove: vi.fn(),
  transfer: vi.fn(),
  avatar: vi.fn(),
}))

vi.mock('@/api/team', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/team')>()
  return {
    ...actual,
    getTeamDetail: mocks.detail,
    updateTeam: mocks.update,
    inviteMember: mocks.invite,
    updateMemberRole: mocks.role,
    removeMember: mocks.remove,
    transferTeamOwner: mocks.transfer,
    uploadTeamAvatar: mocks.avatar,
  }
})

const team = {
  team_id: 1,
  name: '七星团队',
  description: '做资源整合',
  avatar_url: null,
  owner_username: 'alice',
  members: [
    { username: 'alice', role: 'owner', joined_at: '2026-10-01', avatar_url: null },
    { username: 'bob', role: 'admin', joined_at: '2026-10-02', avatar_url: null },
    { username: 'carol', role: 'member', joined_at: '2026-10-03', avatar_url: null },
  ],
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', () => true)
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  // 每次取详情都给一份新的：视图会把取回来的团队对象就地改（改名、移除成员），共用一份会串场
  mocks.detail.mockImplementation(async () => JSON.parse(JSON.stringify(team)))
  mocks.update.mockImplementation(async () => ({ name: '新名字', description: '新简介' }))
  mocks.invite.mockResolvedValue(undefined)
  mocks.role.mockResolvedValue({ username: 'bob', role: 'member' })
  mocks.remove.mockResolvedValue(undefined)
  mocks.transfer.mockResolvedValue({ owner_username: 'bob' })
  mocks.avatar.mockResolvedValue({ avatar_url: '/media/a.png' })
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'dev-team-detail', path: '/dev/teams/:teamId', component: TeamDetailView },
      { name: 'workbench-teams', path: '/workbench/teams', component: { template: '<div />' } },
      { name: 'dev-profile', path: '/dev/profile/:username', component: { template: '<div />' } },
    ],
  })
  router.push('/dev/teams/1')
  await router.isReady()
  const wrapper = mount(TeamDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('团队详情页接线', () => {
  it('编辑资料：提交的是 trim 过的值，存完卡片头跟着更新', async () => {
    const { wrapper } = await render()

    await wrapper.find('.dev-card-head__actions .dev-btn--ghost').trigger('click')
    // 表单模型按打开那一刻的资料初始化
    expect((wrapper.find('.dev-team-detail__form input').element as HTMLInputElement).value).toBe(
      '七星团队',
    )
    await wrapper.find('.dev-team-detail__form input').setValue('  新名字  ')
    await wrapper.find('.dev-team-detail__form textarea').setValue('  新简介  ')
    await wrapper.find('.dev-team-detail__form-actions .dev-btn--primary').trigger('click')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledWith('test-token', 1, {
      name: '新名字',
      description: '新简介',
    })
    expect(wrapper.find('.dev-section-title').text()).toBe('新名字')
    expect(wrapper.find('.dev-team-detail__form').exists()).toBe(false)
  })

  it('邀请成员：发送后收起邀请行并清空输入', async () => {
    const { wrapper } = await render()
    const inviteButton = () => {
      const buttons = wrapper.findAll('.dev-card-head__actions .dev-btn--primary')
      return buttons[buttons.length - 1]
    }

    await inviteButton()?.trigger('click')
    await wrapper.find('.dev-team-detail__invite input').setValue('dave')
    await wrapper.find('.dev-team-detail__invite .dev-toolbar__actions button').trigger('click')
    await flushPromises()

    expect(mocks.invite).toHaveBeenCalledWith('test-token', 1, { username: 'dave' })
    expect(wrapper.find('.dev-team-detail__invite').exists()).toBe(false)
    // 邀请行收起后再点开，输入框是空的
    await inviteButton()?.trigger('click')
    expect((wrapper.find('.dev-team-detail__invite input').element as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('成员行动作与换头像各自打到对应接口', async () => {
    const { wrapper, router } = await render()
    const actions = wrapper.findAll('.dev-team-detail__member-actions .dev-btn')

    await actions[0]?.trigger('click')
    await flushPromises()
    expect(mocks.transfer).toHaveBeenCalledWith('test-token', 1, 'bob')

    await actions[1]?.trigger('click')
    await flushPromises()
    expect(mocks.role).toHaveBeenCalledWith('test-token', 1, 'bob', { role: 'member' })

    await actions[2]?.trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith('test-token', 1, 'bob')

    const fileInput = wrapper.find('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', {
      value: [new File(['x'], 'a.png', { type: 'image/png' })],
      configurable: true,
    })
    await fileInput.trigger('change')
    await flushPromises()
    expect(mocks.avatar).toHaveBeenCalledTimes(1)
    expect(mocks.avatar.mock.calls[0]?.slice(0, 2)).toEqual(['test-token', 1])
    expect(mocks.avatar.mock.calls[0]?.[2]).toBeInstanceOf(File)

    // 点成员昵称去 TA 的主页（放在最后：换了路由，teamId 就不再是 1 了）
    await wrapper.find('.dev-team-detail__member-name').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/dev/profile/alice')
  })
})
