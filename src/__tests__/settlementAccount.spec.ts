import { describe, expect, it } from 'vitest'
import {
  getSettlementCities,
  prepareSettlementAccount,
  settlementBanks,
  settlementProvinces,
} from '@/utils/settlementAccount'

const validForm = {
  card_id: '1234',
  bank_code: '01020000',
  bank_acct_type: '2',
}

describe('settlement account selections', () => {
  it('submits only the current settlement DTO fields', () => {
    expect(prepareSettlementAccount(validForm, '张三')).toEqual({
      account_name: '张三',
      bank_name: '工商银行',
      account_no_tail: '1234',
      member_type: 'personal',
    })
  })

  it.each([
    [{ card_id: '' }, '后四位'],
    [{ card_id: 'abcd' }, '后四位'],
    [{ bank_code: '' }, '开户银行'],
    [{ bank_code: 'unknown' }, '开户银行'],
    [{ bank_acct_type: '3' }, '账户类型'],
  ])('rejects invalid fields: %j', (overrides, message) => {
    expect(() => prepareSettlementAccount({ ...validForm, ...overrides }, '张三')).toThrow(message)
  })

  it('requires the realname account holder', () => {
    expect(() => prepareSettlementAccount(validForm, '')).toThrow('收款户名')
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
    expect(
      prepareSettlementAccount({ ...validForm, bank_acct_type: '1' }, '某公司').member_type,
    ).toBe('enterprise')
  })
})
