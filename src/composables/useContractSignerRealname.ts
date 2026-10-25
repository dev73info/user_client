/**
 * 签署页的「本人实名资料」：签署身份的姓名与证件号唯一来源。
 *
 * 后端 2.0 的 `ContractResponse` **不带**实名字段（`party_a_real_name` /
 * `party_a_id_card_no_masked` 这些是 1.x 才有、2.0 没搬过来的），所以不能拿合同响应
 * 去判「实名是否齐全」——那会让签署页恒显示「未完成实名认证」、「开始签署」永久置灰。
 * 本人自己的实名资料只有 `/realname/me` 有，单独读一次。
 *
 * 读不到（未实名 / 审核中 / 接口失败）时保持 null，页面按「未完成实名认证」展示并引导去认证，
 * **不抛错、不阻断合同展示**：合同本身可能是能看的，只是签不了。
 */
import { ref } from 'vue'

import { getMyRealnameVerification } from '@/api/realname'
import { signerRealnameFrom, type SignerRealname } from '@/shared/contractSign'

export function useContractSignerRealname() {
  const selfRealname = ref<SignerRealname | null>(null)

  /** 读一次本人实名；任何失败都收敛成「没有实名资料」。 */
  async function loadSelfRealname(token: string) {
    try {
      selfRealname.value = signerRealnameFrom(await getMyRealnameVerification(token))
    } catch {
      selfRealname.value = null
    }
  }

  return { selfRealname, loadSelfRealname }
}
