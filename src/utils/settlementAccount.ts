import type { MySettlementAccountPayload } from '@/api/adapay'
import dictionary from '@/data/adapay-settlement.json'

export const settlementBanks = dictionary.banks
export const settlementProvinces = dictionary.provinces

export function getSettlementCities(provinceCode: string) {
  return settlementProvinces.find((province) => province.value === provinceCode)?.cities ?? []
}

/**
 * 按银行名称反查字典编码（只用于回填）。
 *
 * 契约的结算账户只回 `bank_name`、不回银行编码，而表单是按下拉编码取名称的，
 * 所以换绑时得把名称折回一个编码。重名不会造成错误：编码最终又只被翻译回同一个名称，
 * 而请求体里要的就是这个名称。
 */
export function findBankCodeByName(bankName: string): string {
  const target = bankName.trim()
  if (!target) {
    return ''
  }
  return settlementBanks.find((option) => option.label === target)?.value ?? ''
}

export function prepareSettlementAccount(
  form: {
    card_id: string
    bank_code: string
    bank_acct_type?: string
  },
  accountName: string,
): MySettlementAccountPayload {
  const accountNoTail = form.card_id.replace(/\s/g, '')
  if (!/^\d{4}$/.test(accountNoTail)) {
    throw new Error('请输入银行卡号后四位')
  }
  const bank = settlementBanks.find((option) => option.value === form.bank_code)
  if (!bank) throw new Error('请选择开户银行')
  if (!accountName.trim()) throw new Error('实名资料中缺少收款户名')
  if (form.bank_acct_type !== '1' && form.bank_acct_type !== '2') {
    throw new Error('请选择账户类型')
  }
  return {
    account_name: accountName.trim(),
    bank_name: bank.label,
    account_no_tail: accountNoTail,
    member_type: form.bank_acct_type === '1' ? 'enterprise' : 'personal',
  }
}
