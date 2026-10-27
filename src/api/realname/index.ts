/**
 * 实名认证域接口。
 *
 * 拆成 verification（我的实名状态 / 提交 / 撤回）、wechatFaceid（微信人脸核身）、
 * asign（爱签个人与企业核身）、uploads（监护人同意书 / 营业执照 / 法人证件照片）、
 * ocr（营业执照与法人证件有效期识别）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/realname'`。
 */
export type {
  BusinessLicenseOcrResult,
  BusinessLicenseUploadResponse,
  CompleteWechatFaceidVerificationPayload,
  GuardianConsentUploadResponse,
  LegalCertBackUploadResponse,
  LegalCertFrontUploadResponse,
  LegalCertOcrResult,
  OperatorCertFrontUploadResponse,
  LegalCertOcrSide,
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

export {
  uploadBusinessLicenseFile,
  uploadGuardianConsentFile,
  uploadLegalCertBackFile,
  uploadLegalCertFrontFile,
  uploadOperatorCertFrontFile,
} from './uploads'

export { ocrBusinessLicense, recognizeLegalCertPeriod } from './ocr'
