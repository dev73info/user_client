/**
 * 实名认证的**展示口径**：状态文案与语气、当前主体中文名、入口卡文案，以及营业执照识别结果
 * 那一行的文字。
 *
 * 都是纯函数，不碰表单实例、请求与弹窗；视图、composable 与单测从同一份口径取值，
 * 免得同一句话在几处各写一遍又慢慢跑偏。
 *
 * 依赖是单向的：本文件 → `@/shared/realnameForm`（字段、常量、必填缺失清单、校验与载荷）。
 * 缺失清单放那边而不是这里，是因为「提交前校验」也要用同一份清单；
 * 反过来放就会让两个模块互相 import（运行时成环）。
 */
import type { UserRealnameStatus, UserRealnameVerification } from '@/api/realname'
import {
  LONG_TERM_DATE,
  derivedEnterpriseMissing,
  type RealnameDraftFields,
} from '@/shared/realnameForm'
import { getSettlementCities, settlementProvinces } from '@/utils/settlementAccount'

export type RealnameStatusTone = 'info' | 'warning' | 'success' | 'danger'

/** 状态的一句话：没有记录 = 未提交。 */
export function realnameStatusText(status?: UserRealnameStatus | null): string {
  if (!status) return '未提交'
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  return '已驳回'
}

/** 状态胶囊的语气：与上面的文案一一对应，别让「审核中」显示成绿色。 */
export function realnameStatusTone(status?: UserRealnameStatus | null): RealnameStatusTone {
  if (!status) return 'info'
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
}

/** 当前生效主体的一句话描述，用于「变更认证类型」提示用户换掉的是哪一份资料。 */
export function realnameSubjectLabel(record?: UserRealnameVerification | null): string {
  if (!record) return ''
  if (record.auth_type === 'ENTERPRISE') return `企业 ${record.company_name ?? ''}`.trim()
  if (record.auth_type === 'SOLE_PROPRIETOR') {
    return `个体工商户 ${record.company_name ?? ''}`.trim()
  }
  if (record.auth_type === 'IDENTITY_CARD') {
    const idNo = record.id_card_no_masked ?? ''
    return `个人 ${record.real_name ?? ''}${idNo ? `（${idNo}）` : ''}`.trim()
  }
  return `个人 ${record.real_name ?? ''}`.trim()
}

/** 实名认证入口的文案：按当前状态说清点进去能做什么，别让「审核中」还写着「开始认证」。 */
export function realnameEntryCopy(record?: UserRealnameVerification | null): {
  title: string
  desc: string
} {
  const status = record?.status
  if (status === 'pending') {
    return { title: '查看认证进度', desc: '认证审核中，可查看进度或撤回本次申请' }
  }
  if (status === 'rejected') {
    return {
      title: '重新提交认证',
      desc: record?.review_note || '上次认证未通过，请核对信息后重新提交',
    }
  }
  if (status === 'approved') {
    return { title: '查看认证信息', desc: `当前主体：${realnameSubjectLabel(record)}` }
  }
  return { title: '开始认证', desc: '提交真实身份信息，通过后可签署合同' }
}

/**
 * 上面四项的**识别结果摘要**，替代已移除的输入框供用户核对。
 *
 * 不逐字列经营范围——那是几百字的正文，摘出来只会把表单淹没，所以只报字数。
 */
export function businessLicenseDerivedSummary(fields: RealnameDraftFields): string {
  const prov =
    settlementProvinces.find((item) => item.value === fields.companyProvCode)?.title ?? ''
  const area =
    getSettlementCities(fields.companyProvCode).find(
      (item) => item.value === fields.companyAreaCode,
    )?.title ?? ''
  const expires =
    fields.businessLicenseExpiresOn === LONG_TERM_DATE
      ? '营业执照长期有效'
      : `执照有效期至 ${fields.businessLicenseExpiresOn}`
  return [
    `${prov}${area}`,
    fields.businessScope ? `经营范围 ${fields.businessScope.length} 字` : '',
    fields.businessLicenseExpiresOn ? expires : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * 上传区下方那一行的文字：识别结果 + 缺失项（有缺就附上出路）。
 *
 * 这四项已不在表单里，所以这一行同时承担两件事：交代「自动填好了什么」（用户要核对），
 * 以及说明「提交按钮为什么是灰的」（缺项时）。
 */
export function businessLicenseDerivedNote(fields: RealnameDraftFields): string {
  const summary = businessLicenseDerivedSummary(fields)
  const missing = derivedEnterpriseMissing(fields)
  if (!missing.length) {
    return summary ? `已从营业执照识别：${summary}` : ''
  }
  const tail = `未能识别出${missing.join('、')}，请重新上传更清晰的照片`
  return summary ? `已从营业执照识别：${summary}；${tail}` : tail
}
