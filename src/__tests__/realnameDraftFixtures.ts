import type { RealnameDraftFields } from '@/shared/realnameForm'
import { LONG_TERM_DATE } from '@/shared/realnameForm'

/**
 * 实名表单纯函数用例的公共夹具（`realnameForm.spec.ts` 与 `realnameRequiredFields.spec.ts` 共用）。
 *
 * 两个 spec 都要一份「填齐的草稿」当底稿、只改自己关心的字段，夹具放这里免得各抄一份；
 * 年龄相关的断言一律传入 `TODAY`，不依赖跑测试那天的日期。
 */
export const TODAY = new Date(2026, 4, 20) // 2026-05-20

/** 一份完整的草稿：个人主体、成年、必填齐全；各用例只改自己关心的字段。 */
export function draft(patch: Partial<RealnameDraftFields> = {}): RealnameDraftFields {
  return {
    authType: 'IDENTITY_CARD',
    identifyType: 153,
    idCardType: 1,
    realName: '张三',
    idCardNo: '110101199001011234',
    mobile: '13800000000',
    companyName: '',
    unifiedSocialCreditCode: '',
    businessLicenseNo: '',
    operatorName: '',
    operatorIdCardNo: '',
    guardianRequired: false,
    guardianConsent: false,
    guardianConsentFile: '',
    businessLicenseFile: '',
    legalCertFrontFile: '/uploads/realname-legal-certs/test/front.jpg',
    legalCertBackFile: '',
    companyProvCode: '',
    companyAreaCode: '',
    companyAddress: '',
    businessScope: '',
    businessLicenseExpiresOn: '',
    legalCertBeginOn: '',
    legalCertExpiresOn: '',
    ...patch,
  }
}

/** 一份材料齐全的企业草稿；工商字段保留给旧的收款资料检查，不参与认证输入。 */
export function enterpriseDraft(patch: Partial<RealnameDraftFields> = {}): RealnameDraftFields {
  return draft({
    authType: 'ENTERPRISE',
    identifyType: 369,
    companyName: '示例科技有限公司',
    unifiedSocialCreditCode: '91310000MA1K35Q64U',
    operatorName: '张三',
    operatorIdCardNo: '110101199001011234',
    businessLicenseFile: 'https://cdn.example.com/bl.jpg',
    legalCertFrontFile: 'https://cdn.example.com/front.jpg',
    legalCertBackFile: 'https://cdn.example.com/back.jpg',
    companyProvCode: '0011',
    companyAreaCode: '1100',
    companyAddress: '北京市朝阳区某路 1 号',
    businessScope: '技术开发、技术咨询',
    businessLicenseExpiresOn: LONG_TERM_DATE,
    legalCertBeginOn: '20200101',
    legalCertExpiresOn: LONG_TERM_DATE,
    ...patch,
  })
}
