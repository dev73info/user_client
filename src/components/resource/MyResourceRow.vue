<script setup lang="ts">
/**
 * 需求方「我的资源」的一行（`li.wb-item.wb-item--clickable`）。
 *
 * 只负责展示与派发：整行进编辑主页，行内动作 emit 给视图的
 * `useDevResourceRowActions` 分发。可见性文案、锁定判定、动作可用性与价格计算
 * 全部来自 shared 纯函数，本组件不复制业务判定，也不发请求。
 */
import { computed } from 'vue'

import { ArrowDown, TButton, TDropdown, TDropdownItem, TDropdownMenu, TIcon } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { McResourcePayload } from '@/api/mcResources'
import BetaTag from '@/components/BetaTag.vue'
import {
  canRequestResourceReview,
  canSetResourcePrivate,
  formatDevResourceNetLabel,
  formatDevResourcePrice,
  formatExposureStatus,
  hasDevResourcePrice,
} from '@/shared/devResourceList'
import { isApiResourceKind, isResourceRowActionAvailable } from '@/shared/resourceApi'
import {
  isResourceArchiveLocked,
  isResourceSaleLockedByRequirement,
  resourceCoverUrl,
  resourcePlatformLabel,
  resourceTagColumnLabel,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
} from '@/shared/resourcePresentation'

const props = defineProps<{
  resource: McResourcePayload
  versionPrices: Record<number, number>
  platformFeeBps: number | null
  platformFeeError: boolean
  /** 申请公开进行中的资源 id（由 useDevResourceRowActions 提供） */
  requestingReviewId: number | null
  /** 设为私有进行中的资源 id（同上） */
  settingPrivateId: number | null
}>()

const emit = defineEmits<{
  /** 整行 / 「编辑主页」→ 视图的 openEditHomepagePage */
  edit: [resource: McResourcePayload]
  /** 「更多」菜单 → 视图的 handleResourceCommand（与 DevResourceTable 同一 payload 形状） */
  command: [{ action: string; resource: McResourcePayload }]
}>()

const locked = computed(() => isResourceArchiveLocked(props.resource))
const apiResource = computed(() => isApiResourceKind(props.resource.resource_kind))
const priced = computed(() => hasDevResourcePrice(props.resource, props.versionPrices))
const coverUrl = computed(() => resourceCoverUrl(props.resource, apiUrl))
const priceLabel = computed(() => formatDevResourcePrice(props.resource, props.versionPrices))
const canPublishVersion = computed(() =>
  isResourceRowActionAvailable('publish', props.resource.resource_kind),
)
const canManageVersions = computed(() =>
  isResourceRowActionAvailable('versions', props.resource.resource_kind),
)
const requestReviewDisabled = computed(
  () =>
    isResourceSaleLockedByRequirement(props.resource) ||
    locked.value ||
    props.requestingReviewId === props.resource.id,
)
const setPrivateDisabled = computed(
  () => locked.value || props.settingPrivateId === props.resource.id,
)

/** 可见性徽标：tone → wb-badge 修饰类，info 用默认灰底（与表格的状态列同口径）。 */
const visibilityBadgeClass = computed(() => {
  const tone = resourceVisibilityTagType(props.resource.visibility)
  return tone === 'info' ? 'wb-badge' : `wb-badge wb-badge--${tone}`
})

/** 「预计到手」：无价不渲染；费率读取失败时明写不可用（沿用 DevResourceTable 的文案）。 */
const netText = computed(() => {
  if (!priced.value) {
    return ''
  }
  if (props.platformFeeBps == null && props.platformFeeError) {
    return '费率暂不可用'
  }
  return formatDevResourceNetLabel(props.resource, props.versionPrices, props.platformFeeBps) || '—'
})

const exposureText = computed(() => formatExposureStatus(props.resource))

function runCommand(payload: unknown) {
  emit('command', payload as { action: string; resource: McResourcePayload })
}
</script>

