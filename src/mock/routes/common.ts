/**
 * 通用页面的接口：账号设置、实名认证、积分、客服工单、优惠券、社区、支付渠道可用性。
 *
 * 这一域的假数据刻意做「保守但可用」：实名认证与开发者资格一律返回已通过，
 * 否则每进一个需要实名的页面都会被路由守卫弹走，mock 就没法用来预览页面了；
 * 第三方能力（爱签、微信扫码、社区发帖审核）返回占位结果，不假装真的接通了外部服务。
 */

import type { UserPointsSelf } from '@/api/points'
import type { UserRealnameVerification } from '@/api/realname'

import { communityPosts, coupons, points } from '../db'
import { currentMockProfile } from '../identity'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, noContentResponse, textResponse } from '../response'

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** 账号设置：跟着当前 mock 身份走，切换身份后资料也跟着换。 */
const profileOverrides: Record<'client' | 'dev', Record<string, unknown>> = {
  client: {},
  dev: {},
}

function currentUsername(): string {
  return currentMockProfile().username
}

function buildProfile() {
  const profile = currentMockProfile()
  const base = {
    username: profile.username,
    profile_description: `${profile.label}演示账号（mock）`,
    email: profile.email,
    avatar_url: null as string | null,
    home_background_static: null as string | null,
    home_background_dynamic: null as string | null,
    home_background_static_focus: null as string | null,
    home_background_dynamic_focus: null as string | null,
    two_factor_enabled: false,
    subscribe_official_activity: true,
    subscribe_dev_hall_deposit_paid: profile.id === 'dev',
    wechat_bound: false,
  }

  return { ...base, ...(profileOverrides[profile.id] ?? {}) }
}

/** 实名认证：两个身份都已通过，避免被 requiresRealname 的路由弹去认证页。 */
function realnameRecord(): UserRealnameVerification {
  const profile = currentMockProfile()

  return {
    username: profile.username,
    auth_type: 'IDENTITY_CARD',
    status: 'approved',
    real_name: profile.nickname.replace(/^柒参演示·/, ''),
    // 与真实后端一致：本人可见的证件号 / 手机号（企业认证回填经办人用），另附脱敏值
    id_card_no: profile.id === 'dev' ? '110101199206185678' : '330601199206181234',
    id_card_no_masked: profile.id === 'dev' ? '1101**********5678' : '3306**********1234',
    birthday: '1992-06-18',
    mobile: profile.phone,
    mobile_masked: `${profile.phone.slice(0, 3)}****${profile.phone.slice(-4)}`,
    company_name: null,
    unified_social_credit_code: null,
    business_license_no: null,
    business_license_file: null,
    operator_name: null,
    operator_id_card_no_masked: null,
    company_prov_code: null,
    company_area_code: null,
    company_address: null,
    business_scope: null,
    business_license_expires_on: null,
    legal_cert_expires_on: null,
    guardian_consent: null,
    guardian_consent_file: null,
    review_note: null,
    reviewed_by: 'admin_demo',
    reviewed_by_avatar_url: null,
    reviewed_at: nowText(),
    created_at: nowText(),
    updated_at: nowText(),
    changing_subject: false,
  }
}

/** 开发者信用额度：mock 给足，避免需求大厅的接单按钮被「信用不足」挡住。 */
function devCreditSelf() {
  return {
    username: currentUsername(),
    credit_score: 120,
    cny_per_credit: 1000,
    max_deposit_cny: 200000,
    max_order_amount_cny: 200000,
    remaining_deposit_cap_cny: 200000,
    enforce_deposit_limit: false,
    enforce_order_limit: false,
  }
}

function pointsSelf(): UserPointsSelf {
  return {
    username: currentUsername(),
    points_balance: points.balance,
    logs: [
      {
        id: 1,
        username: currentUsername(),
        delta: 50,
        balance_after: points.balance,
        reason: '每日签到',
        source_type: 'checkin',
        source_id: null,
        operator: null,
        created_at: nowText(),
      },
    ],
    logs_total: 1,
    logs_page: 1,
    logs_page_size: 20,
    username_gradient_owned: false,
    username_gradient: false,
    perks: [],
  }
}

