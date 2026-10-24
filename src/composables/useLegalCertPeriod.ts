import { ref, type Ref } from 'vue'

import { recognizeLegalCertPeriod, type LegalCertOcrSide } from '@/api/realname'
import { LONG_TERM_DATE, type RealnameDraftFields } from '@/shared/realnameForm'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 法人证件有效期域：起止两项的「用户动过」标记、长期有效捷径、以及上传后的静默 OCR 回填。
 *
 * **标记不在这里持有**：`legalCertPeriodEdited` 是草稿状态——`useRealnameFormDraft` 的
 * `resetSubjectFields` / `prefill` 都要连它一起清（换主体时不清，OCR 就不敢回填空表单；
 * 服务端记录落地时不清，用户手填过的值会被当成「动过」而永远不被识别结果接管）。
 * 所以标记的正本留在草稿域，这里只接收同一份对象，负责**写**它（手选 / 清除 / 长期有效）。
 *
 * OCR 回填的规矩（拆出来前后一字未改，时序即正确性）：
 * - 只往「空且用户没动过」的项里写（`legalCertPeriodEdited` + 空值双重判定）；
 * - 两面各调一次（人像面一般认不出有效期、国徽面才有），任一面出错都吞掉，不弹错、不阻断提交；
 * - 只有**两项都没拿到**时才给一条「请手工填写」的轻提示，拿到至少一项就不打扰。
 *
 * 触发点有两个，都在调用方：两张证件照**上传成功后**（材料域，不静默），以及**表单打开时**
 * 本地已存有证件照（视图那条 `watch(realnameDialogVisible)`，静默）。
 */
export type LegalCertPeriodOptions = {
  /** 表单草稿（与草稿域同一份实例）：有效期起止两项就写在这上面。 */
  form: RealnameDraftFields
  /** 草稿域那份「用户动过」标记（同一个 reactive 对象，不另存一份）。 */
  edited: { begin: boolean; expires: boolean }
  /** 只读态（审核中 / 已通过且未进变更）：输入与上传都锁着，识别不白跑一趟。 */
  locked: Ref<boolean>
}

export function useLegalCertPeriod(options: LegalCertPeriodOptions) {
  const auth = useAuthStore()
  const { form, edited } = options

  /** 有效期 OCR 进行中（辅助填写，不挡提交）。 */
  const legalCertOcrLoading = ref(false)

  /** 用户动了起始日（手选 / 清除）：记下来，OCR 就不再回填它。 */
  function markLegalCertBeginEdited() {
    edited.begin = true
  }

  /** 用户动了截止日（手选 / 清除）：同上。 */
  function markLegalCertExpiresEdited() {
    edited.expires = true
  }

  /**
   * 「长期有效」捷径：把截止日设成渠道约定的长期日期。
   *
   * 这算用户自己做的选择，同步打上「改动过」标记，与手选一个日期同等对待——
   * 之后的 OCR 回填一律不碰它（长期证件确实存在，不能因为识别出一个日期就改回来）。
   * 起始日仍要用户填（或由 OCR 填）：长期证件同样有发证日。
   */
  function applyLongTermLegalCert() {
    form.legalCertExpiresOn = LONG_TERM_DATE
    edited.expires = true
  }

  /** 两项都已经有值、或用户明确动过（含「长期有效」）时为真。 */
  function periodSettled(): boolean {
    const beginSet = edited.begin || !!form.legalCertBeginOn.trim()
    const expiresSet = edited.expires || !!form.legalCertExpiresOn.trim()
    return beginSet && expiresSet
  }

  /**
   * 把一次识别结果写进空项，返回实际写了几项。
   *
   * 只接受 `YYYYMMDD`（8 位数字，与后端同一口径）；OCR 给的其它形态一律丢弃，
   * 宁可不填也不能把非法值塞进表单——提交时校验只认这 8 位。
   */
  function applyPeriod(beginOn: string | null, expiresOn: string | null): number {
    let filled = 0
    const begin = (beginOn ?? '').trim()
    const expires = (expiresOn ?? '').trim()
    if (/^\d{8}$/.test(begin) && !edited.begin && !form.legalCertBeginOn.trim()) {
      form.legalCertBeginOn = begin
      filled += 1
    }
    if (/^\d{8}$/.test(expires) && !edited.expires && !form.legalCertExpiresOn.trim()) {
      form.legalCertExpiresOn = expires
      filled += 1
    }
    return filled
  }

  /**
   * 静默 OCR 回填「法人证件有效期」起止两项（规矩见文件头）。
   *
   * 调用方拿到的是一个 `Promise`：材料域在证件照上传成功后 `void` 掉它（不挡上传返回），
   * 视图在弹窗打开时也 `void` 掉它。
   */
  async function autoFillLegalCertPeriod(settings: { silent?: boolean } = {}) {
    if (options.locked.value) return
    auth.hydrate()
    if (!auth.token.trim()) return
    // 只对已经上传过的那几面调识别（后端按 side 取已落库的照片，没传就会回 400）
    const sides: LegalCertOcrSide[] = []
    if (form.legalCertFrontFile.trim()) sides.push('front')
    if (form.legalCertBackFile.trim()) sides.push('back')
    if (!sides.length) return
    // 两项都已有值（或用户动过），没有可回填的余地，不必麻烦后端
    if (periodSettled()) return

    legalCertOcrLoading.value = true
    try {
      const results = await Promise.all(
        sides.map((side) => recognizeLegalCertPeriod(auth.token, side).catch(() => null)),
      )
      let filled = 0
      for (const result of results) {
        if (!result) continue
        filled += applyPeriod(result.cert_begin_on, result.cert_expires_on)
      }
      if (filled === 0 && !settings.silent) {
        TMessage.warning('未能自动识别法人证件有效期，请手工填写')
      }
    } finally {
      legalCertOcrLoading.value = false
    }
  }

  return {
    legalCertOcrLoading,
    markLegalCertBeginEdited,
    markLegalCertExpiresEdited,
    applyLongTermLegalCert,
    autoFillLegalCertPeriod,
  }
}
