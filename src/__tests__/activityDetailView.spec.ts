import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import ActivityDetailView from '@/views/ActivityDetailView.vue'
import {
  activityDetail,
  activityParticipation,
  activityPayout,
  activityReward,
} from './fixtures/activity'

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  signup: vi.fn(),
  redeem: vi.fn(),
  sync: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  toDataURL: vi.fn(),
  wechat: false,
}))

vi.mock('@/api/activities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/activities')>()),
  getActivityDetail: mocks.detail,
  signupActivity: mocks.signup,
  redeemActivityKey: mocks.redeem,
  syncMyActivityRewards: mocks.sync,
}))

vi.mock('@/shared/auth/browser', () => ({ isWechatBrowser: () => mocks.wechat }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))
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
    TDialog: {
      props: ['open', 'title', 'width'],
      template: '<div v-if="open" class="dialog-stub"><slot /></div>',
    },
  }
})

let wrapper: VueWrapper | undefined

async function render(path = '/workbench/activities/invite-reward') {
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
  await router.push(path)
  const auth = useAuthStore()
  auth.hydrated = true
  auth.token = 'activity-token'
  auth.username = 'tester'
  wrapper = mount(ActivityDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

function button(label: string) {
  const found = wrapper!.findAll('button').find((item) => item.text() === label)
  expect(found).toBeDefined()
  return found!
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.wechat = false
  mocks.detail.mockResolvedValue(activityDetail())
  mocks.sync.mockResolvedValue({
    items: [],
    payouts: [],
    summary: { pending_fen: 0, transferring_fen: 0, paid_fen: 0 },
  })
  mocks.toDataURL.mockResolvedValue('data:image/png;base64,qr')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('活动详情', () => {
  it('报名成功后名额减少、奖励出现并生成待确认转账单', async () => {
    const joinedReward = activityReward({
      id: '201',
      activity_id: '2',
      activity_code: 'newbie',
      activity_title: '新人体验官',
      amount_fen: 300,
      source: 'signup',
      status: 'transferring',
      status_text: '发放中',
    })
    const joinedPayout = activityPayout({
      activity_id: '2',
      activity_title: '新人体验官',
    })
    const participation = activityParticipation({
      activity_id: '2',
      first_source: 'signup',
    })
    const before = activityDetail({
      id: '2',
      code: 'newbie',
      title: '新人体验官',
      subtitle: '报名领 3 元现金奖励',
      activity_type: 'general',
      signup_enabled: true,
      key_enabled: true,
      quota_total: 100,
      quota_used: 30,
      quota_remaining: 70,
      quota_per_user: 1,
      reward_amount_fen: 300,
      my_quota: 0,
      my_reward_pending_fen: 0,
      my_reward_paid_fen: 0,
      my_participation: null,
      my_rewards: [],
      my_payouts: [],
      invite_summary: null,
    })
    mocks.detail.mockResolvedValue(before)
    mocks.signup.mockResolvedValue({
      activity: {
        ...before,
        quota_used: 31,
        quota_remaining: 69,
        my_quota: 1,
        my_reward_pending_fen: 300,
        my_participation: participation,
        my_rewards: [joinedReward],
        my_payouts: [joinedPayout],
      },
      participation,
      rewards: [joinedReward],
      payouts: [joinedPayout],
    })

    await render('/workbench/activities/newbie')
    expect(wrapper!.text()).toContain('报名领 3 元现金奖励')
    await button('立即报名').trigger('click')
    await flushPromises()
    expect(mocks.signup).toHaveBeenCalledWith('activity-token', 'newbie')
    expect(mocks.success).toHaveBeenCalledWith('报名成功')
    expect(wrapper!.text()).toContain('剩余 69 / 100')
    expect(wrapper!.text()).toContain('发放中')
    expect(wrapper!.text()).toContain('¥3.00')
    expect(wrapper!.text()).toContain('我的参与')
    expect(button('已报名').attributes('disabled')).toBeDefined()
    expect(button('确认收款')).toBeDefined()
  })

  it('已暂停、已结束与名额已满时报名按钮禁用', async () => {
    mocks.detail.mockResolvedValue(activityDetail({ phase: 'paused', signup_enabled: true }))
    await render('/workbench/activities/paused-demo')
    const paused = button('活动已暂停')
    expect(paused.attributes('disabled')).toBeDefined()

    wrapper!.unmount()
    mocks.detail.mockResolvedValue(activityDetail({ phase: 'ended', signup_enabled: true }))
    await render('/workbench/activities/ended')
    const ended = button('活动已结束')
    expect(ended.attributes('disabled')).toBeDefined()

    wrapper!.unmount()
    mocks.detail.mockResolvedValue(
      activityDetail({
        id: '4',
        code: 'full-house',
        title: '限量福利',
        activity_type: 'general',
        quota_total: 20,
        quota_used: 20,
        quota_remaining: 0,
        signup_enabled: true,
        my_quota: 0,
      }),
    )
    await render('/workbench/activities/full-house')
    const full = button('名额已满')
    expect(full.attributes('disabled')).toBeDefined()
    expect(mocks.signup).not.toHaveBeenCalled()
  })

  it('输入 key 兑换名额，错误码给对应文案', async () => {
    const keyonly = activityDetail({
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
      reward_amount_fen: 200,
      my_quota: 0,
      my_reward_pending_fen: 0,
      my_reward_paid_fen: 0,
      my_participation: null,
      my_rewards: [],
      my_payouts: [],
      invite_summary: null,
    })
    const keyReward = activityReward({
      id: '301',
      activity_id: '3',
      activity_code: 'keyonly',
      activity_title: '兑换专场',
      amount_fen: 200,
      source: 'key',
    })
    const keyParticipation = activityParticipation({
      activity_id: '3',
      first_source: 'key',
    })
    mocks.detail.mockResolvedValue(keyonly)
    mocks.redeem.mockResolvedValue({
      activity: {
        ...keyonly,
        quota_used: 49,
        quota_remaining: 1,
        my_quota: 1,
        my_reward_pending_fen: 200,
        my_participation: keyParticipation,
        my_rewards: [keyReward],
      },
      participation: keyParticipation,
      rewards: [keyReward],
      payouts: [],
    })

    await render('/workbench/activities/keyonly')
    await wrapper!.find('input').setValue('73INFO-2026')
    await button('兑换').trigger('click')
    await flushPromises()
    expect(mocks.redeem).toHaveBeenCalledWith('activity-token', '73INFO-2026')
    expect(mocks.success).toHaveBeenCalledWith('兑换成功')
    expect(wrapper!.text()).toContain('¥2.00')
    expect(wrapper!.text()).toContain('我的名额')

    mocks.redeem.mockRejectedValue(new HttpError(409, '兑换码已被使用', 'KEY_USED'))
    await wrapper!.find('input').setValue('USED-KEY')
    await button('兑换').trigger('click')
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledWith('兑换码已被使用')
  })

  it('非微信环境确认收款时给出扫码入口', async () => {
    const payout = activityPayout()
    mocks.sync.mockResolvedValue({
      items: [activityReward({ status: 'transferring', status_text: '发放中' })],
      payouts: [payout],
      summary: { pending_fen: 0, transferring_fen: 300, paid_fen: 0 },
    })

    await render('/workbench/activities/invite-reward')
    expect(wrapper!.text()).toContain('待发放')

    await button('确认收款').trigger('click')
    await flushPromises()

    expect(mocks.sync).toHaveBeenCalledWith('activity-token')
    expect(mocks.toDataURL).toHaveBeenCalled()
    expect(String(mocks.toDataURL.mock.calls[0]?.[0])).toContain('activityReward=confirm')
    expect(wrapper!.text()).toContain('请在微信中扫码打开本页确认收款')
  })
})
