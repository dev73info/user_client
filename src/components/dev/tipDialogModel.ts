/**
 * R010 打赏弹窗的对外契约、提交体与固定文案。
 *
 * 从 `useDevTipDialog` 里拆出来只为收敛单文件行数：props / emits 的形状、档位优先其次是
 * 自填的判定顺序，以及现金「统一按 PC 下单」几个字段的取值，都与拆分前逐字一致。
 */
import type { CreateTipPayload, TipOrder } from '@/api/tips'
import type { PublicTipBlock } from '@/api/publicProfile'
import { validateTipCustomCash, validateTipCustomPoints } from '@/shared/devTip'

export type DevTipDialogProps = {
  open: boolean
  /** 被打赏的开发者用户名 */
  username: string
  /** 公开档案里的打赏块 */
  tip: PublicTipBlock | null
  /** 令牌由父组件传入（登录态） */
  token: string
}

export type DevTipDialogEmits = {
  (e: 'update:open', value: boolean): void
  (e: 'success', order: TipOrder): void
}

/** 后端未给 notice 时的兜底合规文案（与 `TIP_NATURE_NOTICE` 同口径）。 */
export const FALLBACK_NOTICE =
  '打赏是你向平台支付的一笔指定用于支持该开发者的款项，平台按协议扣除服务费后结算给开发者。打赏为自愿支付，常规情况下不支持退款；未成年人未经监护人同意的打赏，监护人可联系平台申诉退款。'

export type TipPayloadInput = {
  /** 被打赏的开发者用户名 */
  username: string
  /** 公开档案里的打赏块 */
  tip: PublicTipBlock | null
  payMethod: 'cash' | 'points'
  message: string
  anonymous: boolean
  useCustom: boolean
  selectedTierIndex: number | null
  customCash: string
  customPoints: string
}

/** 构造提交体：优先固定档位，其次自填。 */
export function buildTipPayload(input: TipPayloadInput): CreateTipPayload | { error: string } {
  const base: CreateTipPayload = {
    to_username: input.username,
    pay_method: input.payMethod,
    message: input.message.trim(),
    anonymous: input.anonymous,
  }
  if (input.payMethod === 'cash') {
    if (!input.useCustom && input.selectedTierIndex != null) {
      return { ...base, tier_index: input.selectedTierIndex }
    }
    const parsed = validateTipCustomCash(input.customCash, input.tip)
    if (!parsed.ok) {
      return { error: parsed.message }
    }
    // 现金：统一按 PC 下单，后端回本站中间页 URL
    return { ...base, amount_fen: parsed.fen, pay_channel: 'wx_pub', client_platform: 'pc' }
  }
  if (!input.useCustom && input.selectedTierIndex != null) {
    return { ...base, tier_index: input.selectedTierIndex }
  }
  const parsed = validateTipCustomPoints(input.customPoints, input.tip)
  if (!parsed.ok) {
    return { error: parsed.message }
  }
  return { ...base, amount_points: parsed.fen }
}