const routes: MockRoute[] = [
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

      return jsonResponse({ username: (store.username as string | undefined) ?? profile.username, token: '' })
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
        subscribe_official_activity: (store.subscribe_official_activity as boolean | undefined) ?? true,
        subscribe_dev_hall_deposit_paid:
          (store.subscribe_dev_hall_deposit_paid as boolean | undefined) ?? profile.id === 'dev',
      })
    },
  },
  {
    method: 'GET',
    path: '/settings/deposit-ratio',
    note: '平台分成比例（发布需求页要显示定金比例）',
    handler: () => jsonResponse({ deposit_ratio_percent: 20, min_percent: 5, max_percent: 50 }),
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

  /* ---------------------------------------------------------------- 实名认证 */
  {
    method: 'GET',
    path: '/realname/me',
    note: '我的实名认证状态（已通过）',
    handler: () => jsonResponse(realnameRecord()),
  },
  {
    method: 'POST',
    path: '/realname/',
    note: '提交实名认证：mock 直接通过',
    handler: () => jsonResponse(realnameRecord()),
  },
  {
    method: 'POST',
    path: '/realname/withdraw',
    note: '撤回实名认证',
    handler: () => jsonResponse({ withdrawn: true, restored: false }),
  },
  {
    method: 'POST',
    path: '/realname/faceid/wechat/start',
    note: '微信人脸核身（占位，不发真实请求）',
    handler: () =>
      jsonResponse({
        verification: realnameRecord(),
        order_no: 'MOCK-FACEID-ORDER',
        biz_token: 'MOCK-FACEID-TOKEN',
        auth_url: '',
        expires_in_seconds: 600,
      }),
  },
  {
    method: 'POST',
    path: '/realname/faceid/wechat/result',
    note: '微信人脸核身结果：mock 视为通过',
    handler: () => jsonResponse(realnameRecord()),
  },
  {
    method: 'POST',
    path: '/realname/asign/start',
    note: '爱签实名（占位）',
    handler: () =>
      jsonResponse({
        auth_url: '',
        biz_id: 'MOCK-ASIGN-BIZ',
        manual_review: false,
      }),
  },
  {
    method: 'POST',
    path: '/realname/asign/company/start',
    note: '爱签企业实名（占位）',
    handler: () =>
      jsonResponse({
        auth_url: '',
        biz_id: 'MOCK-ASIGN-COMPANY-BIZ',
      }),
  },
  {
    method: 'POST',
    path: '/realname/asign/resume',
    note: '恢复实名二维码（占位）',
    handler: () =>
      jsonResponse({
        auth_url: '',
        biz_id: 'MOCK-ASIGN-BIZ',
        manual_review: false,
      }),
  },
  {
    method: 'POST',
    path: '/realname/asign/company/resume',
    note: '恢复企业实名二维码（占位）',
    handler: () =>
      jsonResponse({
        auth_url: '',
        biz_id: 'MOCK-ASIGN-COMPANY-BIZ',
      }),
  },
  {
    method: 'POST',
    path: '/realname/asign/result',
    note: '爱签实名结果：mock 视为通过',
    handler: () => jsonResponse(realnameRecord()),
  },
  {
    method: 'POST',
    path: '/realname/consent-file',
    note: '上传监护人同意书（mock 只回一个假路径）',
    handler: () => jsonResponse({ guardian_consent_file: '/uploads/mock-consent.pdf' }),
  },
  {
    method: 'POST',
    path: '/realname/business-license-file',
    note: '上传营业执照（mock 只回一个假路径）',
    handler: () => jsonResponse({ business_license_file: '/uploads/mock-license.pdf' }),
  },

  /* ---------------------------------------------------------------- 积分 */
  {
    method: 'GET',
    path: '/points/me',
    note: '我的积分',
    handler: () => jsonResponse(pointsSelf()),
  },
  {
    method: 'GET',
    path: '/points/checkin/status',
    note: '签到状态（首页会拉这个接口）',
    handler: () => {
      const self = pointsSelf()

      return jsonResponse({
        username: self.username,
        today_checked_in: false,
        streak_count: 3,
        today_potential: 20,
      })
    },
  },
  {
    method: 'POST',
    path: '/points/checkin',
    note: '签到：加积分并返回奖励明细',
    handler: () => {
      points.balance += 20

      return jsonResponse({
        username: currentUsername(),
        checkin_date: nowText().slice(0, 10),
        streak_count: 4,
        points_awarded: 10,
        streak_bonus: 5,
        week_bonus: 5,
        month_bonus: 0,
        total_awarded: 20,
        already_checked_in: false,
      })
    },
  },
  {
    method: 'GET',
    path: '/points/mall/products',
    note: '积分商城商品：演示数据不给商品，避免兑换出假权益',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/points/mall/orders',
    note: '兑换记录',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/points/mall/gradient',
    note: '用户名渐变状态',
    handler: () => {
      const self = pointsSelf()

      return jsonResponse({
        username: self.username,
        username_gradient_owned: self.username_gradient_owned,
        username_gradient: self.username_gradient,
      })
    },
  },
  {
    method: 'POST',
    path: '/points/appearance/username',
    note: '设置用户名展示样式',
    handler: () => jsonResponse(pointsSelf()),
  },
  {
    method: 'GET',
    path: '/points/transfer/meta',
    note: '积分打赏规则',
    handler: () =>
      jsonResponse({
        fee_rate: 0.01,
        daily_cap: 5000,
        receive_daily_cap: 20000,
        new_user_cap: 500,
        new_user_min_days: 7,
      }),
  },
  {
    method: 'GET',
    path: '/points/transfers',
    note: '我的积分打赏记录',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/points/transfer',
    note: '打赏积分',
    handler: () => jsonResponse({ transferred: true }),
  },

  /* ---------------------------------------------------------------- 客服 */
  {
    method: 'GET',
    path: '/support/channels/public',
    note: '客服渠道开关（首页在线客服浮窗据此显示）',
    handler: () =>
      jsonResponse([{ channel_key: 'online', label: '在线客服', enabled: true }]),
  },
  {
    method: 'GET',
    path: '/support/conversations/mine',
    note: '我的客服会话',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/support/conversations/:id',
    note: '会话详情',
    handler: (_request, params) =>
      textResponse(`mock 没有会话 ${params.id ?? ''}`, 404),
  },
  {
    method: 'POST',
    path: '/support/conversations',
    note: '创建客服会话：mock 回一条占位会话，不接客服系统',
    handler: (request) => {
      const body = (request.body ?? {}) as { content?: string }

      return jsonResponse({
        id: 1,
        conversation_no: 'MOCK-SUPPORT-1',
        user_username: currentUsername(),
        user_role: currentMockProfile().role,
        agent_username: null,
        status: 'open',
        priority: 'normal',
        last_message: body.content ?? '',
        last_message_at: nowText(),
        last_message_by: currentUsername(),
        unread_agent: 1,
        unread_user: 0,
        agent_last_read_message_id: null,
        user_last_read_message_id: null,
        created_at: nowText(),
        updated_at: nowText(),
      })
    },
  },
  {
    method: 'POST',
    path: '/support/conversations/:id/messages',
    note: '发消息（mock 只回显，不连客服系统）',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { content?: string }

      return jsonResponse({
        id: Date.now(),
        conversation_id: Number(params.id) || 1,
        sender_username: currentUsername(),
        sender_role: 'user',
        content: body.content ?? '',
        created_at: nowText(),
      })
    },
  },

  /* ---------------------------------------------------------------- 支付渠道与社区 */
  {
    method: 'GET',
    path: '/adapay/availability',
    note: '电签担保可用性：mock 一律可用，发布需求时能选到担保模式',
    handler: () =>
      jsonResponse({ enabled: true, paymentReady: true, escrowBetaOnly: false, escrowAllowed: true }),
  },
  {
    method: 'GET',
    path: '/community/posts',
    note: '社区帖子列表',
    handler: () => jsonResponse(communityPosts),
  },
  {
    method: 'GET',
    path: '/community/posts/:id',
    note: '社区帖子详情',
    handler: (_request, params) => {
      const post = communityPosts.find((item) => String(item.id) === params.id)
      return post ? jsonResponse(post) : textResponse('帖子不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/community/tags',
    note: '社区标签',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/coupons/available',
    note: '我的可用优惠券',
    handler: () => jsonResponse(coupons),
  },
  {
    method: 'GET',
    path: '/teams/invitations',
    note: '我的团队邀请（演示数据没有团队邀请）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/teams/teams',
    note: '我的团队（演示数据没有团队）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/badges/user/:username',
    note: '用户徽章：形状对、内容为空（不做假徽章，避免看起来像真的获得了权益）',
    handler: () => jsonResponse({ badges: [] }),
  },
  {
    method: 'GET',
    path: '/dev/credit/me',
    note: '开发者信用：额度放宽，否则需求大厅的接单按钮会被「信用不足」挡住',
    handler: () => jsonResponse(devCreditSelf()),
  },
]

export const commonRoutes = defineRouteTable('common', routes)
