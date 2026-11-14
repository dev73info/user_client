/**
 * 实名认证域接口。
 *
 * 拆成 verification（我的实名状态 / 提交 / 撤回）、wechatFaceid（微信人脸核身）、
 * asign（爱签个人与企业核身）与 uploads（监护人同意书）；
 * 证照图片只在 quick-start 的 multipart 请求里携带，不走独立上传端点。
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/realname'`。
 */
export type {
  CompleteWechatFaceidVerificationPayload,
  GuardianConsentUploadResponse,
  QuickStartIdentifyFiles,
  QuickStartIdentifyPayload,
  RealnameAuthType,
  StartAsignIdentifyPayload,
  StartAsignIdentifyResponse,
  StartCompanyIdentifyPayload,
  StartCompanyIdentifyResponse,
  StartWechatFaceidVerificationResponse,
  SubmitRealnameVerificationPayload,
  SubmitRealnameVerificationResponse,
  UserRealnameStatus,
  UserRealnameVerification,
  WithdrawRealnameVerificationResponse,
} from './types'

export { REALNAME_ERROR_CODES } from './types'

export {
  getMyRealnameVerification,
  submitMyRealnameVerification,
  withdrawMyRealnameVerification,
} from './verification'

export { completeWechatFaceidVerification, startWechatFaceidVerification } from './wechatFaceid'

export {
  completeAsignIdentify,
  quickStartAsignIdentify,
  resumeAsignIdentify,
  resumeCompanyAsignIdentify,
  startAsignIdentify,
  startCompanyAsignIdentify,
} from './asign'

export { uploadGuardianConsentFile } from './uploads'
