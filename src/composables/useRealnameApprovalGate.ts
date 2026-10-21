import { getMyRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'

import { TMessage } from 'ui_73info'

type UseRealnameApprovalGateOptions = {
  /** 登录态读取与刷新（视图持有 `auth`，这里只按需取值）。 */
  token: () => string
  isAuthed: () => boolean
  hydrate: () => void
  /** 未登录：跳登录（`home?modal=auth`），`redirectTarget` 是登录后要回到的发布地址。 */
  onNeedLogin: (redirectTarget: string) => void
  /** 未实名 / 被驳回 / 查无记录：跳实名页，`redirectTarget` 同上。 */
  onNeedRealname: (redirectTarget: string) => void
}

/**
 * 发布需求前的实名门禁（**只做「取状态」这件有副作用的事**）。
 *
 * 三个分支的文案与去向逐字沿用拆分前：审核中只是停在这里、不跳；未通过与查无记录都要去实名页；
 * 其余异常（网络 / 服务端错误）只报错、不跳。
 *
 * 跳转留在视图（`onNeedLogin` / `onNeedRealname` 注入）：这里不碰 router，也就能在单测里
 * 直接断言「哪种状态跳哪去」。
 */
export function useRealnameApprovalGate(options: UseRealnameApprovalGateOptions) {
  async function ensureApproved(redirectTarget: string): Promise<boolean> {
    options.hydrate()
    if (!options.isAuthed()) {
      TMessage.info('发布需求前请先登录')
      options.onNeedLogin(redirectTarget)
      return false
    }

    try {
      const record = await getMyRealnameVerification(options.token())
      if (record.status === 'approved') {
        return true
      }

      if (record.status === 'pending') {
        TMessage.warning('实名认证审核中，通过后可发布需求')
        return false
      }

      TMessage.warning('实名认证未通过，请重新提交后再发布需求')
      options.onNeedRealname(redirectTarget)
      return false
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        TMessage.warning('发布需求前请先完成实名认证')
        options.onNeedRealname(redirectTarget)
        return false
      }

      TMessage.error(err instanceof Error ? err.message : '实名认证状态校验失败')
      return false
    }
  }

  return { ensureApproved }
}
