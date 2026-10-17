<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createMcResource,
  getMcResource,
  updateMcResourceHomepage,
  updateResourceApiChannel,
  uploadMcResourceCover,
  type CreateMcResourceTagSelection,
  type McResourceKind,
  type McResourcePayload,
  type ResourceApiChannelPayload,
} from '@/api/mcResources'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { listMyTeams, type TeamResponse } from '@/api/team'
import ResourceIconPicker from '@/components/ResourceIconPicker.vue'

import {
  caretAfterStripLeadingZeros,
  parsePointsPriceInput,
  parsePromoSharePercentInput,
  parseYuanPriceInput,
  stripLeadingZeros,
} from '@/shared/resourceSale'
import { API_BASE_URL } from '@/shared/api/url'
import {
  buildApiIntegrationPrompt,
  findInvalidAllowedOrigin,
  isValidCallbackUrl,
  listApiChannelBlockers,
  parseAllowedOriginsInput,
  resourceKindFromQuery,
} from '@/shared/resourceApi'

import {
  TAlert,
  TButton,
  TCard,
  TCheckbox,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TOption,
  TSelect,
  TSwitch,
  TTag,
  MagicStick,
  Refresh,
  type SelectModelValue,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

/**
 * R028：资源类别由入口决定——两条创建路由各自把 `kind` 传进来（`dev-plugins` = 普通资源、
 * `dev-plugins-api` = 接口资源），表单里不再有「资源类别」这个可选项。
 */
const props = withDefaults(defineProps<{ kind?: McResourceKind }>(), { kind: 'normal' })
const resourceKind = computed<McResourceKind>(() => (props.kind === 'api' ? 'api' : 'normal'))

const processedTree = ref<McProcessedTagTree>({ roots: [] })
const currentRootKey = ref('')
const currentEntryKey = ref('')
const isLoadingTags = ref(false)
const submitting = ref(false)
const selectedIconFile = ref<File | null>(null)
const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})
const myTeams = ref<TeamResponse[]>([])
const form = reactive({
  title: '',
  author: auth.username || '',
  coverUrl: '',
  ownershipType: 'individual' as 'individual' | 'team',
  teamId: '',
  originType: 'original' as 'original' | 'repost',
  originAuthor: '',
  originUrl: '',
  originOrg: '',
  originNote: '',
  priceYuan: '0',
  pricePoints: '0',
  /** R029 售卖推广分成比例：百分比数值（0～50，拖动条，0 = 关闭） */
  promoSharePercent: 0,
  copyrightDeclared: false,
  /** R028 接口资源渠道配置（进的是接口资源创建页才展开） */
  apiCallbackUrl: '',
  apiCallbackSecret: '',
  /** 允许来源：多行文本，一行一个 */
  apiAllowedOrigins: '',
  apiRepeatPurchasable: false,
  apiAllowStrangers: true,
})

/** 售价（元）输入框实例：实时归一前导 0 时要拿到它的底层 input 来改写值并复位光标 */
const cashPriceInputRef = ref<InstanceType<typeof TInput> | null>(null)

const parsedPriceFen = computed(() => parseYuanPriceInput(form.priceYuan))
const parsedPricePoints = computed(() => parsePointsPriceInput(form.pricePoints))
/** R029：推广分成比例（万分比）；校验失败时 `ok` 为假，字段上展示同一句文案 */
const parsedPromoShare = computed(() => parsePromoSharePercentInput(form.promoSharePercent))
const promoShareError = computed(() =>
  parsedPromoShare.value.ok ? '' : parsedPromoShare.value.message,
)
/** R029：拖动条展示口径（与提交口径同源：0 = 关闭） */
const promoSharePercentValue = computed(() =>
  parsedPromoShare.value.ok ? parsedPromoShare.value.bps / 100 : 0,
)
const promoShareDisplay = computed(() =>
  promoSharePercentValue.value > 0 ? `${promoSharePercentValue.value}%` : '关闭',
)
const hasCashPrice = computed(() => parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0)
const hasPointsPrice = computed(
  () => parsedPricePoints.value.ok && parsedPricePoints.value.points > 0,
)
const cashPriceDisabled = computed(() => hasPointsPrice.value)
const pointsPriceDisabled = computed(() => hasCashPrice.value)
const showCopyrightField = computed(
  () => hasCashPrice.value || hasPointsPrice.value || form.copyrightDeclared,
)

/**
 * 售价（元）实时归一：去掉整数部分的前导 0（`00100` → `100`）。
 *
 * 为什么要自己改 DOM：`TInput` 的 `:value` 只在模型真的变了才回写输入框，而 `00` → `0`
 * 这类归一不会改变模型，输入框就会停在被归一前的文本上。所以这里拿底层 input 直接改写，
 * 并把光标按被删掉的位数左移，避免打字时光标跳到开头。
 * 底层 input 来自 `TInput` 的 `defineExpose`（实例代理会把那个 ref 解包成元素）。
 */
function normalizeCashPriceInput() {
  const raw = form.priceYuan
  const normalized = stripLeadingZeros(raw)
  if (normalized === raw) {
    return
  }

  const el = cashPriceInputRef.value?.inputRef ?? null
  const caret = el?.selectionStart ?? null
  form.priceYuan = normalized
  if (!el) {
    return
  }

  el.value = normalized
  if (caret !== null) {
    const next = caretAfterStripLeadingZeros(raw, caret)
    el.setSelectionRange(next, next)
  }
}

