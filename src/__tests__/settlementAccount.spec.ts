import { describe, expect, it } from 'vitest'
import {
  getSettlementCities,
  prepareSettlementAccount,
  settlementBanks,
  settlementProvinces,
} from '@/utils/settlementAccount'

const validForm = {
  card_id: '6222 0000 0000 0000',
  bank_code: '01020000',
  bank_name: 'wrong name',
  prov_code: '0011',
  area_code: '1100',
  bank_acct_type: '2',
}

describe('settlement account selections', () => {
  it('normalizes the card and submits official codes and the selected bank name', () => {
    expect(prepareSettlementAccount(validForm)).toEqual({
      ...validForm,
      card_id: '6222000000000000',
      bank_name: '工商银行',
    })
  })

  it.each([
    [{ card_id: '' }, '银行卡号'],
    [{ card_id: '6222-abcd-0000' }, '银行卡号'],
    [{ bank_code: '' }, '开户银行'],
    [{ bank_code: 'unknown' }, '开户银行'],
    [{ prov_code: '' }, '开户省份'],
    [{ prov_code: '110000' }, '开户省份'],
    [{ area_code: '' }, '开户城市'],
    [{ area_code: '1200' }, '开户城市'],
    [{ bank_acct_type: '3' }, '账户类型'],
  ])('rejects invalid fields: %j', (overrides, message) => {
    expect(() => prepareSettlementAccount({ ...validForm, ...overrides })).toThrow(message)
  })

  it('only offers cities belonging to the selected province', () => {
    expect(getSettlementCities('0011')).toEqual([{ value: '1100', title: '北京市' }])
    expect(getSettlementCities('0012')).toEqual([{ value: '1200', title: '天津市' }])
    expect(getSettlementCities('')).toEqual([])
  })

  it('retains complete official dictionaries and leading zeroes', () => {
    expect(settlementBanks.length).toBeGreaterThan(5000)
    expect(new Set(settlementBanks.map((bank) => bank.value)).size).toBe(settlementBanks.length)
    expect(settlementBanks.every((bank) => /^\d{8}$/.test(bank.value) && bank.label)).toBe(true)
    expect(settlementProvinces.length).toBeGreaterThanOrEqual(31)
    expect(settlementProvinces.every((province) => /^\d{4}$/.test(province.value))).toBe(true)
  })

  it('preserves the corporate account type', () => {
    expect(prepareSettlementAccount({ ...validForm, bank_acct_type: '1' }).bank_acct_type).toBe('1')
  })
})
