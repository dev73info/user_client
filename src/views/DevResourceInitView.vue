<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createMcResource,
  getMcResource,
  updateMcResourceHomepage,
  updateResourceSpecialChannel,
  uploadMcResourceCover,
  type CreateMcResourceTagSelection,
  type McResourceKind,
  type McResourcePayload,
  type ResourceSpecialChannelPayload,
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


import { parsePointsPriceInput, parsePromoSharePercentInput, parseYuanPriceInput } from '@/shared/resourceSale'
import { API_BASE_URL } from '@/shared/api/url'
import {
  SPECIAL_CALLBACK_SIGNATURE_RULE,
  buildSpecialPurchaseCurl,
  findInvalidAllowedOrigin,
  isValidCallbackUrl,
  listSpecialChannelBlockers,
  parseAllowedOriginsInput,
} from '@/shared/resourceSpecial'

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
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

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
  /** R028 资源类别：normal = 大厅公开展示；special = 不公开展示，只能指定来源下单 */
  resourceKind: 'normal' as McResourceKind,
  /** R028 特殊资源渠道配置（选「特殊资源」后才展开） */
  specialCallbackUrl: '',
  specialCallbackSecret: '',
  /** 允许来源：多行文本，一行一个 */
  specialAllowedOrigins: '',
  specialRepeatPurchasable: false,
  specialAllowStrangers: true,
})

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
const hasCashPrice = computed(
  () => parsedPriceFen.value.ok && parsedPriceFen.value.fen > 0,
)
const hasPointsPrice = computed(
  () => parsedPricePoints.value.ok && parsedPricePoints.value.points > 0,
)
const cashPriceDisabled = computed(() => hasPointsPrice.value)
const pointsPriceDisabled = computed(() => hasCashPrice.value)
const showCopyrightField = computed(
  () => hasCashPrice.value || hasPointsPrice.value || form.copyrightDeclared,
)

function onCashPriceInput() {
  if (hasCashPrice.value) {
    form.pricePoints = '0'
  }
}

function onPointsPriceInput() {
  if (hasPointsPrice.value) {
    form.priceYuan = '0'
  }
}

/* ---------- R028 特殊资源：类别、渠道配置与一次性密钥 ---------- */

const isSpecialKind = computed(() => form.resourceKind === 'special')
const specialOrigins = computed(() => parseAllowedOriginsInput(form.specialAllowedOrigins))
const specialCallbackInvalid = computed(
  () => Boolean(form.specialCallbackUrl.trim()) && !isValidCallbackUrl(form.specialCallbackUrl),
)
const invalidSpecialOrigin = computed(() => findInvalidAllowedOrigin(specialOrigins.value))

/** 渠道配置还不完整时，页面要显式说明「暂不可被下单」（保存仍允许，草稿态）。 */
const specialChannelBlockers = computed(() =>
  listSpecialChannelBlockers({
    callback_url: form.specialCallbackUrl,
    allowed_origins: specialOrigins.value,
  }),
)

/**
 * 资源本身已落库、后续步骤（渠道配置 / 公开申请）没跑完时的重试锚点。
 * 有值时再点保存不会重复建资源，只补没成功的那一半。
 */
const createdResourceId = ref<number | null>(null)
/** 已保存的渠道配置：回显密钥掩码与更新时间。 */
const savedSpecialChannel = ref<ResourceSpecialChannelPayload | null>(null)
/** 后端首次生成的回调密钥明文：只回显一次，弹窗与页内各展示一份。 */
const revealedSecretPlain = ref('')
const secretPlainDialogVisible = ref(false)

const savedSecretMaskedLabel = computed(() => {
  if (revealedSecretPlain.value) {
    return '本次已生成'
  }
  const saved = savedSpecialChannel.value
  if (!saved?.callback_secret_set) {
    return '未生成'
  }
  return saved.callback_secret_masked || '已配置'
})

const specialSampleCurl = computed(() =>
  buildSpecialPurchaseCurl(createdResourceId.value, {
    apiBase: API_BASE_URL || (typeof window === 'undefined' ? '' : window.location.origin),
    origin: specialOrigins.value[0] ?? '',
  }),
)

