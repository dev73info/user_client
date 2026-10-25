import { computed, ref } from 'vue'

import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import {
  createPrepaidWithdrawal,
  getPrepaidAccountStatement,
  type PrepaidAccountStatement,
  type PrepaidWithdrawal,
} from '@/api/devOrderDeposit'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者保证金（2.0 叫「预付账户」）：余额读数 + 提现申请，外加自己的信用额度。
 *
 * 保证金读数只来自一个端点 `GET /api/payment/developer-order-deposit`——它一次给出
 * 账户、`withdrawable_fen`（现在还能提多少）与 `pending_withdrawal_fen`（已申请未出账）。
 * **前端不自己拿余额减一遍**：两处各算一次迟早对不上，而后端那个是唯一真相。
 *
 * 信用额度来自另一个端点（`GET /api/credit/credit/me`），只用来回答「还能再充多少」。
 * 它是**可选**的：取数失败一律当 `null`，卡片少一枚额度标签，余额与提现照常。
 *
 * 金额一律整数分（`*_fen`）。按元展示是本文件的 `toYuan` 干的，
 * 提交前再用 `toFen` 换回去——浮点元永远不参与请求体。
 */
export type DepositReading = {
  /** 账户余额（分） */
  balanceFen: number
  /** 已被接单冻结（分） */
  frozenFen: number
  /** 现在还能提现（分） */
  withdrawableFen: number
  /** 已申请未出账（分） */
  pendingWithdrawalFen: number
  /** 累计充值（分） */
  totalRechargedFen: number
  /** 累计已提现（分） */
  totalWithdrawnFen: number
}

export function useDevWalletDeposit() {
  const auth = useAuthStore()

  const statement = ref<PrepaidAccountStatement | null>(null)
  /** 自己的信用额度；读不到（未配置信用策略 / 接口异常）时为 null，卡片少一枚标签。 */
  const credit = ref<DevCreditSelf | null>(null)
  const loading = ref(false)
  const error = ref('')

  /** 保证金读数；还没取到时为 null（页面据此显示占位而不是 0）。 */
  const deposit = computed<DepositReading | null>(() => {
    const current = statement.value
    if (!current) {
      return null
    }
    return {
      balanceFen: current.account.balance_fen,
      frozenFen: current.account.frozen_fen,
      withdrawableFen: current.withdrawable_fen,
      pendingWithdrawalFen: current.pending_withdrawal_fen,
      totalRechargedFen: current.account.total_recharged_fen,
      totalWithdrawnFen: current.account.total_withdrawn_fen,
    }
  })

  async function load() {
    if (!auth.isAuthed) {
      return
    }
    loading.value = true
    error.value = ''
    // 信用额度与保证金读数互不依赖：额度拿不到不该让整张卡进错误态，所以单独 catch。
    const creditTask = getDevCreditSelf(auth.token)
      .then((value) => {
        credit.value = value
      })
      .catch(() => {
        credit.value = null
      })
    try {
      statement.value = await getPrepaidAccountStatement(auth.token)
    } catch (err) {
      // 没开通预付账户时后端回 404：那不是错误，是「还没充过钱」。
      statement.value = null
      if (!(err instanceof Error && /404|不存在/i.test(err.message))) {
        error.value = err instanceof Error ? err.message : '加载保证金账户失败'
      }
    } finally {
      loading.value = false
    }
    await creditTask
  }

  /** 申请提现：金额传整数分。成功后回刷读数（提现一提交就会占住可提额度）。 */
  async function withdraw(amountFen: number, note?: string): Promise<PrepaidWithdrawal> {
    const result = await createPrepaidWithdrawal(auth.token, {
      amount_fen: Math.round(amountFen),
      ...(note?.trim() ? { note: note.trim() } : {}),
    })
    await load()
    return result
  }

  return { statement, credit, deposit, loading, error, load, withdraw }
}

/** 分 → 元（仅用于展示）。 */
export function toYuan(fen: number | null | undefined): number {
  return Math.round(fen ?? 0) / 100
}

/** 元 → 分（仅用于提交）。四舍五入到整数分，不给后端送浮点。 */
export function toFen(yuan: number): number {
  return Math.round(yuan * 100)
}
