import { describe, expect, it } from 'vitest'

import type { UserRealnameVerification } from '@/api/realname'
import {
  businessLicenseDerivedNote,
  businessLicenseDerivedSummary,
  realnameEntryCopy,
  realnameStatusText,
  realnameStatusTone,
  realnameSubjectLabel,
} from '@/shared/realnameDisplay'
import { LONG_TERM_DATE, type RealnameDraftFields } from '@/shared/realnameForm'

/**
 * 实名认证的展示口径（纯函数层）：状态文案与语气、主体中文名、入口卡文案、
 * 营业执照识别结果那一行。
 *
 * 这些句子会同时出现在 hero、入口卡、表单校验与提交按钮的解释里，改一处就四处走样，
 * 所以按「一句话一条断言」钉住原文。必填缺失清单的断言在 `realnameForm.spec.ts`
 * （清单住在校验层，那边才是它的使用者）。
 */
function record(patch: Partial<UserRealnameVerification> = {}): UserRealnameVerification {
  return {
    username: 'alice',
    auth_type: 'IDENTITY_CARD',
    status: 'approved',
    real_name: '张三',
    id_card_no_masked: '110***********1234',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

function draft(patch: Partial<RealnameDraftFields> = {}): RealnameDraftFields {
  return {
    authType: 'ENTERPRISE',
    idCardType: 1,
    realName: '',
    idCardNo: '',
    mobile: '13800000000',
    companyName: '示例科技有限公司',
    unifiedSocialCreditCode: '91310000MA1K35Q64U',
    businessLicenseNo: '',
    operatorName: '张三',
    operatorIdCardNo: '110101199001011234',
    guardianConsent: false,
    guardianConsentFile: '',
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
  }
}

describe('状态文案与语气', () => {
  it('没有记录写「未提交」，三种状态各有各的词', () => {
    expect(realnameStatusText(null)).toBe('未提交')
    expect(realnameStatusText(undefined)).toBe('未提交')
    expect(realnameStatusText('approved')).toBe('已通过')
    expect(realnameStatusText('pending')).toBe('审核中')
    expect(realnameStatusText('rejected')).toBe('已驳回')
  })

  it('语气跟着状态走：通过=success、审核中=warning、驳回=danger、未提交=info', () => {
    expect(realnameStatusTone(undefined)).toBe('info')
    expect(realnameStatusTone('approved')).toBe('success')
    expect(realnameStatusTone('pending')).toBe('warning')
    expect(realnameStatusTone('rejected')).toBe('danger')
  })
})

describe('当前主体的中文名', () => {
  it('企业 / 个体户带企业名，个人带姓名与脱敏证件号', () => {
    expect(
      realnameSubjectLabel(record({ auth_type: 'ENTERPRISE', company_name: '示例科技有限公司' })),
    ).toBe('企业 示例科技有限公司')
    expect(
      realnameSubjectLabel(record({ auth_type: 'SOLE_PROPRIETOR', company_name: '某小吃店' })),
    ).toBe('个体工商户 某小吃店')
    expect(realnameSubjectLabel(record())).toBe('个人 张三（110***********1234）')
    expect(realnameSubjectLabel(record({ id_card_no_masked: null }))).toBe('个人 张三')
    expect(realnameSubjectLabel(null)).toBe('')
  })

  it('港澳台等非大陆主体按个人口径写', () => {
    expect(realnameSubjectLabel(record({ auth_type: 'RESIDENCE_HK_MC' }))).toBe('个人 张三')
  })
})

describe('入口卡文案', () => {
  it('四种状态下说清点进去能做什么', () => {
    expect(realnameEntryCopy(null)).toEqual({
      title: '开始认证',
      desc: '提交真实身份信息，通过后可签署合同',
    })
    expect(realnameEntryCopy(record({ status: 'pending' }))).toEqual({
      title: '查看认证进度',
      desc: '认证审核中，可查看进度或撤回本次申请',
    })
    expect(realnameEntryCopy(record({ status: 'rejected', review_note: '证件照片模糊' }))).toEqual({
      title: '重新提交认证',
      desc: '证件照片模糊',
    })
    // 驳回但没给审核意见时用兜底那句
    expect(realnameEntryCopy(record({ status: 'rejected', review_note: null })).desc).toBe(
      '上次认证未通过，请核对信息后重新提交',
    )
    expect(realnameEntryCopy(record({ status: 'approved' })).desc).toBe(
      '当前主体：个人 张三（110***********1234）',
    )
  })
})

describe('营业执照识别结果那一行', () => {
  it('识别齐了报省市 + 经营范围字数 + 长期有效', () => {
    expect(businessLicenseDerivedSummary(draft())).toBe(
      '北京市北京市 · 经营范围 9 字 · 营业执照长期有效',
    )
  })

  it('没识别出四项时摘要为空，提示整句改成出路', () => {
    const empty = draft({
      companyProvCode: '',
      companyAreaCode: '',
      companyAddress: '',
      businessScope: '',
      businessLicenseExpiresOn: '',
    })
    expect(businessLicenseDerivedSummary(empty)).toBe('')
    expect(businessLicenseDerivedNote(empty)).toBe(
      '未能识别出企业所在省市、企业注册地址、经营范围、营业执照有效期，请重新上传更清晰的照片',
    )
  })

  it('识别出一部分时「已识别」与「缺什么」两句都写出来', () => {
    expect(businessLicenseDerivedNote(draft({ businessScope: '' }))).toBe(
      '已从营业执照识别：北京市北京市 · 营业执照长期有效；未能识别出经营范围，请重新上传更清晰的照片',
    )
  })

  it('非长期有效时报具体截止日', () => {
    expect(
      businessLicenseDerivedSummary(draft({ businessLicenseExpiresOn: '20301231' })),
    ).toContain('执照有效期至 20301231')
  })
})