/** 把服务端返回的渠道配置落到本地（掩码、明文一次性回显）。 */
function applySavedSpecialChannel(saved: ResourceSpecialChannelPayload) {
  savedSpecialChannel.value = saved
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

/** 复制接入示例（curl 片段）。 */
async function copySpecialSample() {
  try {
    await navigator.clipboard.writeText(specialSampleCurl.value)
    showToast('接入示例已复制', 'success')
  } catch {
    showToast('复制失败，请手动选中示例代码后再复制', 'warning')
  }
}

const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)

const currentRoot = computed<McTagCatalogRoot | null>(() =>
  rootTabs.value.find((r) => r.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)

const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])

const currentEntry = computed<McTagCatalogEntry | null>(() =>
  entryTabs.value.find((entry) => entry.key === currentEntryKey.value) ?? entryTabs.value[0] ?? null,
)
const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
const currentRootLabel = computed(() => currentRoot.value?.label || '根节点')
const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
const currentPlatformLabel = computed(() => currentPlatform.value || '当前分区')
const platformTagGroups = computed<McPublishTagGroup[]>(() => currentEntry.value?.publish_groups ?? [])
const selectedTagCount = computed(() => Object.values(selectedTagIdsByGroup).reduce((sum, ids) => sum + ids.length, 0))

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

  if (platformTagGroups.value.length === 0) {
    return '当前二级节点尚未配置完整标签组'
  }

  if (selectedTagCount.value === 0) {
    return '请至少选择一个标签'
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

watch(platformTagGroups, (groups) => {
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
    selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) => validTagIds.has(tagId))
  }

  for (const group of groups) {
    if (!selectedTagIdsByGroup[group.group_id]) {
      selectedTagIdsByGroup[group.group_id] = []
    }
  }
}, { immediate: true })