<template>
  <li
    class="wb-item wb-item--clickable my-resource-row"
    :aria-label="`打开「${resource.title}」的编辑主页`"
    tabindex="0"
    @click="emit('edit', resource)"
    @keydown.enter.prevent="emit('edit', resource)"
    @keydown.space.prevent="emit('edit', resource)"
  >
    <div class="wb-item__main">
      <div class="wb-item__title-row">
        <img v-if="resource.cover_url" :src="coverUrl" alt="" class="my-resource-row__cover" />
        <span class="wb-item__title">{{ resource.title }}</span>
        <span :class="visibilityBadgeClass">{{
          resourceVisibilityLabel(resource.visibility)
        }}</span>
        <span v-if="locked" class="wb-badge wb-badge--warning">已锁定</span>
        <BetaTag v-if="apiResource" data-testid="resource-api-tag" />
      </div>
      <span class="wb-item__meta">
        {{ resourcePlatformLabel(resource.platform) }} · {{ resourceTagColumnLabel(resource) }} ·
        {{ resource.author }}
      </span>
      <span class="wb-item__meta my-resource-row__created">
        创建于 {{ resource.created_at }}<template v-if="exposureText"> · {{ exposureText }}</template>
      </span>
    </div>

    <!-- 行内控件各自拦住点击 / 回车，别再冒泡到整行的「进编辑主页」；
         注意「更多」按钮自身不能再挂 @click.stop：TDropdown 的触发监听挂在外层，
         在按钮处截断冒泡等于菜单永远打不开（同 RequirementRow）。 -->
    <div class="wb-item__side" @click.stop @keydown.stop>
      <span class="my-resource-row__price">
        <span class="my-resource-row__price-value">{{ priceLabel }}</span>
        <BetaTag v-if="priced && !apiResource" />
        <span v-if="priced" class="my-resource-row__net">预计到手 {{ netText }}</span>
      </span>
      <TButton variant="outline" @click.stop="emit('edit', resource)">编辑主页</TButton>
      <TDropdown trigger="click" @command="runCommand">
        <TButton variant="outline" tone="accent">
          <span>更多</span>
          <TIcon><ArrowDown /></TIcon>
        </TButton>
        <template #dropdown>
          <TDropdownMenu>
            <TDropdownItem
              v-if="canPublishVersion"
              :disabled="locked"
              :command="{ action: 'publish', resource }"
            >
              发布版本
            </TDropdownItem>
            <TDropdownItem
              v-if="canRequestResourceReview(resource)"
              :disabled="requestReviewDisabled"
              :command="{ action: 'request-review', resource }"
            >
              {{
                requestingReviewId === resource.id
                  ? '提交中...'
                  : resource.visibility === 'rejected'
                    ? '重新申请公开'
                    : '申请公开'
              }}
            </TDropdownItem>
            <TDropdownItem
              v-if="canSetResourcePrivate(resource)"
              :disabled="setPrivateDisabled"
              :command="{ action: 'set-private', resource }"
            >
              {{ settingPrivateId === resource.id ? '设置中...' : '设为私有' }}
            </TDropdownItem>
            <TDropdownItem v-if="canManageVersions" :command="{ action: 'versions', resource }">
              版本管理
            </TDropdownItem>
          </TDropdownMenu>
        </template>
      </TDropdown>
    </div>
  </li>
</template>

<style scoped>
.my-resource-row__cover {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}

.my-resource-row__created {
  font-size: 12px;
  color: var(--73-ink-placeholder);
}

/* 价格从正文里拿出来独立成列：金额一档、预计到手与 BETA 一行小字，正文只留标题与出处 */
.my-resource-row__price {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.my-resource-row__price-value {
  color: var(--73-ink);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.my-resource-row__net {
  color: var(--73-ink-placeholder);
  font-size: 12px;
  white-space: nowrap;
}
</style>
