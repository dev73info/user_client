import { describe, expect, it } from 'vitest'

import { buildTipPayload } from '@/components/dev/tipDialogModel'

/**
 * 打赏弹窗的提交体按契约收窄：`CreateTipRequest` 只有
 * `developer` / `amount_fen` / `message` / `anonymous`。
 *
 * 1.x 的 `pay_method` / `pay_channel` / `client_platform` / `tier_index` / `amount_points`
 * 都不在请求体里——档位在这里就换算成整数分发出，多传字段后端会当契约漂移。
 */
const tip = {
  enabled: true,
  cash_tiers_fen: [500, 1000],
  allow_custom_cash: true,
  custom_cash_min_fen: 100,
  custom_cash_max_fen: 200000,
}

describe('buildTipPayload', () => {
  it('固定档位：取该档的分，不传档位下标', () => {
    const payload = buildTipPayload({
      username: 'dev-a',
      tip,
      message: ' 谢谢 ',
      anonymous: true,
      useCustom: false,
      selectedTierIndex: 1,
      customCash: '',
    })

    expect(payload).toEqual({
      developer: 'dev-a',
      amount_fen: 1000,
      message: '谢谢',
      anonymous: true,
    })
    expect(Object.keys(payload).sort()).toEqual(['amount_fen', 'anonymous', 'developer', 'message'])
  })

  it('自填：元文本换成整数分，超出区间时报错文案', () => {
    expect(
      buildTipPayload({
        username: 'dev-a',
        tip,
        message: '',
        anonymous: false,
        useCustom: true,
        selectedTierIndex: null,
        customCash: '12.34',
      }),
    ).toEqual({
      developer: 'dev-a',
      amount_fen: 1234,
      message: '',
      anonymous: false,
    })

    const tooSmall = buildTipPayload({
      username: 'dev-a',
      tip,
      message: '',
      anonymous: false,
      useCustom: true,
      selectedTierIndex: null,
      customCash: '0.5',
    })
    expect('error' in tooSmall).toBe(true)
  })

  it('档位下标越界时给出明确错误，而不是发一个 0 分', () => {
    const payload = buildTipPayload({
      username: 'dev-a',
      tip,
      message: '',
      anonymous: false,
      useCustom: false,
      selectedTierIndex: 9,
      customCash: '',
    })
    expect('error' in payload).toBe(true)
  })
})