onMounted(async () => {
  auth.hydrate()
  if (auth.username) {
    form.author = auth.username
  }
  await loadTagTree()
  await loadMyTeams()

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

function openRoot(rootKey: string, firstEntryKey: string | null) {
  if (rootKey === currentRootKey.value) {
    return
  }

  currentRootKey.value = rootKey
  currentEntryKey.value = firstEntryKey ?? ''
}

function openEntry(entryKey: string) {
  if (entryKey === currentEntryKey.value) {
    return
  }

  currentEntryKey.value = entryKey
}

function buildTagSelections(): CreateMcResourceTagSelection[] {
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
  form.resourceKind = 'normal'
  form.specialCallbackUrl = ''
  form.specialCallbackSecret = ''
  form.specialAllowedOrigins = ''
  form.specialRepeatPurchasable = false
  form.specialAllowStrangers = true
  selectedIconFile.value = null
  createdResourceId.value = null
  savedSpecialChannel.value = null
  revealedSecretPlain.value = ''
  secretPlainDialogVisible.value = false

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    selectedTagIdsByGroup[Number(key)] = []
  }
}

/** R028：特殊资源配置的本地校验（保存是草稿过程，只挡明显填错的地址）。 */
function validateSpecialChannel(): boolean {
  if (!isSpecialKind.value) {
    return true
  }

  if (form.specialCallbackUrl.trim() && !isValidCallbackUrl(form.specialCallbackUrl)) {
    showToast(
      '回调地址须为 http(s) 开头的绝对地址，例如 https://shop.example.com/73info/callback',
      'warning',
    )
    return false
  }

  const invalid = findInvalidAllowedOrigin(specialOrigins.value)
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
    showToast('请先补全必填字段和标签选择', 'warning')
    return
  }

  if (form.originType === 'repost' && !form.originUrl.trim()) {
    showToast('转载资源必须填写原始出处链接', 'warning')
    return
  }

  if (!validateSpecialChannel()) {
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
        platform: currentPlatform.value,
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
        origin_type: form.originType,
        origin_author: form.originAuthor.trim() || null,
        origin_url: form.originUrl.trim() || null,
        origin_org: form.originOrg.trim() || null,
        origin_note: form.originNote.trim() || null,
        price_fen: priceParsed.fen,
        price_points: pointsParsed.points,
        copyright_declared: form.copyrightDeclared,
        resource_kind: form.resourceKind,
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
        showToast(error instanceof Error ? `资源已初始化，但图标上传失败：${error.message}` : '资源已初始化，但图标上传失败', 'warning')
      }
    }

    if (isSpecialKind.value) {
      try {
        const saved = await updateResourceSpecialChannel(auth.token, resource.id, {
          resource_kind: 'special',
          repeat_purchasable: form.specialRepeatPurchasable,
          callback_url: form.specialCallbackUrl.trim() || null,
          // 留空 = 不改；首次留空时后端自动生成，明文只在这次响应里回显
          callback_secret: form.specialCallbackSecret.trim() || null,
          allow_strangers: form.specialAllowStrangers,
          allowed_origins: specialOrigins.value,
        })
        applySavedSpecialChannel(saved)
      } catch (error) {
        // 资源已存、渠道没存：明确报错并留在表单上，重试只重发渠道配置
        const message = error instanceof Error ? error.message : '保存特殊资源渠道配置失败'
        showToast(
          `资源已保存（编号 #${resource.id}），但特殊资源渠道配置未保存成功：${message}。请修正后重试，重试只会重发渠道配置。`,
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
        origin_type: form.originType,
        origin_author: form.originAuthor.trim() || null,
        origin_url: form.originUrl.trim() || null,
        origin_org: form.originOrg.trim() || null,
        origin_note: form.originNote.trim() || null,
        price_fen: priceParsed.fen,
        price_points: pointsParsed.points,
        copyright_declared: form.copyrightDeclared,
        resource_kind: form.resourceKind,
        promo_share_bps: promoParsed.bps,
      })
    }

    showToast(mode === 'public'
      ? `公开申请已提交，项目编号 #${resource.id}`
      : `资源已初始化为私有项目，编号 #${resource.id}`, 'success')

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
            <div class="dev-upload-grid dev-upload-grid--three">
              <TFormItem label="资源标题" required>
                <TInput show-count v-model="form.title"  :maxlength="200"
                  placeholder="例如：Better Combat Reloaded" />
              </TFormItem>

              <TFormItem label="归属类型" required>
                <TSelect v-model="form.ownershipType">
                  <TOption label="个人项目" value="individual" />
                  <TOption
                    label="团队项目"
                    value="team"
                    :disabled="!hasJoinedTeam" />
                </TSelect>
              </TFormItem>

              <TFormItem v-show="form.ownershipType === 'team'" label="所属团队" required>
                <div class="dev-team-select-native">
                  <TSelect
                    v-model="form.teamId"
                    placeholder="请选择团队"
                    class="dev-team-select-native__control">
                    <TOption
                      v-for="team in teamOptions"
                      :key="team.value"
                      :label="team.label"
                      :value="team.value" />
                    <template #empty>
                      <div class="dev-team-select-empty">
                        <p v-if="myTeams.length === 0">您还没有加入任何团队</p>
                        <p v-else>未找到匹配的团队</p>
                      </div>
                    </template>
                  </TSelect>

                </div>
              </TFormItem>

              <TFormItem label="类型">
                <TSelect v-model="form.originType" style="width: 100%">
                  <TOption label="原创" value="original" />
                  <TOption label="转载" value="repost" />
                </TSelect>
              </TFormItem>

              <TFormItem label="资源类别" required>
                <TSelect v-model="form.resourceKind" style="width: 100%">
                  <TOption label="普通资源（大厅公开展示）" value="normal" />
                  <TOption label="特殊资源（不公开展示，指定来源下单）" value="special" />
                </TSelect>
              </TFormItem>

              <TFormItem label="现金售价（元）">
                <TInput
                  v-model="form.priceYuan"
                  :disabled="cashPriceDisabled"
                  placeholder="0 表示免费"
                  inputmode="decimal"
                  title="与积分售价互斥"
                  @input="onCashPriceInput"
                />
                <p v-if="cashPriceDisabled" class="dev-field-hint">已填积分售价，现金售价已禁用。</p>
              </TFormItem>

              <TFormItem label="积分售价">
                <TInput
                  v-model="form.pricePoints"
                  :disabled="pointsPriceDisabled"
                  placeholder="0 表示不走积分购"
                  inputmode="numeric"
                  title="与现金售价互斥"
                  @input="onPointsPriceInput"
                />
                <p v-if="pointsPriceDisabled" class="dev-field-hint">已填现金售价，积分售价已禁用。</p>
              </TFormItem>

              <!-- R029 推广分成比例：0～50（%），0 = 关闭；拖动条 + 百分比展示，随资源一次保存（promo_share_bps） -->
              <TFormItem label="推广分成比例">
                <div class="dev-promo-share">
                  <input
                    v-model.number="form.promoSharePercent"
                    class="dev-promo-share__range"
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    :title="promoShareDisplay"
                    aria-label="推广分成比例（百分比，0 表示关闭）"
                  />
                  <span
                    class="dev-promo-share__value"
                    :class="{ 'is-off': promoSharePercentValue <= 0 }"
                  >{{ promoShareDisplay }}</span>
                </div>
                <p v-if="promoShareError" class="dev-field-hint dev-field-hint--error">
                  {{ promoShareError }}
                </p>
              </TFormItem>

              <TFormItem v-if="showCopyrightField" label="版权声明">
                <TCheckbox v-model="form.copyrightDeclared">
                  我确认拥有该资源版权，或已获得合法授权可售卖
                </TCheckbox>
              </TFormItem>

              <template v-if="form.originType === 'repost'">
                <TFormItem label="原作者">
                  <TInput v-model="form.originAuthor"  :maxlength="80" placeholder="原始资源的作者" />
                </TFormItem>
                <TFormItem label="原始出处链接" required>
                  <TInput v-model="form.originUrl"  :maxlength="500" placeholder="原始出处 URL，例如原贴/来源页" />
                </TFormItem>
                <TFormItem label="来源站点">
                  <TInput v-model="form.originOrg"  :maxlength="80" placeholder="例如：苦力怕论坛、CurseForge" />
                </TFormItem>
                <TFormItem label="转载说明 / 授权">
                  <TInput v-model="form.originNote"  :maxlength="500" placeholder="授权情况、转载说明等（可选）" />
                </TFormItem>
              </template>

              <TFormItem label="图标文件">
                <ResourceIconPicker v-model="form.coverUrl" v-model:file="selectedIconFile" />
              </TFormItem>

            </div>
          </TForm>
        </section>

        <!-- R028 特殊资源：选「特殊资源」才展开。字段与后端契约一一对应（资源类别随资源一次保存，
             渠道配置在资源建好之后 PUT）。 -->
        <section v-if="isSpecialKind" class="dev-upload-block dev-upload-block--split">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">特殊资源接入配置</h3>
              <p class="dev-field-hint">
                特殊资源不进大厅、首页精选与公开搜索：只能由你自有站点的服务端，从下面登记的来源地址调开放接口下单，支付成功后平台回调你填的地址。
              </p>
            </section>
          </header>

          <TAlert
            v-if="specialChannelBlockers.length"
            tone="warning"
            variant="soft"
            class="dev-special-notice"
            title="配置还没配齐，暂不可被下单"
            :description="`${specialChannelBlockers.join('；')}。可以先存草稿，配齐后再保存一次。`"
          />

          <TForm label-position="top" class="dev-upload-form">
            <div class="dev-upload-grid dev-upload-grid--two">
              <TFormItem label="回调地址">
                <TInput
                  v-model="form.specialCallbackUrl"
                  :maxlength="500"
                  placeholder="https://shop.example.com/73info/callback"
                />
                <p
                  class="dev-field-hint"
                  :class="{ 'dev-field-hint--error': specialCallbackInvalid }"
                >
                  支付成功后平台 POST 这个地址（带 HMAC-SHA256 签名）。本地开发可填
                  http://127.0.0.1:端口/…；留空时暂不可被下单。
                </p>
              </TFormItem>

              <TFormItem label="回调密钥">
                <TInput
                  v-model="form.specialCallbackSecret"
                  type="password"
                  :maxlength="128"
                  autocomplete="new-password"
                  placeholder="留空 = 不改"
                />
                <p class="dev-field-hint">
                  留空 = 不改。首次留空保存时平台自动生成一枚密钥，明文只回显一次；当前：{{
                    savedSecretMaskedLabel
                  }}。
                </p>
              </TFormItem>

              <TFormItem label="允许的来源地址" class="dev-special-span">
                <TInput
                  v-model="form.specialAllowedOrigins"
                  type="textarea"
                  :rows="5"
                  :maxlength="2000"
                  placeholder="https://shop.example.com&#10;*.example.com&#10;203.0.113.9"
                />
                <p
                  class="dev-field-hint"
                  :class="{ 'dev-field-hint--error': Boolean(invalidSpecialOrigin) }"
                >
                  一行一个，支持完整源（可带端口）、通配域名（*.example.com）与纯 IP（v4 / v6）。
                  只有命中列表的来源能下单；留空时谁都不能下单。
                  <template v-if="invalidSpecialOrigin">当前不合法：{{ invalidSpecialOrigin }}</template>
                </p>
              </TFormItem>

              <div class="dev-special-switch-row dev-special-span">
                <label class="dev-special-switch">
                  <TSwitch v-model="form.specialRepeatPurchasable" aria-label="允许重复购买" />
                  <span>允许重复购买</span>
                </label>
                <p class="dev-field-hint">
                  关闭时，同一买家引用（buyer_ref）第二次下单会被拒。
                </p>
              </div>

              <div class="dev-special-switch-row dev-special-span">
                <label class="dev-special-switch">
                  <TSwitch v-model="form.specialAllowStrangers" aria-label="允许陌生用户购买" />
                  <span>允许陌生用户购买</span>
                </label>
                <p class="dev-field-hint">
                  仅记录并随下单透传给你的站点，<strong>平台不做判定</strong>——买家是不是陌生用户，由你自己的站点在下单前判断。
                </p>
              </div>

              <TFormItem label="是否公开展示" class="dev-special-span">
                <TTag variant="soft" tone="neutral">不在大厅展示</TTag>
                <p class="dev-field-hint">
                  特殊资源固定不公开展示（大厅、首页精选、搜索与公开详情地址都不露出），平台不给开关。
                </p>
              </TFormItem>
            </div>
          </TForm>

          <div v-if="revealedSecretPlain" class="dev-special-secret">
            <p class="dev-special-secret__title">回调密钥（只显示这一次，请立即复制保存）</p>
            <code class="dev-special-secret__value">{{ revealedSecretPlain }}</code>
            <TButton variant="outline" @click="copyRevealedSecret">复制密钥</TButton>
          </div>

          <div class="dev-special-sample">
            <div class="dev-special-sample__head">
              <h4 class="dev-special-sample__title">接入示例（在你自有站点的服务端调用）</h4>
              <TButton variant="outline" @click="copySpecialSample">复制示例</TButton>
            </div>
            <pre class="dev-special-sample__code">{{ specialSampleCurl }}</pre>
            <ul class="dev-special-sample__notes">
              <li>
                接口密钥走 <code>X-Api-Key</code> 头（形如 <code>sk-73info-…</code>），在平台生成；
                本轮平台侧还没有密钥管理页面，需要时由平台方提供。
              </li>
              <li>
                回调验签：用你填的回调密钥，按
                <code>{{ SPECIAL_CALLBACK_SIGNATURE_RULE }}</code>
                自算签名，与请求头 <code>X-73Info-Signature</code> 比对（时间戳在
                <code>X-73Info-Timestamp</code>）。
              </li>
              <li>
                返回里的 <code>pay_url</code> 交给买家付款；买家付完，平台回调上面填的地址。
              </li>
            </ul>
          </div>
        </section>

        <section class="dev-upload-block dev-upload-block--split">
          <header class="dev-card-head">
            <section class="dev-card-head__title-block">
              <h3 class="dev-section-title">标签归类</h3>
            </section>
          </header>

          <div class="dev-catalog-section">
            <section class="dev-root-switch dev-root-switch--catalog" aria-label="根节点选择">
              <div class="dev-root-switch__head">
                <span class="dev-root-switch__label">根节点</span>
                <span class="dev-root-switch__meta">当前：{{ currentRootLabel }}</span>
              </div>
              <div class="dev-root-switch__chips">
                <button v-for="root in rootTabs" :key="root.key" class="dev-catalog-chip"
                  :class="{ active: root.key === currentRootKey }" type="button"
                  @click="openRoot(root.key, root.first_entry_key)">
                  {{ root.label }}
                </button>
              </div>
            </section>

            <section v-if="entryTabs.length > 0" class="dev-catalog-nav" aria-label="资源目录导航">
              <div class="dev-catalog-nav__row">
                <div class="dev-catalog-nav__head">
                  <span class="dev-catalog-nav__label">二级节点</span>
                  <span class="dev-catalog-nav__meta">当前：{{ currentEntryLabel }}</span>
                </div>
                <div class="dev-catalog-nav__chips dev-catalog-nav__chips--scroll">
                  <button v-for="entry in entryTabs" :key="entry.key" class="dev-catalog-chip dev-catalog-chip--secondary"
                    :class="{ active: entry.key === currentEntryKey }" type="button" @click="openEntry(entry.key)">
                    {{ entry.group_name }}
                  </button>
                </div>
              </div>
            </section>

            <div v-if="entryTabs.length > 0 && platformTagGroups.length > 0"
              class="dev-tag-group-panel dev-upload-grid dev-upload-grid--tag-groups">
              <section v-for="group in platformTagGroups" :key="group.key" class="dev-tag-group-row">
                <header class="dev-tag-group-row__head">
                  <section class="dev-tag-group-row__copy">
                    <h4 class="dev-tag-group-row__title">{{ group.group_name }}</h4>
                    <p class="dev-tag-group-row__path" :title="group.label">{{ group.label }}</p>
                  </section>
                  <span class="dev-tag-group-row__count">{{ (selectedTagIdsByGroup[group.group_id] ??
                    []).length }}/{{ group.items.length }}</span>
                </header>

                <div class="dev-tag-group-row__field">
                  <TSelect
                    v-model="selectedTagIdsByGroup[group.group_id]"
                    multiple
                    filterable
                    placeholder="选择一个或多个标签"
                  >
                    <TOption v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
                  </TSelect>
                </div>
              </section>
            </div>

            <p v-else-if="entryTabs.length > 0" class="dev-empty-state">当前二级节点尚未配置完整标签组，请先在管理端补齐标签树。</p>
            <p v-else class="dev-empty-state">当前根节点尚未配置二级节点，请先在管理端补齐标签树。</p>
          </div>
        </section>

        <footer class="dev-upload-actions dev-upload-actions--split" :class="{ 'is-ready': canSubmit }">
          <section class="dev-submit-summary">
            <span class="dev-submit-summary__status">{{ canSubmit ? '准备就绪' : submitBlockReason }}</span>
            <span class="dev-submit-summary__meta">{{ currentEntryLabel }} · {{ selectedTagCount }}
              个标签</span>
          </section>
          <div class="dev-upload-actions__buttons">
            <TButton variant="solid" tone="accent" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('private')"><template #prefix><TIcon><MagicStick /></TIcon></template>
              创建私有项目
            </TButton>
            <TButton variant="solid" tone="success" :disabled="!canSubmit" :loading="submitting"
              @click="submitResource('public')"><template #prefix><TIcon><MagicStick /></TIcon></template>
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
        这是平台为这个特殊资源生成的回调密钥。<strong>关闭后平台不再显示明文</strong>，
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

/* R028 特殊资源配置区：两列字段，整行项跨两列 */
.dev-special-notice {
  margin: 0 0 4px;
}

.dev-special-span,
.dev-special-switch-row {
  grid-column: 1 / -1;
}

.dev-special-switch-row {
  display: grid;
  gap: 2px;
}

.dev-special-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}

.dev-special-secret {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 16px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--73-warning, #d97706);
  border-radius: 10px;
  background: #fff8ea;
}

.dev-special-secret__title {
  flex: 1 1 100%;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}

.dev-special-secret__value {
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

.dev-special-sample {
  margin: 16px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--dev-line, #e2e8f0);
  border-radius: 10px;
  background: var(--dev-surface-strong, #f8fafc);
}

.dev-special-sample__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-special-sample__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink, #1f2937);
}

.dev-special-sample__code {
  margin: 12px 0 0;
  padding: 12px 14px;
  overflow-x: auto;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
}

.dev-special-sample__notes {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary, #64748b);
}

.dev-special-sample__notes code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #334155;
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

/* 窄屏下配置区收成一列，与基础信息区的手机口径一致 */
@media (max-width: 720px) {
  .dev-upload-grid--two {
    grid-template-columns: 1fr;
  }
}
</style>
