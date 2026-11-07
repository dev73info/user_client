import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import ActivityCenterView from '@/views/ActivityCenterView.vue'
import { activitySummary } from './fixtures/activity'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/activities')>()),
  listActivities: mocks.list,
}))

let wrapper: VueWrapper | undefined

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      {
        path: '/workbench/activities',
        name: 'workbench-activities',
        component: ActivityCenterView,
      },
      {
        path: '/workbench/activities/rewards',
        name: 'workbench-activity-rewards',
        component: { template: '<div />' },
      },
      {
        path: '/workbench/activities/:code',
        name: 'workbench-activity-detail',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/workbench/activities')
  const auth = useAuthStore()
  auth.hydrated = true
  auth.token = 'activity-token'
  auth.username = 'tester'
  wrapper = mount(ActivityCenterView, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.list.mockResolvedValue({
    items: [
      activitySummary(),
      activitySummary({
        id: '2',
        code: 'newbie',
        title: '新人体验官',
        subtitle: '报名领 3 元现金奖励',
        activity_type: 'general',
        quota_total: 100,
        quota_used: 30,
        quota_remaining: 70,
        reward_amount_fen: 300,
        signup_enabled: true,
        key_enabled: true,
        my_quota: 0,
        my_reward_pending_fen: 0,
        my_reward_paid_fen: 0,
      }),
      activitySummary({
        id: '5',
        code: 'ended',
        title: '国庆活动',
        phase: 'ended',
        my_quota: 0,
        my_reward_pending_fen: 0,
        my_reward_paid_fen: 0,
      }),
    ],
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('活动中心', () => {
  it('展示活动标题、时间、名额、奖励与我的参与状态', async () => {
    await render()

    expect(mocks.list).toHaveBeenCalledWith('activity-token')
    const text = wrapper!.text()
    expect(text).toContain('邀请有礼')
    expect(text).toContain('新人体验官')
    expect(text).toContain('剩余 372 / 500')
    expect(text).toContain('¥5.00')
    expect(text).toContain('我的名额 1')
    expect(text).toContain('我的奖励 ¥8.00')
    expect(text).toContain('未参与')
    expect(text).toContain('进行中')
    expect(text).toContain('已结束')
  })

  it('点活动卡片进入详情', async () => {
    const router = await render()

    const card = wrapper!.findAll('.activity-card')[0]!
    expect(card.text()).toContain('邀请有礼')
    await card.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('workbench-activity-detail')
    expect(router.currentRoute.value.params.code).toBe('invite')
  })

  it('加载失败给重试入口', async () => {
    mocks.list.mockRejectedValue(new Error('网络异常'))
    await render()

    expect(wrapper!.text()).toContain('网络异常')
    const retry = wrapper!.findAll('button').find((item) => item.text() === '重试')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
})
