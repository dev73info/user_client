import type { MockRoute } from '../../router'

import { jsonResponse } from '../../response'
import { realnameRecord } from './helpers'

export const realnameRoutes: MockRoute[] = [
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
    path: '/realname/asign/quick-start',
    note: '材料认证入口（mock 不伪造真实渠道链接）',
    handler: () => jsonResponse({ auth_url: '', biz_id: null, manual_review: false }),
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
  {
    method: 'POST',
    path: '/realname/operator-cert-front-file',
    note: '上传经办人身份证人像面（mock 只回一个假路径）',
    handler: () => jsonResponse({ front_file: '/uploads/mock-operator-cert.jpg' }),
  },
]