function onCashPriceInput() {
  normalizeCashPriceInput()
  if (hasCashPrice.value) {
    form.pricePoints = '0'
  }
}

function onPointsPriceInput() {
  if (hasPointsPrice.value) {
    form.priceYuan = '0'
  }
}

/* ---------- R028 接口资源：渠道配置与一次性密钥 ---------- */

const isApiKind = computed(() => resourceKind.value === 'api')
/**
 * 接口资源一律按「原创」归类（不选标签归类、不属于任何根节点 / 二级节点），
 * 表单里不再给「原创 / 转载」这个选择；普通资源仍按开发者选的值提交。
 */
const effectiveOriginType = computed<'original' | 'repost'>(() =>
  isApiKind.value ? 'original' : form.originType,
)
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

/**
 * 资源本身已落库、后续步骤（渠道配置 / 公开申请）没跑完时的重试锚点。
 * 有值时再点保存不会重复建资源，只补没成功的那一半。
 */
const createdResourceId = ref<number | null>(null)
/** 已保存的渠道配置：回显密钥掩码与更新时间。 */
const savedApiChannel = ref<ResourceApiChannelPayload | null>(null)
/** 后端首次生成的回调密钥明文：只回显一次，弹窗与页内各展示一份。 */
const revealedSecretPlain = ref('')
const secretPlainDialogVisible = ref(false)

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
  buildApiIntegrationPrompt(createdResourceId.value, {
    apiBase: API_BASE_URL || (typeof window === 'undefined' ? '' : window.location.origin),
  }),
)

/** 把服务端返回的渠道配置落到本地（掩码、明文一次性回显）。 */
function applySavedApiChannel(saved: ResourceApiChannelPayload) {
  savedApiChannel.value = saved
  if (saved.callback_secret_plain) {
    revealedSecretPlain.value = saved.callback_secret_plain
    secretPlainDialogVisible.value = true
  }
}

/** 复制一次性明文密钥；浏览器不给权限时提示手动复制。 */
async function copyRevealedSecret() {
  if (!revealedSecretPlain.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(revealedSecretPlain.value)
    showToast('回调密钥已复制，请妥善保存', 'success')
  } catch {
    showToast('复制失败，请手动选中密钥后再复制', 'warning')
  }
}

/** 开发者在弹窗里确认已保存密钥后，收尾并回资源列表。 */
async function confirmSecretSaved() {
  secretPlainDialogVisible.value = false
  showToast('回调密钥不会再显示，如需更换请在配置里重新填写并保存', 'info')
  resetForm()
  await router.push({ name: 'dev-resource-list' })
}

/** 复制接入提示词（交给 AI 编码代理）。 */
async function copyApiPrompt() {
  try {
    await navigator.clipboard.writeText(apiIntegrationPrompt.value)
    showToast('接入提示词已复制', 'success')
  } catch {
    showToast('复制失败，请手动选中提示词后再复制', 'warning')
  }
}

const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)

const currentRoot = computed<McTagCatalogRoot | null>(
  () => rootTabs.value.find((r) => r.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)

const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])

const currentEntry = computed<McTagCatalogEntry | null>(
  () =>
    entryTabs.value.find((entry) => entry.key === currentEntryKey.value) ??
    entryTabs.value[0] ??
    null,
)
const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
const currentRootLabel = computed(() => currentRoot.value?.label || '根节点')
const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
const currentPlatformLabel = computed(() => currentPlatform.value || '当前分区')
const platformTagGroups = computed<McPublishTagGroup[]>(
  () => currentEntry.value?.publish_groups ?? [],
)
const selectedTagCount = computed(() =>
  Object.values(selectedTagIdsByGroup).reduce((sum, ids) => sum + ids.length, 0),
)

const teamOptions = computed(() =>
  myTeams.value.map((team) => ({
    value: String(team.team_id),
    label: team.name,
  })),
)
const hasJoinedTeam = computed(() => myTeams.value.length > 0)

const resourceSummary = computed(() => {
  if (!form.title.trim()) {
    return ''
  }

  // 接口资源不选标签归类、不属于任何根节点 / 二级节点，简介里只交代「接口资源 · 原创」
  if (isApiKind.value) {
    return '接口资源，原创。'
  }

  const scopeLabel = `${currentEntryLabel.value} · ${currentPlatformLabel.value}`
  return `${scopeLabel}资源，已选择 ${selectedTagCount.value} 个标签。`
})
const normalizedResourceKey = computed(() => {
  const base = form.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base || 'resource'
})
const derivedFileName = computed(() => `${normalizedResourceKey.value}.package`)
const derivedSourceUrl = computed(() => {
  // 接口资源没有根节点 / 二级节点，来源地址用资源类别占位
  if (isApiKind.value) {
    return `pending://resource/api/${normalizedResourceKey.value}`
  }

  const platformKey = currentPlatform.value
  const entryKey = currentEntryKey.value || 'catalog'
  return `pending://resource/${platformKey}/${entryKey}/${normalizedResourceKey.value}`
})
const submitBlockReason = computed(() => {
  if (!form.title.trim()) {
    return '请填写资源标题'
  }

  if (!form.author.trim()) {
    return '请填写作者名称'
  }

  if (form.ownershipType === 'team' && !form.teamId) {
    return '请选择所属团队'
  }

  // 接口资源不选标签归类，标签相关的必填项对它不成立
  if (!isApiKind.value) {
    if (platformTagGroups.value.length === 0) {
      return '当前二级节点尚未配置完整标签组'
    }

    if (selectedTagCount.value === 0) {
      return '请至少选择一个标签'
    }
  }

  return ''
})
const canSubmit = computed(() => {
  return !submitBlockReason.value
})

