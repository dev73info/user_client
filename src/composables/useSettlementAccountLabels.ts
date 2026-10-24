/**
 * 收款银行卡域的**派生读数**：用户看得懂的阶段、主体是否变更、缺哪些企业资料、
 * 渠道拒绝原因与几句提示文案。
 *
 * 从 `useSettlementAccount` 拆出来（那份同时装着表单与请求，已经顶到结构预算上限）。
 * 这里只读入参、不持有状态、不发请求；口径本身在 `@/shared/settleAccountStage`。
 */
import { computed, type Ref } from 'vue'

import type { AdapayMemberStatus } from '@/api/adapay'
import type { UserRealnameVerification } from '@/api/realname'
import { missingEnterpriseOnboardingLabels } from '@/shared/realnameMaterials'
import {
  isSettleBound,
  isSettleRejected,
  isSettleUnderReview,
  settleAccountStage,
  settleProviderErrorText,
} from '@/shared/settleAccountStage'

export type SettlementAccountLabelsOptions = {
  /** 当前实名记录（跨块共用，注入）。 */
  realname: Ref<UserRealnameVerification | null>
  /** 结算账户读数（跨块共用，注入）。 */
  adapayMember: Ref<AdapayMemberStatus | null>
  /** 当前实名主体是不是企业 / 个体工商户：决定绑对公账户还是个人银行卡。 */
  isEnterpriseSubject: () => boolean
}

export function useSettlementAccountLabels(options: SettlementAccountLabelsOptions) {
  const { realname, adapayMember, isEnterpriseSubject } = options

  /** 是否已绑卡（决定提交时走「绑定」还是「更换」接口）。 */
  const settleBound = computed(() => isSettleBound(adapayMember.value?.acceptsSettlement))

  /** 四态分开看：`failed` 是「去整改」不是「等」。 */
  const settleStage = computed(() =>
    settleAccountStage(adapayMember.value?.onboardingStatus, adapayMember.value?.acceptsSettlement),
  )

  /** 已绑的账户是否还挂在旧主体上：主体变更后渠道侧账户不会自动跟着换，必须先说清原因。 */
  const settleSubjectMismatch = computed(() => {
    const expected = isEnterpriseSubject() ? 'enterprise' : 'personal'
    return Boolean(adapayMember.value?.memberType) && adapayMember.value?.memberType !== expected
  })

  /** 企业主体的收款账户只能是对公账户，持证人固定取实名主体，因此不给用户改。 */
  const settleCorporateLocked = computed(() => isEnterpriseSubject())

  /** 当前实名主体的中文口径，用于把「这个账户为什么不能继续用」讲清楚。 */
  const settleSubjectLabel = computed(() =>
    settleCorporateLocked.value ? '企业 / 个体工商户' : '个人',
  )

  /** 该主体要绑的账户类型：企业 / 个体工商户是对公账户，其余是银行卡。 */
  const settleAccountWord = computed(() => (settleCorporateLocked.value ? '对公账户' : '银行卡'))

  /** 企业进件资料缺任一项渠道都会拒绝开户，所以提前拦在界面层并说清缺哪几项。 */
  const settleMaterialMissing = computed(
    () =>
      settleCorporateLocked.value && missingEnterpriseOnboardingLabels(realname.value).length > 0,
  )
  const settleMaterialMissingText = computed(() =>
    missingEnterpriseOnboardingLabels(realname.value).join('、'),
  )

  /** 渠道是否还在审核中：审核期间绑不了对公账户。 */
  const settleUnderReview = computed(() =>
    isSettleUnderReview(adapayMember.value?.onboardingStatus),
  )

  /** 「审核中」那句提示：企业与个人绑的不是同一种账户，不能共用一句写死对公账户的话。 */
  const settleUnderReviewText = computed(() =>
    settleCorporateLocked.value
      ? '企业收款账户正在审核中，审核通过后即可绑定对公账户'
      : '收款账户正在审核中，审核通过后即可绑定银行卡',
  )

  /** `onboarding_status = failed` 是唯一表示「渠道给了否定结论」的取值。 */
  const settleRejected = computed(() => isSettleRejected(adapayMember.value?.onboardingStatus))

  /** 渠道侧最近一次拒绝的原话；账户可用时不再提旧伤，换绑失败解绑时必留。 */
  const settleProviderError = computed(() =>
    settleProviderErrorText(
      adapayMember.value?.onboardingStatus,
      adapayMember.value?.providerError,
      adapayMember.value?.acceptsSettlement,
    ),
  )

  return {
    settleBound,
    settleStage,
    settleSubjectMismatch,
    settleCorporateLocked,
    settleSubjectLabel,
    settleAccountWord,
    settleMaterialMissing,
    settleMaterialMissingText,
    settleUnderReview,
    settleUnderReviewText,
    settleRejected,
    settleProviderError,
  }
}
