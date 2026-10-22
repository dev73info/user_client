import { computed, reactive, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'
import { bindRequirementProject, type RequirementItem } from '@/api/devRequirements'
import { createMcResource, listMcResources, type McResourcePayload } from '@/api/mcResources'
import { useDevResourceInitForm } from '@/composables/useDevResourceInitForm'
import {
  bindingBlockReason,
  bindableResourceLabel,
  canSubmitBinding,
  confirmResourceLabel,
  hasPendingBindableResources,
  isBindableResource,
  type BindableResourceFacts,
  type BindingGateInput,
} from '@/shared/devRequirementBinding'
import { requiresDepositGate } from '@/shared/devRequirementDetail'
import { useAuthStore } from '@/stores/auth'

/** 接单资格的三个读数（来自 `useDevOrderCapacity`，这里只读）。 */
export type BindingCapacityInput = {
  agreementSigned: Ref<boolean>
  canBindRequirement: Ref<boolean>
  availableCny: Ref<number>
  creditCap: Ref<number>
}

/**
 * 「接取需求」右栏：关联方式、可绑定资源、两次确认、提交。
 *
 * 两道闸门都在这里收口：
 * 1. 资格闸门（协议 / 保证金 / 信用）——文案由 `shared/devRequirementDetail` 的纯函数出，
 *    页面只负责把它显示成提示条；
 * 2. 操作闸门（选没选资源、二次确认勾没勾）——决定按钮能不能点。
 *
 * 新资源那一支的表单与标签归类在 `useDevResourceInitForm`，这里只在提交时取它的请求体。
 * 提交成功直接跳「我的接单」：绑定后这一页已经没有可做的事（需求进入开发中且不可重复绑定）。
 */
export function useDevRequirementBinding(options: {
  requirementId: Ref<string>
  requirement: Ref<RequirementItem | null>
  capacity: BindingCapacityInput
}) {
  const auth = useAuthStore()
  const router = useRouter()

  const resourcesLoading = ref(false)
  const binding = ref(false)
  const resources = ref<McResourcePayload[]>([])
  const bindingMode = ref<'existing' | 'new'>('existing')
  const reviewConfirmed = ref(false)
  const finalConfirmed = ref(false)
  const bindForm = reactive({
    resourceId: undefined as number | undefined,
  })

  const init = useDevResourceInitForm({
    onChange: () => {
      finalConfirmed.value = false
    },
  })

  /** 只有「未绑定需求 + 私有草稿」的资源能直接关联（判定同 `isBindableResource`）。 */
  const availableResourceOptions = computed<BindableResourceFacts[]>(() =>
    resources.value.filter(isBindableResource),
  )
  /** 还有已提审 / 已公开的未绑定资源：页面要说明它们为什么不能在这里绑。 */
  const hasPendingBindable = computed(() => hasPendingBindableResources(resources.value))
  const selectedResource = computed<BindableResourceFacts | null>(
    () => availableResourceOptions.value.find((item) => item.id === bindForm.resourceId) ?? null,
  )

  const gate = computed<BindingGateInput>(() => ({
    requirement: options.requirement.value,
    agreementSigned: options.capacity.agreementSigned.value,
    canBindRequirement: options.capacity.canBindRequirement.value,
    availableCny: options.capacity.availableCny.value,
    creditCap: options.capacity.creditCap.value,
  }))

  /** 接取资格没过的原因（空串表示可以继续填表）。 */
  const blockReason = computed(() => bindingBlockReason(gate.value))
  /** 只差「签协议」这一件事时，提示条上的按钮是「去签署协议」而不是「去缴纳保证金」。 */
  const agreementBlocked = computed(
    () =>
      Boolean(options.requirement.value) &&
      Boolean(options.requirement.value && requiresDepositGate(options.requirement.value)) &&
      !options.capacity.agreementSigned.value,
  )
  const requiresDeposit = computed(() =>
    Boolean(options.requirement.value && requiresDepositGate(options.requirement.value)),
  )

  const canSubmit = computed(() =>
    canSubmitBinding({
      ...gate.value,
      reviewConfirmed: reviewConfirmed.value,
      finalConfirmed: finalConfirmed.value,
      mode: bindingMode.value,
      selectedResource: selectedResource.value,
      canCreateResource: init.canCreateResource.value,
    }),
  )

  /** 二次确认里显示的「即将关联到哪个资源」。 */
  const confirmLabel = computed(() =>
    confirmResourceLabel({
      mode: bindingMode.value,
      selectedTitle: selectedResource.value?.title,
      initTitle: init.initForm.title,
    }),
  )

  async function loadResources() {
    resourcesLoading.value = true
    try {
      resources.value = await listMcResources(auth.token)
    } finally {
      resourcesLoading.value = false
    }
  }

  /** 换页时把上一次的绑定选择清干净（资源清单与资格另取，不在这里动）。 */
  function resetBindingState() {
    resources.value = []
    bindForm.resourceId = undefined
    reviewConfirmed.value = false
    finalConfirmed.value = false
    init.resetInitForm()
  }

  /** 有现成的私有资源就默认走「关联已有」，否则直接进「初始化新资源」并把标签树取回来。 */
  async function ensureInitialBindingMode() {
    bindingMode.value = availableResourceOptions.value.length > 0 ? 'existing' : 'new'
    if (bindingMode.value === 'new') {
      await init.ensureTagTreeLoaded()
    }
  }

  /** 换了已选资源：二次确认作废（确认的是上一个项目）。 */
  function handleResourceChange() {
    finalConfirmed.value = false
  }

  function handleBindingModeChange(mode: 'existing' | 'new') {
    if (bindingMode.value === mode) {
      return
    }

    bindingMode.value = mode
    finalConfirmed.value = false

    if (mode === 'new') {
      bindForm.resourceId = undefined
      void init.ensureTagTreeLoaded()
    }
  }

  /** 取消勾选「已阅需求」时，第二次确认跟着失效（不能跳过阅读直接确认）。 */
  function handleReviewChange() {
    if (!reviewConfirmed.value) {
      finalConfirmed.value = false
    }
  }

  async function submitBinding() {
    const currentRequirement = options.requirement.value
    if (!auth.token || !currentRequirement) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (blockReason.value) {
      TMessage.warning(blockReason.value)
      return
    }

    if (!reviewConfirmed.value) {
      TMessage.warning('请先完整阅读需求信息，并确认已审阅后再继续')
      return
    }

    if (!finalConfirmed.value) {
      TMessage.warning('请完成二次确认后再关联需求')
      return
    }

    binding.value = true
    try {
      let resourceId = bindForm.resourceId
      let createdResourceTitle = ''

      if (bindingMode.value === 'existing') {
        if (!resourceId) {
          TMessage.warning('请选择要绑定的开发项目')
          return
        }

        if (!selectedResource.value) {
          TMessage.warning('所选开发项目不可用，请重新选择')
          return
        }
      } else {
        if (!init.canCreateResource.value) {
          TMessage.warning(init.createBlockReason.value || '请先补全资源初始化信息')
          return
        }

        if (init.repostUrlMissing()) {
          TMessage.warning('转载资源必须填写原始出处链接')
          return
        }

        const created = await createMcResource(auth.token, init.buildCreatePayload())

        resourceId = created.id
        createdResourceTitle = created.title
      }

      await bindRequirementProject(auth.token, currentRequirement.requirement_id, resourceId!)
      TMessage.success(
        createdResourceTitle
          ? `已初始化资源“${createdResourceTitle}”，并完成需求关联`
          : '需求已关联到开发项目，并进入开发中',
      )
      void router.push({ name: 'dev-my-requirements' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '关联需求失败'
      TMessage.error(message)
    } finally {
      binding.value = false
    }
  }

  return {
    resourcesLoading,
    binding,
    resources,
    bindingMode,
    reviewConfirmed,
    finalConfirmed,
    bindForm,
    init,
    availableResourceOptions,
    hasPendingBindable,
    selectedResource,
    blockReason,
    agreementBlocked,
    requiresDeposit,
    canSubmit,
    confirmLabel,
    loadResources,
    resetBindingState,
    ensureInitialBindingMode,
    handleResourceChange,
    handleBindingModeChange,
    handleReviewChange,
    submitBinding,
    projectOptionLabel: bindableResourceLabel,
  }
}
