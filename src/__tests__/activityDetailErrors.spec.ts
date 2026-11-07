import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import ActivityDetailView from '@/views/ActivityDetailView.vue'
import { activityDetail } from './fixtures/activity'

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  signup: vi.fn(),
  redeem: vi.fn(),
  sync: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/activities')>()),
  getActivityDetail: mocks.detail,
  signupActivity: mocks.signup,
  redeemActivityKey: mocks.redeem,
  syncMyActivityRewards: mocks.sync,
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: mocks.success,
      error: mocks.error,
      warning: mocks.warning,
      info: mocks.info,
    },
  }
})

let wrapper: VueWrapper | undefined

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      {
        path: '/workbench/activities/:code',
        name: 'workbench-activity-detail',
        component: { template: '<div />' },
      },
      {
        path: '/workbench/badges',
        name: 'workbench-badges',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/workbench/activities/newbie')
  const auth = useAuthStore()
  auth.hydrated = true
  auth.token = 'activity-token'
  auth.username = 'tester'
  wrapper = mount(ActivityDetailView, { global: { plugins: [router] } })
  await flushPromises()
}

function button(label: string) {
  const found = wrapper!.findAll('button').find((item) => item.text() === label)
  expect(found).toBeDefined()
  return found!
}

const signupActivity = activityDetail({
  id: '2',
  code: 'newbie',
  title: '新人体验官',
  activity_type: 'general',
  signup_enabled: true,
  key_enabled: false,
  quota_total: 100,
  quota_used: 30,
  quota_remaining: 70,
  quota_per_user: 1,
  my_quota: 0,
  my_participation: null,
  my_rewards: [],
  my_payouts: [],
  invite_summary: null,
})

const keyActivity = activityDetail({
  id: '3',
  code: 'keyonly',
  title: '兑换专场',
  activity_type: 'general',
  signup_enabled: false,
  key_enabled: true,
  quota_total: 50,
  quota_used: 48,
  quota_remaining: 2,
  quota_per_user: 3,
  my_quota: 0,
  my_participation: null,
  my_rewards: [],
  my_payouts: [],
  invite_summary: null,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.sync.mockResolvedValue({
    items: [],
    payouts: [],
    summary: { pending_fen: 0, transferring_fen: 0, paid_fen: 0 },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('活动报名与兑换的错误提示', () => {
  it('未实名时在报名按钮旁提示去实名', async () => {
    mocks.detail.mockResolvedValue(signupActivity)
    mocks.signup.mockRejectedValue(new HttpError(409, '活动要求实名认证', 'REALNAME_REQUIRED'))

    await render()
    await button('立即报名').trigger('click')
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledWith('请先完成实名认证')
    expect(wrapper!.text()).toContain('请先完成实名认证')
  })

  it('账号非 active 时在兑换框旁提示', async () => {
    mocks.detail.mockResolvedValue(keyActivity)
    mocks.redeem.mockRejectedValue(new HttpError(403, '账号不可用', 'ACCOUNT_INACTIVE'))

    await render()
    await wrapper!.find('input').setValue('KEYONLY-8888')
    await button('兑换').trigger('click')
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledWith('账号当前不可参与活动')
    expect(wrapper!.text()).toContain('账号当前不可参与活动')
  })
})
