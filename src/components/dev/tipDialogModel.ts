/**
 * R010 打赏弹窗的对外契约、提交体与固定文案。
 *
 * 从 `useDevTipDialog` 里拆出来只为收敛单文件行数：props / emits 的形状、档位优先其次是
 * 自填的判定顺序，都与拆分前一致，但**提交体按契约收窄**——`POST /api/tips` 只接受
 * `CreateTipRequest{developer, amount_fen, message, anonymous}`：没有 `tier_index`，
 * 也没有 `pay_method` / `pay_channel` / `client_platform`（档位在这里就换算成整数分发出）。
 */
import type { CreateTipPayload, TipOrder } from '@/api/tips'
import type { PublicTipBlock } from '@/api/publicProfile'
import { validateTipCustomCash } from '@/shared/devTip'

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
  message: string
  anonymous: boolean
  /** 是否走自填金额（true 时忽略档位） */
  useCustom: boolean
  /** 选中的固定档位下标；null 表示未选档位 */
  selectedTierIndex: number | null
  /** 自填金额（元文本） */
  customCash: string
}

/** 构造提交体：优先固定档位（直接取该档的分），其次自填。金额一律整数分。 */
export function buildTipPayload(input: TipPayloadInput): CreateTipPayload | { error: string } {
  // `amount_fen` 是契约的必填项，所以只在确定金额之后才组装完整提交体
  const base = {
    developer: input.username,
    message: input.message.trim(),
    anonymous: input.anonymous,
  }
  if (!input.useCustom && input.selectedTierIndex != null) {
    const fen = input.tip?.cash_tiers_fen?.[input.selectedTierIndex]
    if (fen == null) {
      return { error: '请选择打赏金额' }
    }
    return { ...base, amount_fen: fen }
  }
  const parsed = validateTipCustomCash(input.customCash, input.tip)
  if (!parsed.ok) {
    return { error: parsed.message }
  }
  return { ...base, amount_fen: parsed.fen }
}
