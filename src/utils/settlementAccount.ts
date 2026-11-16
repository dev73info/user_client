import type { MySettlementAccountPayload, MySettlementOpenPayload } from '@/api/adapay'
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

/**
 * 校验并规整「对私自动开户」表单（`SettlementOpenRequest`）。
 *
 * 规则逐条对齐后端 `settle_account.rs` 的 `parse`：卡号 12~32 位数字、预留手机号 11~15 位数字、
 * 证件号 6~32 位字母或数字；开户省市必须能在字典里对上。前端先拦一道，不让明显非法的值
 * 打到支付接口上、再等渠道报错。
 */
export function prepareSettlementOpen(
  form: {
    card_id: string
    tel_no: string
    cert_id: string
    bank_code: string
    prov_code: string
    area_code: string
  },
  accountName: string,
): MySettlementOpenPayload {
  const cardName = accountName.trim()
  if (!cardName) throw new Error('实名资料中缺少收款户名')

  const cardId = form.card_id.replace(/\s/g, '')
  if (!/^\d{12,32}$/.test(cardId)) {
    throw new Error('银行卡号必须是 12~32 位数字')
  }

  const telNo = form.tel_no.replace(/\s/g, '')
  if (!/^\d{11,15}$/.test(telNo)) {
    throw new Error('银行预留手机号必须是 11~15 位数字')
  }

  const certId = form.cert_id.trim()
  if (!/^[A-Za-z0-9]{6,32}$/.test(certId)) {
    throw new Error('证件号必须是 6~32 位字母或数字')
  }

  const bank = settlementBanks.find((option) => option.value === form.bank_code)
  if (!bank) throw new Error('请选择开户银行')

  const cities = getSettlementCities(form.prov_code)
  if (!cities.length) throw new Error('请选择开户省份')
  if (!cities.some((city) => city.value === form.area_code)) {
    throw new Error('请选择该省份下的开户城市')
  }

  return {
    member_type: 'personal',
    card_name: cardName,
    card_id: cardId,
    tel_no: telNo,
    bank_code: bank.value,
    bank_name: bank.label,
    bank_acct_type: 'private',
    prov_code: form.prov_code,
    area_code: form.area_code,
    cert_id: certId,
    cert_type: null,
  }
}
