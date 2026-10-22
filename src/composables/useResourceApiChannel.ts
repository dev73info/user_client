import { computed, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'
import {
  getResourceApiChannel,
  updateResourceApiChannel,
  type McResourcePayload,
  type ResourceApiChannelPayload,
} from '@/api/mcResources'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from '@/shared/api/url'
import {
  buildApiIntegrationPrompt,
  findInvalidAllowedOrigin,
  formatAllowedOriginsText,
  isValidCallbackUrl,
  listApiChannelBlockers,
  parseAllowedOriginsInput,
} from '@/shared/resourceApi'
import type { ResourceHomepageFormState } from '@/shared/resourceHomepageForm'

/**
 * 渠道区块只读写表单里的这四个字段：编辑页与新建页的表单形状不同（字段名相同），
 * 这里按结构取子集，两页共用同一份渠道状态与校验。
 */
type ApiChannelFormFields = Pick<
  ResourceHomepageFormState,
  'apiCallbackUrl' | 'apiCallbackSecret' | 'apiAllowedOrigins' | 'apiRepeatPurchasable'
>

/**
 * R028 接口资源的渠道配置：回调地址、一次性密钥、允许来源、重复购买。
 *
 * 这块有两个不能弄丢的约定：
 * 1. **一次性密钥**：后端只在首次生成的那次响应里给明文，必须弹窗 + 页内各展示一次，
 *    之后任何读取都只有掩码；
 * 2. **半成功**：主页 PATCH 成功但渠道 PUT 失败时，下一次点「保存」只重发渠道这一半
 *    （`channelRetryOnly`），不能重复 PATCH 主页。
 */
export function useResourceApiChannel(options: {
  resource: Ref<McResourcePayload | null>
  form: ApiChannelFormFields
  isApiKind: Ref<boolean>
  /** 资源加载代际：旧请求的渠道响应不能写到新资源上。 */
  loadGeneration: Ref<number>
  /**
   * 保存成功后是否清空密钥输入框。编辑页留空 = 不改，所以要清；新建页保留开发者这次的输入。
   */
  clearSecretOnApply?: boolean
}) {
  const { resource, form, isApiKind, loadGeneration, clearSecretOnApply = true } = options
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  /** 存量接口资源：开发者补签《接口使用协议》前，保存主页 / 渠道配置都会被后端拒绝。 */
  const needsApiAgreement = computed(() => isApiKind.value && !auth.apiUsageAgreementSigned)

  function goSignApiAgreement() {
    void router.push({
      name: 'contract-sign',
      query: { agreement: 'api', redirect_to: route.fullPath },
    })
  }

  const apiOrigins = computed(() => parseAllowedOriginsInput(form.apiAllowedOrigins))
  const apiCallbackInvalid = computed(
    () => Boolean(form.apiCallbackUrl.trim()) && !isValidCallbackUrl(form.apiCallbackUrl),
  )
  const invalidApiOrigin = computed(() => findInvalidAllowedOrigin(apiOrigins.value))

  /** 渠道配置还不完整时，页面要显式说明「暂不可被下单」（保存仍允许，草稿态）。 */
  const apiChannelBlockers = computed(() =>
    listApiChannelBlockers({
      callback_url: form.apiCallbackUrl,
      allowed_origins: apiOrigins.value,
    }),
  )

  /** 已保存的渠道配置：回显密钥掩码与更新时间。 */
  const savedApiChannel = ref<ResourceApiChannelPayload | null>(null)
  /** 后端首次生成的回调密钥明文：只回显一次，弹窗与页内各展示一份。 */
  const revealedSecretPlain = ref('')
  const secretPlainDialogVisible = ref(false)
  /**
   * 资源主页已保存、只有渠道配置失败时的重试口径：
   * 置真后再点「保存」只重发渠道配置这一半，不重复 PATCH 主页。
   */
  const channelRetryOnly = ref(false)
  const channelSaveError = ref('')

  const savedSecretMaskedLabel = computed(() => {
    if (revealedSecretPlain.value) {
      return '本次已生成'
    }
    const saved = savedApiChannel.value
    if (!saved?.callback_secret_set) {
      return '未生成'
    }
    return saved.callback_secret_masked || '已配置'
  })

  /** 接入提示词：开发者复制给 AI 编码代理，由代理照指导文档完成服务端接入。 */
  const apiIntegrationPrompt = computed(() =>
    buildApiIntegrationPrompt(resource.value?.id, {
      apiBase: API_BASE_URL || (typeof window === 'undefined' ? '' : window.location.origin),
    }),
  )

  /** 把服务端返回的渠道配置落到本地（掩码、明文一次性回显）。 */
  function applySavedApiChannel(saved: ResourceApiChannelPayload) {
    savedApiChannel.value = saved
    if (clearSecretOnApply) {
      form.apiCallbackSecret = ''
    }
    if (saved.callback_secret_plain) {
      revealedSecretPlain.value = saved.callback_secret_plain
      secretPlainDialogVisible.value = true
    }
  }

  /** 切换「允许重复购买」后的状态反馈：控件旁的重复文案已撤掉，改由 TMessage 回话。 */
  function onRepeatPurchasableChange(next: boolean) {
    TMessage.info(next ? '已允许重复购买' : '已关闭重复购买')
  }

  /** 服务端读取的已有配置 → 表单回显（密钥只回掩码，输入框留空）。 */
  function applyLoadedApiChannel(loaded: ResourceApiChannelPayload) {
    savedApiChannel.value = loaded
    form.apiCallbackUrl = loaded.callback_url ?? ''
    form.apiAllowedOrigins = formatAllowedOriginsText(loaded.allowed_origins)
    form.apiRepeatPurchasable = Boolean(loaded.repeat_purchasable)
    form.apiCallbackSecret = ''
  }

  async function loadApiChannel(resourceId: number, generation = loadGeneration.value) {
    if (!auth.token) {
      return
    }

    try {
      const loaded = await getResourceApiChannel(auth.token, resourceId)
      if (generation !== loadGeneration.value) return
      applyLoadedApiChannel(loaded)
    } catch (error) {
      if (generation !== loadGeneration.value) return
      TMessage.warning(
        error instanceof Error
          ? `加载接口资源渠道配置失败：${error.message}`
          : '加载接口资源渠道配置失败',
      )
    }
  }

  /** 复制一次性明文密钥；浏览器不给权限时提示手动复制。 */
  async function copyRevealedSecret() {
    if (!revealedSecretPlain.value) {
      return
    }

    try {
      await navigator.clipboard.writeText(revealedSecretPlain.value)
      TMessage.success('回调密钥已复制，请妥善保存')
    } catch {
      TMessage.warning('复制失败，请手动选中密钥后再复制')
    }
  }

  /** 复制接入提示词（交给 AI 编码代理）。 */
  async function copyApiPrompt() {
    try {
      await navigator.clipboard.writeText(apiIntegrationPrompt.value)
      TMessage.success('接入提示词已复制')
    } catch {
      TMessage.warning('复制失败，请手动选中提示词后再复制')
    }
  }

  /** R028：接口资源配置的本地校验（保存是草稿过程，只挡明显填错的地址）。 */
  function validateApiChannel(): boolean {
    if (!isApiKind.value) {
      return true
    }

    if (form.apiCallbackUrl.trim() && !isValidCallbackUrl(form.apiCallbackUrl)) {
      TMessage.warning(
        '回调地址须为 http(s) 开头的绝对地址，例如 https://shop.example.com/73info/callback',
      )
      return false
    }

    const invalid = findInvalidAllowedOrigin(apiOrigins.value)
    if (invalid) {
      TMessage.warning(
        `允许来源「${invalid}」格式不正确：只支持完整源（https://shop.example.com）、通配域名（*.example.com）或纯 IP`,
      )
      return false
    }

    return true
  }

  /** 只重发渠道配置这一半（资源主页上一轮已经保存）。返回是否成功。 */
  async function saveApiChannelOnly(resourceId: number): Promise<boolean> {
    if (!auth.token) {
      return false
    }

    try {
      applySavedApiChannel(
        await updateResourceApiChannel(auth.token, resourceId, {
          repeat_purchasable: form.apiRepeatPurchasable,
          // 后端以「显式空串」表示清空，null / 缺省表示不改
          callback_url: form.apiCallbackUrl.trim(),
          // 留空 = 不改；首次留空时后端自动生成，明文只在这次响应里回显
          callback_secret: form.apiCallbackSecret.trim() || null,
          allowed_origins: apiOrigins.value,
        }),
      )
      channelRetryOnly.value = false
      channelSaveError.value = ''
      return true
    } catch (error) {
      channelRetryOnly.value = true
      channelSaveError.value = error instanceof Error ? error.message : '保存接口资源渠道配置失败'
      TMessage.error(
        `资源主页已保存，但接口资源渠道配置未保存成功：${channelSaveError.value}。请修正后重试，重试只会重发渠道配置。`,
      )
      return false
    }
  }

  /** 换资源前复位只属于上一个资源的渠道状态。 */
  function resetChannelState() {
    savedApiChannel.value = null
    revealedSecretPlain.value = ''
    secretPlainDialogVisible.value = false
    channelRetryOnly.value = false
    channelSaveError.value = ''
    form.apiCallbackUrl = ''
    form.apiCallbackSecret = ''
    form.apiAllowedOrigins = ''
    form.apiRepeatPurchasable = false
  }

  return {
    needsApiAgreement,
    goSignApiAgreement,
    apiOrigins,
    apiCallbackInvalid,
    invalidApiOrigin,
    apiChannelBlockers,
    savedApiChannel,
    revealedSecretPlain,
    secretPlainDialogVisible,
    channelRetryOnly,
    channelSaveError,
    savedSecretMaskedLabel,
    apiIntegrationPrompt,
    applySavedApiChannel,
    onRepeatPurchasableChange,
    applyLoadedApiChannel,
    loadApiChannel,
    copyRevealedSecret,
    copyApiPrompt,
    validateApiChannel,
    saveApiChannelOnly,
    resetChannelState,
  }
}
