import type { MockRoute } from '../../router'

import { coupons } from '../../db'
import { currentMockProfile } from '../../identity'
import { jsonResponse, noContentResponse } from '../../response'
import { buildProfile, nowText, profileOverrides } from './helpers'

export const accountRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 账号设置 */
  {
    method: 'GET',
    path: '/settings/profile',
    note: '我的资料',
    handler: () => jsonResponse(buildProfile()),
  },
  {
    method: 'PUT',
    path: '/settings/profile',
    note: '修改昵称与简介',
    handler: (request) => {
      const body = (request.body ?? {}) as { username?: string; profile_description?: string }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}

      if (body.username?.trim()) {
        store.username = body.username.trim()
      }
      if (typeof body.profile_description === 'string') {
        store.profile_description = body.profile_description
      }

      profileOverrides[profile.id] = store

      return jsonResponse({
        username: (store.username as string | undefined) ?? profile.username,
        token: '',
      })
    },
  },
  {
    method: 'GET',
    path: '/settings/profile/subscriptions',
    note: '订阅开关',
    handler: () => {
      const profile = buildProfile()
      return jsonResponse({
        subscribe_official_activity: profile.subscribe_official_activity,
        subscribe_dev_hall_deposit_paid: profile.subscribe_dev_hall_deposit_paid,
      })
    },
  },
  {
    method: 'PUT',
    path: '/settings/profile/subscriptions',
    note: '保存订阅开关',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        subscribe_official_activity?: boolean
        subscribe_dev_hall_deposit_paid?: boolean
      }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}

      if (typeof body.subscribe_official_activity === 'boolean') {
        store.subscribe_official_activity = body.subscribe_official_activity
      }
      if (typeof body.subscribe_dev_hall_deposit_paid === 'boolean') {
        store.subscribe_dev_hall_deposit_paid = body.subscribe_dev_hall_deposit_paid
      }

      profileOverrides[profile.id] = store

      return jsonResponse({
        subscribe_official_activity:
          (store.subscribe_official_activity as boolean | undefined) ?? true,
        subscribe_dev_hall_deposit_paid:
          (store.subscribe_dev_hall_deposit_paid as boolean | undefined) ?? profile.id === 'dev',
      })
    },
  },
  {
    method: 'GET',
    path: '/payment/limits/system',
    note: '定金比例与平台费率（发布需求页要显示定金比例；契约只有基点口径）',
    handler: () =>
      jsonResponse({
        deposit_ratio_bps: 2000,
        platform_fee_bps: 1500,
        personal_income_tax_bps: 0,
        customer_breach_tax_bps: 0,
        customer_breach_platform_fee_bps: 0,
        platform_settle_account_id: null,
      }),
  },
  {
    method: 'PUT',
    path: '/settings/profile/background-static',
    note: '设置静态主页背景',
    handler: (request) => {
      const body = (request.body ?? {}) as { image_url?: string; focus?: string }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}
      store.home_background_static = body.image_url ?? null
      store.home_background_static_focus = body.focus ?? null
      profileOverrides[profile.id] = store

      return jsonResponse(buildProfile())
    },
  },
  {
    method: 'PUT',
    path: '/settings/profile/background-dynamic',
    note: '设置动态主页背景',
    handler: (request) => {
      const body = (request.body ?? {}) as { image_url?: string; focus?: string }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}
      store.home_background_dynamic = body.image_url ?? null
      store.home_background_dynamic_focus = body.focus ?? null
      profileOverrides[profile.id] = store

      return jsonResponse(buildProfile())
    },
  },
  {
    method: 'POST',
    path: '/settings/profile/background-static/upload',
    note: '上传静态背景（mock 不存文件，回显资料）',
    handler: () => jsonResponse(buildProfile()),
  },
  {
    method: 'POST',
    path: '/settings/profile/background-dynamic/upload',
    note: '上传动态背景（mock 不存文件）',
    handler: () => jsonResponse(buildProfile()),
  },
  {
    method: 'POST',
    path: '/settings/profile/avatar',
    note: '上传头像（mock 不存文件）',
    handler: () => jsonResponse(buildProfile()),
  },
  {
    method: 'POST',
    path: '/settings/profile/email-code',
    note: '发送改绑邮箱验证码',
    handler: () => noContentResponse(),
  },
  {
    method: 'PUT',
    path: '/settings/profile/email',
    note: '改绑邮箱',
    handler: (request) => {
      const body = (request.body ?? {}) as { new_email?: string }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}
      if (body.new_email?.trim()) {
        store.email = body.new_email.trim()
      }
      profileOverrides[profile.id] = store

      return jsonResponse(buildProfile())
    },
  },
  {
    method: 'POST',
    path: '/settings/profile/password-code',
    note: '发送改密验证码',
    handler: () => noContentResponse(),
  },
  {
    method: 'PUT',
    path: '/settings/profile/password',
    note: '修改密码（mock 不改任何凭据）',
    handler: () => noContentResponse(),
  },
  {
    method: 'POST',
    path: '/settings/profile/two-factor-code',
    note: '发送两步验证验证码',
    handler: () => noContentResponse(),
  },
  {
    method: 'PUT',
    path: '/settings/profile/two-factor',
    note: '开关两步验证',
    handler: (request) => {
      const body = (request.body ?? {}) as { enabled?: boolean }
      const profile = currentMockProfile()
      const store = profileOverrides[profile.id] ?? {}
      store.two_factor_enabled = body.enabled === true
      profileOverrides[profile.id] = store

      return jsonResponse(buildProfile())
    },
  },
  {
    method: 'POST',
    path: '/settings/activity-campaigns/claim',
    note: '领取活动券',
    handler: () => {
      const coupon = coupons[0]

      return jsonResponse({
        activity_id: 1,
        title: 'mock 活动：发布需求领券',
        coupon_type: coupon?.discount_type ?? 'amount',
        coupon_name: coupon?.name ?? 'mock 优惠券',
        assigned_coupon_code: coupon?.code ?? 'MOCK-COUPON',
        claimed_at: nowText(),
        already_claimed: false,
        points_awarded: 50,
      })
    },
  },
]
