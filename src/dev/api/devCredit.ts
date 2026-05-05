import { apiUrl, authHeaders, requestJson } from '@dev/api/http'

export type DevCreditSelf = {
  username: string
  credit_score: number
  cny_per_credit: number
  max_deposit_cny: number
  max_order_amount_cny: number
  remaining_deposit_cap_cny: number
  enforce_deposit_limit: boolean
  enforce_order_limit: boolean
}

export async function getDevCreditSelf(token: string): Promise<DevCreditSelf> {
  return requestJson<DevCreditSelf>(
    apiUrl('/dev/credit/me'),
    { headers: authHeaders(token) },
    '加载开发者信用失败',
  )
}
