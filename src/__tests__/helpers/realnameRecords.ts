/**
 * 实名记录的测试夹具（账号与安全页的弹窗接线用）。
 *
 * 收款户名取实名主体的 `real_name` / `company_name`，人脸核身域又按 `status` 分支，
 * 所以两份记录只在 `status` 上不同，抽出来共用一份，规格改动只改这里。
 */
export type RealnameFixture = {
  status: 'pending' | 'approved'
  auth_type: string
  real_name: string
  id_card_no_masked: string
  mobile_masked: string
}

/** 一条「审核中」的实名记录：人脸核身域的所有分支都要它。 */
export const pendingRecord: RealnameFixture = {
  status: 'pending',
  auth_type: 'IDENTITY_CARD',
  real_name: '张三',
  id_card_no_masked: '110***********1234',
  mobile_masked: '138****0000',
}

/** 已通过的实名记录：收款户名取它的 `real_name`。 */
export const approvedRecord: RealnameFixture = { ...pendingRecord, status: 'approved' }