watch(
  () => auth.username,
  (username) => {
    if (!form.author.trim() && username) {
      form.author = username
    }
  },
  { immediate: true },
)

watch(
  () => form.ownershipType,
  (value) => {
    if (value !== 'team') {
      form.teamId = ''
    }
  },
)

watch(
  platformTagGroups,
  (groups) => {
    const validGroupIds = new Set(groups.map((group) => group.group_id))

    for (const key of Object.keys(selectedTagIdsByGroup)) {
      const groupId = Number(key)
      if (!validGroupIds.has(groupId)) {
        delete selectedTagIdsByGroup[groupId]
        continue
      }

      const group = groups.find((item) => item.group_id === groupId)
      if (!group) {
        continue
      }

      const validTagIds = new Set(group.items.map((item) => item.id))
      selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) =>
        validTagIds.has(tagId),
      )
    }

    for (const group of groups) {
      if (!selectedTagIdsByGroup[group.group_id]) {
        selectedTagIdsByGroup[group.group_id] = []
      }
    }
  },
  { immediate: true },
)

onMounted(async () => {
  auth.hydrate()
  if (auth.username) {
    form.author = auth.username
  }
  await loadTagTree()
  await loadMyTeams()

  // R028：入口已拆成两条创建路由，老链接上的 `?kind=api` 直接改道到接口资源创建页
  if (props.kind !== 'api' && resourceKindFromQuery(route.query.kind) === 'api') {
    const query = { ...route.query }
    delete query.kind
    await router.replace({ name: 'dev-plugins-api', query })
    return
  }

  // 从「团队资源」页进入时，自动归属团队项目
  if (route.query.ownership === 'team' && hasJoinedTeam.value) {
    form.ownershipType = 'team'
    const onlyTeam = myTeams.value[0]
    // 若只有一个团队，自动选中；多个团队则让用户挑选
    if (myTeams.value.length === 1 && onlyTeam) {
      form.teamId = String(onlyTeam.team_id)
    }
  }
})

async function loadMyTeams() {
  if (!auth.token) return
  try {
    myTeams.value = await listMyTeams(auth.token)
  } catch (error) {
    console.error('Failed to load teams:', error)
  }
}

async function loadTagTree() {
  isLoadingTags.value = true
  try {
    invalidateTagTreeCache()
    processedTree.value = await getProcessedTagTree()

    const firstRoot = processedTree.value.roots[0]
    if (firstRoot && !processedTree.value.roots.some((r) => r.key === currentRootKey.value)) {
      currentRootKey.value = firstRoot.key
      currentEntryKey.value = firstRoot.first_entry_key ?? ''
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载标签失败'
    showToast(message, 'error')
  } finally {
    isLoadingTags.value = false
  }
}

/**
 * 根节点下拉改选：二级节点随之落到新根节点的首个二级节点。
 * 不这么做时，`currentEntryKey` 会留着上一棵树里的 key，`currentEntry` 落到兜底值，
 * 界面像是「切换了根节点但二级节点没动」。
 */
function selectRoot(value: SelectModelValue) {
  const rootKey = typeof value === 'string' ? value : ''
  const root = rootTabs.value.find((item) => item.key === rootKey)
  if (!root) {
    return
  }

  currentRootKey.value = root.key
  currentEntryKey.value = root.first_entry_key ?? ''
}

/** 二级节点下拉改选：选项由当前根节点决定，这里再确认一次值还在候选里。 */
function selectEntry(value: SelectModelValue) {
  const entryKey = typeof value === 'string' ? value : ''
  if (!entryTabs.value.some((entry) => entry.key === entryKey)) {
    return
  }

  currentEntryKey.value = entryKey
}

function buildTagSelections(): CreateMcResourceTagSelection[] {
  // 接口资源不选标签归类、不属于任何根节点 / 二级节点：一个标签都不提交
  if (isApiKind.value) {
    return []
  }

  return platformTagGroups.value
    .map((group) => ({
      group_id: group.group_id,
      tag_ids: [...(selectedTagIdsByGroup[group.group_id] ?? [])],
    }))
    .filter((selection) => selection.tag_ids.length > 0)
}

function resetForm() {
  form.title = ''
  form.author = auth.username || ''
  form.coverUrl = ''
  form.ownershipType = 'individual'
  form.teamId = ''
  form.originType = 'original'
  form.originAuthor = ''
  form.originUrl = ''
  form.originOrg = ''
  form.originNote = ''
  form.priceYuan = '0'
  form.pricePoints = '0'
  form.promoSharePercent = 0
  form.copyrightDeclared = false
  form.apiCallbackUrl = ''
  form.apiCallbackSecret = ''
  form.apiAllowedOrigins = ''
  form.apiRepeatPurchasable = false
  form.apiAllowStrangers = true
  selectedIconFile.value = null
  createdResourceId.value = null
  savedApiChannel.value = null
  revealedSecretPlain.value = ''
  secretPlainDialogVisible.value = false

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    selectedTagIdsByGroup[Number(key)] = []
  }
}

