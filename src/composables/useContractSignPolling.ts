import { onScopeDispose, type Ref } from 'vue'

import { syncAsignSignStatus, type ContractDetail } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'

/**
 * 合同签署状态轮询（R047 从 `ContractSignView` 迁出）。
 *
 * 已发起爱签签署但本地仍是「签约中 1」时，前端周期性调用 `syncAsignSignStatus`：
 * 爱签回调（callback_url 指向生产域名）在本地开发环境收不到，且爱签侧状态更新可能有延迟，
 * 只能主动回查，直到合同变为已签署。
 *
 * 轮询间隔保持 3s：爱签侧状态更新约需十几秒，无需 1s 级轮询；且后端对写接口有 15 次/分限流
 * （asign-sync 已单独放宽），1s 轮询会触发 429 导致同步延迟。
 *
 * 定时器**绑在作用域上**（`onScopeDispose`）：拆分前是视图的 `onUnmounted`，搬进 composable 后
 * 如果继续用 `onUnmounted`，组件提前卸载或复用时就会漏清理，轮询在后台一直打接口。
 */
const POLL_INTERVAL_MS = 3000

type UseContractSignPollingOptions = {
  /** 当前页面的合同：轮询结果直接写回这一份，页面随之更新。 */
  contract: Ref<ContractDetail | null>
  isLoading: () => boolean
  isSigning: () => boolean
  token: () => string
  /** 同步到「已签约 2」后的后续动作（离开签署页 / 停止轮询）。 */
  onSigned: () => void
}

export function useContractSignPolling(options: UseContractSignPollingOptions) {
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  /** 单次状态同步：查询爱签签署状态并更新本地合同，已签署则停止轮询并继续后续动作。 */
  async function pollOnce() {
    if (options.isSigning() || options.isLoading() || !options.contract.value) return
    const item = options.contract.value
    // 只有「签约中 1」还需要向爱签同步；已签约 2 与其余终态（3/4/6/7）、未发起 0 都停轮询。
    if (item.status !== CONTRACT_STATUS.signing) {
      stop()
      return
    }
    try {
      const updated = await syncAsignSignStatus(options.token(), item.id)
      options.contract.value = updated
      if (updated.status !== CONTRACT_STATUS.signing) {
        stop()
      }
      if (updated.status === CONTRACT_STATUS.signed) {
        options.onSigned()
      }
    } catch {
      // 单次同步失败不中断轮询，继续重试。
    }
  }

  function start() {
    stop()
    timer = setInterval(() => {
      void pollOnce()
    }, POLL_INTERVAL_MS)
    // 立即执行一次，避免首个轮询周期内的空白，缩短从爱签返回后的等待。
    void pollOnce()
  }

  onScopeDispose(stop)

  return { start, stop, pollOnce }
}
