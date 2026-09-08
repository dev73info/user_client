import type { MySettlementAccountPayload } from '@/api/adapay'
import dictionary from '@/data/adapay-settlement.json'

export const settlementBanks = dictionary.banks
export const settlementProvinces = dictionary.provinces

export function getSettlementCities(provinceCode: string) {
  return settlementProvinces.find((province) => province.value === provinceCode)?.cities ?? []
}

export function prepareSettlementAccount(form: MySettlementAccountPayload): MySettlementAccountPayload {
  const cardId = form.card_id.replace(/\s/g, '')
  if (!/^\d{8,40}$/.test(cardId)) {
    throw new Error('请输入有效的银行卡号，仅支持数字')
  }
  const bank = settlementBanks.find((option) => option.value === form.bank_code)
  if (!bank) throw new Error('请选择开户银行')
  const cities = getSettlementCities(form.prov_code)
  if (!cities.length) throw new Error('请选择开户省份')
  if (!cities.some((city) => city.value === form.area_code)) {
    throw new Error('请选择该省份下的开户城市')
  }
  if (form.bank_acct_type !== '1' && form.bank_acct_type !== '2') {
    throw new Error('请选择账户类型')
  }
  return {
    card_id: cardId,
    bank_code: bank.value,
    bank_name: bank.label,
    prov_code: form.prov_code,
    area_code: form.area_code,
    bank_acct_type: form.bank_acct_type,
  }
}