/** R028：接口资源配置的本地校验（保存是草稿过程，只挡明显填错的地址）。 */
function validateApiChannel(): boolean {
  if (!isApiKind.value) {
    return true
  }

  if (form.apiCallbackUrl.trim() && !isValidCallbackUrl(form.apiCallbackUrl)) {
    showToast(
      '回调地址须为 http(s) 开头的绝对地址，例如 https://shop.example.com/73info/callback',
      'warning',
    )
    return false
  }

  const invalid = findInvalidAllowedOrigin(apiOrigins.value)
  if (invalid) {
    showToast(
      `允许来源「${invalid}」格式不正确：只支持完整源（https://shop.example.com）、通配域名（*.example.com）或纯 IP`,
      'warning',
    )
    return false
  }

  return true
}

async function submitResource(mode: 'private' | 'public') {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!canSubmit.value) {
    showToast('请先补全必填字段', 'warning')
    return
  }

  if (effectiveOriginType.value === 'repost' && !form.originUrl.trim()) {
    showToast('转载资源必须填写原始出处链接', 'warning')
    return
  }

  if (!validateApiChannel()) {
    return
  }

  const priceParsed = parseYuanPriceInput(form.priceYuan)
  if (!priceParsed.ok) {
    showToast(priceParsed.message, 'warning')
    return
  }
  const pointsParsed = parsePointsPriceInput(form.pricePoints)
  if (!pointsParsed.ok) {
    showToast(pointsParsed.message, 'warning')
    return
  }
  if (priceParsed.fen > 0 && pointsParsed.points > 0) {
    showToast('现金售价与积分售价不能同时设置', 'warning')
    return
  }
  // R028：接口资源只走现金价（积分购是平台内入口，指定地址售卖没有它）
  if (isApiKind.value) {
    if (pointsParsed.points > 0) {
      showToast('接口资源只能设置现金售价，不能设置积分售价', 'warning')
      return
    }
    // 开放接口下单要求现金售价大于 0：公开申请前先填上，否则审过也卖不出去
    if (mode === 'public' && priceParsed.fen <= 0) {
      showToast('接口资源提交公开申请前必须填写现金售价（元）', 'warning')
      return
    }
  }
  // R029：推广分成比例先在前端拦一道（0～50，留空 = 关闭），别指望后端 400 兜底
  const promoParsed = parsedPromoShare.value
  if (!promoParsed.ok) {
    showToast(promoParsed.message, 'warning')
    return
  }
  if (
    (priceParsed.fen > 0 || pointsParsed.points > 0) &&
    !form.copyrightDeclared &&
    mode === 'public'
  ) {
    showToast('付费资源公开申请前必须勾选版权声明', 'warning')
    return
  }

  submitting.value = true

  try {
    let resource: McResourcePayload

    // 保存顺序：先资源本身（payload 里带 resource_kind）拿 resource_id，再 PUT 渠道配置。
    // 上一轮资源已建好、只是后续步骤失败时，这里不再重复建资源。
    if (createdResourceId.value === null) {
      resource = await createMcResource(auth.token, {
        // 接口资源不属于任何根节点 / 二级节点，没有平台可填；用资源类别占位（后端平台字段必填）
        platform: isApiKind.value ? '接口资源' : currentPlatform.value,
        title: form.title.trim(),
        author: form.author.trim(),
        description: resourceSummary.value,
        tag_selections: buildTagSelections(),
        file_name: derivedFileName.value,
        source_url: derivedSourceUrl.value,
        cover_url: null,
        docs_url: null,
        visibility: 'draft',
        release_note: null,
        ownership_type: form.ownershipType,
        team_id: form.ownershipType === 'team' && form.teamId ? Number(form.teamId) : null,
        origin_type: effectiveOriginType.value,
        origin_author: form.originAuthor.trim() || null,
        origin_url: form.originUrl.trim() || null,
        origin_org: form.originOrg.trim() || null,
        origin_note: form.originNote.trim() || null,
        price_fen: priceParsed.fen,
        price_points: isApiKind.value ? 0 : pointsParsed.points,
        copyright_declared: form.copyrightDeclared,
        resource_kind: resourceKind.value,
        // R029：推广分成比例随资源一次保存；0 = 关闭，显式下发，不靠省略字段表达「不改」
        promo_share_bps: promoParsed.bps,
      })
      createdResourceId.value = resource.id
    } else {
      resource = await getMcResource(auth.token, createdResourceId.value)
    }

    if (selectedIconFile.value) {
      try {
        resource = await uploadMcResourceCover(auth.token, resource.id, selectedIconFile.value)
      } catch (error) {
        showToast(
          error instanceof Error
            ? `资源已初始化，但图标上传失败：${error.message}`
            : '资源已初始化，但图标上传失败',
          'warning',
        )
      }
    }

    if (isApiKind.value) {
      try {
        const saved = await updateResourceApiChannel(auth.token, resource.id, {
          resource_kind: 'api',
          repeat_purchasable: form.apiRepeatPurchasable,
          callback_url: form.apiCallbackUrl.trim() || null,
          // 留空 = 不改；首次留空时后端自动生成，明文只在这次响应里回显
          callback_secret: form.apiCallbackSecret.trim() || null,
          allow_strangers: form.apiAllowStrangers,
          allowed_origins: apiOrigins.value,
        })
        applySavedApiChannel(saved)
      } catch (error) {
        // 资源已存、渠道没存：明确报错并留在表单上，重试只重发渠道配置
        const message = error instanceof Error ? error.message : '保存接口资源渠道配置失败'
        showToast(
          `资源已保存（编号 #${resource.id}），但接口资源渠道配置未保存成功：${message}。请修正后重试，重试只会重发渠道配置。`,
          'error',
        )
        return
      }
    }

    if (mode === 'public') {
      resource = await updateMcResourceHomepage(auth.token, resource.id, {
        title: resource.title,
        author: resource.author,
        description: resource.description,
        cover_url: resource.cover_url,
        docs_url: resource.docs_url,
        visibility: 'review',
        release_note: resource.release_note,
        origin_type: effectiveOriginType.value,
        origin_author: form.originAuthor.trim() || null,
        origin_url: form.originUrl.trim() || null,
        origin_org: form.originOrg.trim() || null,
        origin_note: form.originNote.trim() || null,
        price_fen: priceParsed.fen,
        price_points: isApiKind.value ? 0 : pointsParsed.points,
        copyright_declared: form.copyrightDeclared,
        resource_kind: resourceKind.value,
        promo_share_bps: promoParsed.bps,
      })
    }

    showToast(
      mode === 'public'
        ? `公开申请已提交，项目编号 #${resource.id}`
        : `资源已初始化为私有项目，编号 #${resource.id}`,
      'success',
    )

    if (revealedSecretPlain.value) {
      // 明文只显示这一次：留住表单等开发者确认已保存，再回列表
      showToast('回调密钥已生成，且只显示这一次，请立即复制保存', 'warning')
      return
    }

    resetForm()
    await router.push({ name: 'dev-resource-list' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布资源失败'
    showToast(message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-page--publish">
    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、页面级操作在右）。
         这一页原来直接从表单卡片开始，没有读数条；「刷新标签」也藏在标签卡片的卡片头里，
         同一个动作在别的页都在顶条右侧，这里挪上来后全模块只剩一个位置。 -->
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <!-- 接口资源不选标签归类、不属于任何根节点 / 二级节点，读数条只交代类别与「原创」 -->
        <template v-if="isApiKind">
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">资源类别</span>
            <span class="dev-meta-strip__value">接口资源</span>
          </div>
          <div class="dev-meta-strip__divider" />
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">类型</span>
            <span class="dev-meta-strip__value">原创</span>
          </div>
        </template>
        <template v-else>
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">根节点</span>
            <span class="dev-meta-strip__value">{{ currentRootLabel }}</span>
          </div>
          <div class="dev-meta-strip__divider" />
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">二级节点</span>
            <span class="dev-meta-strip__value">{{ currentEntryLabel }}</span>
          </div>
          <div class="dev-meta-strip__divider" />
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">已选标签</span>
            <span class="dev-meta-strip__value">{{ selectedTagCount }}</span>
          </div>
          <div class="dev-meta-strip__item dev-meta-strip__action">
            <TButton icon-only aria-label="刷新标签" :loading="isLoadingTags" @click="loadTagTree">
              <TIcon>
                <Refresh />
              </TIcon>
            </TButton>
          </div>
        </template>
      </div>
    </WorkbenchBarSlot>

    <div class="dev-upload-layout">
      <TCard class="dev-surface-card dev-upload-combined-card">
        <section class="dev-upload-block">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">基础信息</h3>
            </section>
          </header>

          <TForm label-position="top" class="dev-upload-form">
            <!-- 字段顺序按需求方定的口径：图标文件 → 资源标题 → 归属 → 类型 / 版权 → 售价（元）→
                 售价（积分）→ 推广分成；转载来源那组字段随「类型 = 转载」在末尾展开，
                 不插在上面几项中间。资源类别不在表单里：它是入口决定的（普通资源 / 接口资源各一条创建路由）。

                 排布见 dev-resource.css 的 `.dev-upload-grid--form`：flex-wrap + 按内容取宽，
                 同行字段依次排满、放不下才换行，行尾余量交给可伸缩的字段（资源标题、原始出处链接、
                 转载说明、推广分成）吃掉，所以不必给谁预留固定档位。 -->
            <div class="dev-upload-grid dev-upload-grid--form">
              <TFormItem label="图标文件" class="dev-form-item--icon">
                <ResourceIconPicker v-model="form.coverUrl" v-model:file="selectedIconFile" />
              </TFormItem>

              <!-- 资源标题是可伸缩档：占位文案「例如：Better Combat Reloaded」实测要 212.4px，
                   比短档（150px）宽；行尾余下的空间就落在它身上，不再单独收窄。 -->
              <TFormItem label="资源标题" required class="dev-form-item--wide">
                <TInput
                  show-count
                  v-model="form.title"
                  :maxlength="200"
                  placeholder="例如：Better Combat Reloaded"
                />
              </TFormItem>

              <TFormItem label="归属" required class="dev-form-item--short">
                <TSelect v-model="form.ownershipType">
                  <TOption label="个人项目" value="individual" />
                  <TOption label="团队项目" value="team" :disabled="!hasJoinedTeam" />
                </TSelect>
              </TFormItem>

              <TFormItem
                v-show="form.ownershipType === 'team'"
                label="所属团队"
                required
                class="dev-form-item--mid"
              >
                <div class="dev-team-select-native">
                  <TSelect
                    v-model="form.teamId"
                    placeholder="请选择团队"
                    class="dev-team-select-native__control"
                  >
                    <TOption
                      v-for="team in teamOptions"
                      :key="team.value"
                      :label="team.label"
                      :value="team.value"
                    />
                    <template #empty>
                      <div class="dev-team-select-empty">
                        <p v-if="myTeams.length === 0">您还没有加入任何团队</p>
                        <p v-else>未找到匹配的团队</p>
                      </div>
                    </template>
                  </TSelect>
                </div>
              </TFormItem>

              <!-- 「类型」（原创 / 转载）说的是版权性质，与版权声明同属「版权」这一项，排在它前面；
                   两者各自按内容取宽：类型是下拉（短档），版权声明那句勾选文案要 310px 才不折行。
                   版权声明只在填了价格或已勾选时出现（见 showCopyrightField），
                   它不出现时后面的字段自然前移——不再为「整行落位稳定」预留半格空档。 -->
              <!-- 接口资源一律「原创」（见 effectiveOriginType），不给这个选择 -->
              <TFormItem v-if="!isApiKind" label="类型" class="dev-form-item--short">
                <TSelect v-model="form.originType" style="width: 100%">
                  <TOption label="原创" value="original" />
                  <TOption label="转载" value="repost" />
                </TSelect>
              </TFormItem>

              <TFormItem v-if="showCopyrightField" label="版权" class="dev-form-item--copyright">
                <TCheckbox v-model="form.copyrightDeclared">
                  我确认拥有该资源版权，或已获得合法授权可售卖
                </TCheckbox>
              </TFormItem>

              <!-- 售价（元）/ 售价（积分）两项互斥、成对出现，绑在同一个 `.dev-price-group` 里
                   （见 dev-resource.css）：换行时不会被拆到两行去，各自宽度由那一组给。 -->
              <div class="dev-price-group">
                <TFormItem label="售价（元）">
                  <TInput
                    ref="cashPriceInputRef"
                    v-model="form.priceYuan"
                    :disabled="cashPriceDisabled"
                    placeholder="0 表示免费"
                    inputmode="decimal"
                    :title="isApiKind ? undefined : '与售价（积分）互斥'"
                    @input="onCashPriceInput"
                  />
                  <p v-if="cashPriceDisabled" class="dev-field-hint">
                    已填售价（积分），售价（元）已禁用。
                  </p>
                </TFormItem>

                <TFormItem v-if="!isApiKind" label="售价（积分）">
                  <TInput
                    v-model="form.pricePoints"
                    :disabled="pointsPriceDisabled"
                    placeholder="0 表示不走积分购"
                    inputmode="numeric"
                    title="与售价（元）互斥"
                    @input="onPointsPriceInput"
                  />
                  <p v-if="pointsPriceDisabled" class="dev-field-hint">
                    已填售价（元），售价（积分）已禁用。
                  </p>
                </TFormItem>
              </div>

              <!-- R029 推广分成：0～50（%），0 = 关闭；拖动条 + 百分比展示，随资源一次保存（promo_share_bps） -->
              <TFormItem label="推广分成" class="dev-form-item--promo">
                <div class="dev-promo-share">
                  <input
                    v-model.number="form.promoSharePercent"
                    class="dev-promo-share__range"
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    :title="promoShareDisplay"
                    aria-label="推广分成（百分比，0 表示关闭）"
                  />
                  <span
                    class="dev-promo-share__value"
                    :class="{ 'is-off': promoSharePercentValue <= 0 }"
                    >{{ promoShareDisplay }}</span
                  >
                </div>
                <p v-if="promoShareError" class="dev-field-hint dev-field-hint--error">
                  {{ promoShareError }}
                </p>
              </TFormItem>

              <template v-if="effectiveOriginType === 'repost'">
                <TFormItem label="原作者">
                  <TInput
                    v-model="form.originAuthor"
                    :maxlength="80"
                    placeholder="原始资源的作者"
                  />
                </TFormItem>
                <TFormItem label="原始出处链接" required class="dev-form-item--wide">
                  <TInput
                    v-model="form.originUrl"
                    :maxlength="500"
                    placeholder="原始出处 URL，例如原贴/来源页"
                  />
                </TFormItem>
                <TFormItem label="来源站点">
                  <TInput
                    v-model="form.originOrg"
                    :maxlength="80"
                    placeholder="例如：苦力怕论坛、CurseForge"
                  />
                </TFormItem>
                <TFormItem label="转载说明 / 授权" class="dev-form-item--wide">
                  <TInput
                    v-model="form.originNote"
                    :maxlength="500"
                    placeholder="授权情况、转载说明等（可选）"
                  />
                </TFormItem>
              </template>
            </div>
          </TForm>
        </section>

        <!-- R028 接口资源：只有接口资源创建页（dev-plugins-api）才有这一段。
             字段与后端契约一一对应（资源类别随资源一次保存，渠道配置在资源建好之后 PUT）。 -->
        <section v-if="isApiKind" class="dev-upload-block dev-upload-block--split">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">接口资源接入配置</h3>
            </section>
          </header>

          <TAlert
            v-if="apiChannelBlockers.length"
            tone="warning"
            variant="soft"
            class="dev-api-notice"
            title="配置还没配齐，暂不可被下单"
            :description="`${apiChannelBlockers.join('；')}。可以先存草稿，配齐后再保存一次。`"
          />

          <TForm label-position="top" class="dev-upload-form">
            <div class="dev-upload-grid dev-upload-grid--form">
              <TFormItem label="回调地址" class="dev-form-item--wide">
                <TInput
                  v-model="form.apiCallbackUrl"
                  :maxlength="500"
                  placeholder="https://shop.example.com/73info/callback"
                />
                <p v-if="apiCallbackInvalid" class="dev-field-hint dev-field-hint--error">
                  当前不合法：请填 http(s) 绝对地址。
                </p>
              </TFormItem>

              <TFormItem label="回调密钥" class="dev-form-item--wide">
                <TInput
                  v-model="form.apiCallbackSecret"
                  type="password"
                  :maxlength="128"
                  autocomplete="new-password"
                  placeholder="留空 = 不改"
                />
                <p class="dev-field-hint">当前：{{ savedSecretMaskedLabel }}</p>
              </TFormItem>

              <TFormItem label="购买限制" class="dev-form-item--switch">
                <div class="dev-api-switch-row">
                  <label class="dev-api-switch">
                    <TSwitch v-model="form.apiRepeatPurchasable" aria-label="允许重复购买" />
                    <span>允许重复购买</span>
                  </label>
                  <label class="dev-api-switch">
                    <TSwitch v-model="form.apiAllowStrangers" aria-label="允许陌生用户购买" />
                    <span>允许陌生用户购买</span>
                  </label>
                </div>
              </TFormItem>

              <TFormItem label="是否公开展示" class="dev-form-item--short">
                <TTag variant="soft" tone="neutral">不在大厅展示</TTag>
              </TFormItem>

              <!-- 顺序是有意的：可伸缩的多行清单放最后，行尾余量落在它身上，
                   最后一行不会被撑成半空；购买限制与是否公开展示按内容取宽、并排成一行。 -->
              <TFormItem label="允许的来源地址" class="dev-form-item--wide">
                <TInput
                  v-model="form.apiAllowedOrigins"
                  type="textarea"
                  :autosize="{ minRows: 5, maxRows: 12 }"
                  :maxlength="2000"
                  placeholder="https://shop.example.com&#10;*.example.com&#10;203.0.113.9"
                />
                <p v-if="invalidApiOrigin" class="dev-field-hint dev-field-hint--error">
                  当前不合法：{{ invalidApiOrigin }}
                </p>
              </TFormItem>
            </div>
          </TForm>

          <div v-if="revealedSecretPlain" class="dev-api-secret">
            <p class="dev-api-secret__title">回调密钥（只显示这一次，请立即复制保存）</p>
            <code class="dev-api-secret__value">{{ revealedSecretPlain }}</code>
            <TButton variant="outline" @click="copyRevealedSecret">复制密钥</TButton>
          </div>

          <div class="dev-api-sample">
            <div class="dev-api-sample__head">
              <h4 class="dev-api-sample__title">接入提示词（复制给 AI 编码代理）</h4>
              <TButton variant="outline" @click="copyApiPrompt">复制提示词</TButton>
            </div>
            <pre class="dev-api-sample__code">{{ apiIntegrationPrompt }}</pre>
          </div>
        </section>

        <!-- 接口资源不选标签归类（不属于任何根节点 / 二级节点），整块不出现 -->
        <section v-if="!isApiKind" class="dev-upload-block dev-upload-block--split">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">标签归类</h3>
            </section>
          </header>

          <div class="dev-catalog-section">
            <div class="dev-upload-grid dev-upload-grid--two">
              <section class="dev-catalog-select">
                <div class="dev-catalog-select__head">
                  <span class="dev-catalog-select__label">根节点</span>
                  <span class="dev-catalog-select__meta">当前：{{ currentRootLabel }}</span>
                </div>
                <TSelect
                  aria-label="根节点"
                  :model-value="currentRootKey"
                  :loading="isLoadingTags"
                  placeholder="选择根节点"
                  @change="selectRoot"
                >
                  <TOption
                    v-for="root in rootTabs"
                    :key="root.key"
                    :label="root.label"
                    :value="root.key"
                  />
                </TSelect>
              </section>

              <section v-if="entryTabs.length > 0" class="dev-catalog-select">
                <div class="dev-catalog-select__head">
                  <span class="dev-catalog-select__label">二级节点</span>
                  <span class="dev-catalog-select__meta">当前：{{ currentEntryLabel }}</span>
                </div>
                <TSelect
                  aria-label="二级节点"
                  :model-value="currentEntryKey"
                  placeholder="选择二级节点"
                  @change="selectEntry"
                >
                  <TOption
                    v-for="entry in entryTabs"
                    :key="entry.key"
                    :label="entry.group_name"
                    :value="entry.key"
                  />
                </TSelect>
              </section>
            </div>

            <div
              v-if="entryTabs.length > 0 && platformTagGroups.length > 0"
              class="dev-tag-group-panel dev-upload-grid dev-upload-grid--tag-groups"
            >
              <section
                v-for="group in platformTagGroups"
                :key="group.key"
                class="dev-tag-group-row"
              >
                <header class="dev-tag-group-row__head">
                  <section class="dev-tag-group-row__copy">
                    <h4 class="dev-tag-group-row__title">{{ group.group_name }}</h4>
                    <p class="dev-tag-group-row__path" :title="group.label">{{ group.label }}</p>
                  </section>
                  <span class="dev-tag-group-row__count"
                    >{{ (selectedTagIdsByGroup[group.group_id] ?? []).length }}/{{
                      group.items.length
                    }}</span
                  >
                </header>

                <div class="dev-tag-group-row__field">
                  <TSelect
                    v-model="selectedTagIdsByGroup[group.group_id]"
                    multiple
                    filterable
                    placeholder="选择一个或多个标签"
                  >
                    <TOption
                      v-for="item in group.items"
                      :key="item.id"
                      :label="item.name"
                      :value="item.id"
                    />
                  </TSelect>
                </div>
              </section>
            </div>

            <p v-else-if="entryTabs.length > 0" class="dev-empty-state">
              当前二级节点尚未配置完整标签组，请先在管理端补齐标签树。
            </p>
            <p v-else class="dev-empty-state">
              当前根节点尚未配置二级节点，请先在管理端补齐标签树。
            </p>
          </div>
        </section>

        <footer
          class="dev-upload-actions dev-upload-actions--split"
          :class="{ 'is-ready': canSubmit }"
        >
          <section class="dev-submit-summary">
            <span class="dev-submit-summary__status">{{
              canSubmit ? '准备就绪' : submitBlockReason
            }}</span>
            <span class="dev-submit-summary__meta">{{
              isApiKind ? '接口资源 · 原创' : `${currentEntryLabel} · ${selectedTagCount} 个标签`
            }}</span>
          </section>
          <div class="dev-upload-actions__buttons">
            <TButton
              variant="solid"
              tone="accent"
              :disabled="!canSubmit"
              :loading="submitting"
              @click="submitResource('private')"
              ><template #prefix
                ><TIcon><MagicStick /></TIcon
              ></template>
              创建私有项目
            </TButton>
            <TButton
              variant="solid"
              tone="success"
              :disabled="!canSubmit"
              :loading="submitting"
              @click="submitResource('public')"
              ><template #prefix
                ><TIcon><MagicStick /></TIcon
              ></template>
              发布公开项目
            </TButton>
          </div>
        </footer>
      </TCard>
    </div>

    <!-- 后端首次生成的回调密钥：明文只回这一次，弹窗最醒目地提示一次 -->
    <TDialog
      v-model:open="secretPlainDialogVisible"
      width="560px"
      class="dev-dialog"
      title="回调密钥已生成（只显示这一次）"
    >
      <p class="dev-secret-dialog__hint">
        这是平台为这个接口资源生成的回调密钥。<strong>关闭后平台不再显示明文</strong>，
        请立即复制并保存到你自有站点的服务端，用于校验回调签名。
      </p>
      <code class="dev-secret-dialog__value">{{ revealedSecretPlain }}</code>
      <template #footer>
        <TButton variant="outline" @click="copyRevealedSecret">复制密钥</TButton>
        <TButton variant="solid" tone="accent" @click="confirmSecretSaved">
          我已保存，前往资源列表
        </TButton>
      </template>
    </TDialog>
  </div>
</template>

<style scoped>
.dev-field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary, #64748b);
}

.dev-field-hint--error {
  color: var(--73-danger, #b42318);
}

/* R028 接口资源配置区：字段按内容宽排布，见 dev-resource.css 的 .dev-upload-grid--form */
.dev-api-notice {
  margin: 0 0 4px;
}

.dev-api-switch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.dev-api-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}

/* 一次性密钥与接入提示词两块面板：与上一块的间距同 .dev-upload-block 的 14px 行距合起来是 18px，
   与表单行距、提示条间距同一档（原来写 16px，合起来 30px，比其余间距都宽一截）。 */
.dev-api-secret {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 4px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--73-warning, #d97706);
  border-radius: 10px;
  background: #fff8ea;
}

.dev-api-secret__title {
  flex: 1 1 100%;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}

.dev-api-secret__value {
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 10px;
  border: 1px dashed #d97706;
  border-radius: 8px;
  background: #ffffff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  user-select: all;
}

.dev-api-sample {
  margin: 4px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--dev-line, #e2e8f0);
  border-radius: 10px;
  background: var(--dev-surface-strong, #f8fafc);
}

.dev-api-sample__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-api-sample__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink, #1f2937);
}

.dev-api-sample__code {
  margin: 12px 0 0;
  padding: 12px 14px;
  overflow-x: auto;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  /* 提示词的长行折行显示（复制出来的文本不受影响），不靠横向滚动把内容藏起来 */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dev-secret-dialog__hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #64748b);
}

.dev-secret-dialog__value {
  display: block;
  padding: 12px 14px;
  border: 1px dashed #d97706;
  border-radius: 8px;
  background: #fff8ea;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  user-select: all;
}
</style>
