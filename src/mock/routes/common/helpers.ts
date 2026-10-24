import type { UserRealnameVerification } from '@/api/realname'

import { currentMockProfile } from '../../identity'

export function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** 账号设置：跟着当前 mock 身份走，切换身份后资料也跟着换。 */
export const profileOverrides: Record<'client' | 'dev', Record<string, unknown>> = {
  client: {},
  dev: {},
}

export function currentUsername(): string {
  return currentMockProfile().username
}

export function buildProfile() {
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

  return { ...base, ...profileOverrides[profile.id] }
}

/** 实名认证：两个身份都已通过，避免被 requiresRealname 的路由弹去认证页。 */
export function realnameRecord(): UserRealnameVerification {
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
