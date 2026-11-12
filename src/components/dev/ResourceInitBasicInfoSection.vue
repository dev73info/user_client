<script setup lang="ts">
import { computed, ref } from 'vue'
import { TButton, TCheckbox, TForm, TFormItem, TInput, TOption, TSelect, TTooltip } from 'ui_73info'
import ResourceIconPicker from '@/components/ResourceIconPicker.vue'
import {
  RESOURCE_FEE_UNAVAILABLE_TEXT,
  resourceExpectedNetLabel,
  resourceFeeHintText,
} from '@/shared/requirementFee'
import type { ResourcePaidMode } from '@/shared/resourceCreation'

/**
 * 基础信息字段；资源类型由独立区块选择，这里只按类型展示适用字段。
 * 现金价输入框的底层元素通过 `cashPriceInput` 事件回传，供实时归一使用。
 */
const props = defineProps<{
  paidMode: ResourcePaidMode
  isApiKind: boolean
  effectiveOriginType: 'original' | 'repost'
  hasJoinedTeam: boolean
  hasTeams: boolean
  teamOptions: { value: string; label: string }[]
  /** 现金 / 积分价是否可改（两者互斥，填了一个就禁用另一个）。 */
  cashPriceDisabled: boolean
  pointsPriceDisabled: boolean
  /** 付费（现金或积分）或已勾版权声明时才露出「版权」。 */
  showCopyrightField: boolean
  promoShareError: string
  promoShareDisplay: string
  /** 比例是否为 0（关闭态用弱化样式）。 */
  promoShareOff: boolean
  /** 平台抽成比例（基点，10000 = 100%）；未取到时为 null。 */
  platformFeeBps: number | null
  /** 费率读取失败：显示「费率暂不可用」，不要静默消失。 */
  platformFeeError: boolean
  /** 结算账户已开通；未开通时只锁「售价（元）」，积分售价只依赖实名（路由已保证）。 */
  settlementReady: boolean
}>()

const emit = defineEmits<{
  /** 现金 / 积分价输入框的底层元素（实时归一前导 0 用）。 */
  cashPriceInput: [el: HTMLInputElement | null]
  pointsPriceInput: [el: HTMLInputElement | null]
  /** 售价被结算账户拦截时，点「去完善结算账户」。 */
  goSettlement: []
}>()

const coverUrl = defineModel<string>('coverUrl', { required: true })
const coverFile = defineModel<File | null>('coverFile', { required: true })
const title = defineModel<string>('title', { required: true })
const ownershipType = defineModel<'individual' | 'team'>('ownershipType', { required: true })
const teamId = defineModel<string>('teamId', { required: true })
const originType = defineModel<'original' | 'repost'>('originType', { required: true })
const copyrightDeclared = defineModel<boolean>('copyrightDeclared', { required: true })
const originAuthor = defineModel<string>('originAuthor', { required: true })
const originUrl = defineModel<string>('originUrl', { required: true })
const originOrg = defineModel<string>('originOrg', { required: true })
const originNote = defineModel<string>('originNote', { required: true })
const priceYuan = defineModel<string>('priceYuan', { required: true })
const pricePoints = defineModel<string>('pricePoints', { required: true })
const promoSharePercent = defineModel<number>('promoSharePercent', { required: true })

/** 现金 / 积分输入框实例：实时归一前导 0 时要拿到底层 input 来改写值并复位光标。 */
const cashPriceInputRef = ref<InstanceType<typeof TInput> | null>(null)
const pointsPriceInputRef = ref<InstanceType<typeof TInput> | null>(null)

function onCashPriceInput() {
  emit('cashPriceInput', cashPriceInputRef.value?.inputRef ?? null)
}

function onPointsPriceInput() {
  emit('pointsPriceInput', pointsPriceInputRef.value?.inputRef ?? null)
}

/** 预计到手：现金价按整数分算，积分价按积分算；没有定价时只给费率与「买家支付价不变」。 */
const expectedNetLabel = computed(() =>
  props.platformFeeBps == null
    ? ''
    : resourceExpectedNetLabel(priceYuan.value, pricePoints.value, props.platformFeeBps),
)

const feeHintText = computed(() => {
  if (props.platformFeeError) {
    return RESOURCE_FEE_UNAVAILABLE_TEXT
  }
  if (props.platformFeeBps == null) {
    return ''
  }
  return resourceFeeHintText(props.platformFeeBps, expectedNetLabel.value)
})
</script>

<template>
  <section class="dev-upload-block">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">基础信息</h3>
      </section>
    </header>

    <TForm label-position="top" class="dev-upload-form">
      <div class="dev-upload-grid dev-upload-grid--form">
        <TFormItem label="图标文件" class="dev-form-item--icon">
          <ResourceIconPicker v-model="coverUrl" v-model:file="coverFile" />
        </TFormItem>

        <!-- 资源标题是可伸缩档：占位文案「例如：Better Combat Reloaded」实测要 212.4px，
             比短档（150px）宽；行尾余下的空间就落在它身上，不再单独收窄。 -->
        <TFormItem label="资源标题" required class="dev-form-item--wide">
          <TInput
            show-count
            v-model="title"
            :maxlength="200"
            placeholder="例如：Better Combat Reloaded"
          />
        </TFormItem>

        <TFormItem label="归属" required class="dev-form-item--short">
          <TSelect v-model="ownershipType">
            <TOption label="个人项目" value="individual" />
            <TOption label="团队项目" value="team" :disabled="!hasJoinedTeam" />
          </TSelect>
        </TFormItem>

        <TFormItem
          v-show="ownershipType === 'team'"
          label="所属团队"
          required
          class="dev-form-item--mid"
        >
          <div class="dev-team-select-native">
            <TSelect
              v-model="teamId"
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
                  <p v-if="!hasTeams">您还没有加入任何团队</p>
                  <p v-else>未找到匹配的团队</p>
                </div>
              </template>
            </TSelect>
          </div>
        </TFormItem>

        <!-- 原创 / 转载是版权性质；付费资源与已设售价的接口显示版权声明。 -->
        <!-- 接口资源一律「原创」（见 effectiveOriginType），不给这个选择 -->
        <TFormItem v-if="!isApiKind" label="类型" class="dev-form-item--short">
          <TSelect v-model="originType" style="width: 100%">
            <TOption label="原创" value="original" />
            <TOption label="转载" value="repost" />
          </TSelect>
        </TFormItem>

        <TFormItem v-if="showCopyrightField" label="版权" class="dev-form-item--copyright">
          <TCheckbox v-model="copyrightDeclared">
            我确认拥有该资源版权，或已获得合法授权可售卖
          </TCheckbox>
        </TFormItem>

        <div v-if="isApiKind || paidMode === 'buyout'" class="dev-price-group">
          <TFormItem label="售价（元）" class="dev-form-item--price-cash">
            <TInput
              ref="cashPriceInputRef"
              v-model="priceYuan"
              :disabled="cashPriceDisabled || !settlementReady"
              placeholder="0 = 免费"
              inputmode="decimal"
              :title="isApiKind ? undefined : '与售价（积分）互斥'"
              @input="onCashPriceInput"
            />
            <p v-if="!settlementReady" class="dev-field-hint">
              完成结算账户后才能设置售价
              <TButton variant="text" tone="accent" size="sm" @click="emit('goSettlement')">
                去完善结算账户
              </TButton>
            </p>
            <p v-else-if="cashPriceDisabled" class="dev-field-hint">
              已填售价（积分），售价（元）已禁用。
            </p>
            <!-- 费用披露收成一个提示触发点：平台抽成与预计到手在悬浮/聚焦时展开；
                 费率读取失败时不藏起来，直接把错误文案显示在售价旁。 -->
            <TTooltip
              v-if="feeHintText && !platformFeeError"
              class="dev-platform-fee-hint"
              data-testid="resource-platform-fee-hint"
              tabindex="0"
              :content="feeHintText"
              placement="top"
              :max-width="360"
            >
              <span class="dev-platform-fee-hint__trigger">费率提示</span>
            </TTooltip>
            <p
              v-else-if="platformFeeError"
              class="dev-field-hint dev-field-hint--error"
              data-testid="resource-platform-fee-hint"
            >
              {{ feeHintText }}
            </p>
          </TFormItem>

          <TFormItem v-if="!isApiKind && paidMode === 'buyout'" label="售价（积分）">
            <TInput
              ref="pointsPriceInputRef"
              v-model="pricePoints"
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
              v-model.number="promoSharePercent"
              class="dev-promo-share__range"
              type="range"
              min="0"
              max="50"
              step="1"
              :title="promoShareDisplay"
              aria-label="推广分成（百分比，0 表示关闭）"
            />
            <span class="dev-promo-share__value" :class="{ 'is-off': promoShareOff }">{{
              promoShareDisplay
            }}</span>
          </div>
          <p v-if="promoShareError" class="dev-field-hint dev-field-hint--error">
            {{ promoShareError }}
          </p>
        </TFormItem>

        <template v-if="effectiveOriginType === 'repost'">
          <TFormItem label="原作者">
            <TInput v-model="originAuthor" :maxlength="80" placeholder="原始资源的作者" />
          </TFormItem>
          <TFormItem label="原始出处链接" required class="dev-form-item--wide">
            <TInput
              v-model="originUrl"
              :maxlength="500"
              placeholder="原始出处 URL，例如原贴/来源页"
            />
          </TFormItem>
          <TFormItem label="来源站点">
            <TInput
              v-model="originOrg"
              :maxlength="80"
              placeholder="例如：苦力怕论坛、CurseForge"
            />
          </TFormItem>
          <TFormItem label="转载说明 / 授权" class="dev-form-item--wide">
            <TInput
              v-model="originNote"
              :maxlength="500"
              placeholder="授权情况、转载说明等（可选）"
            />
          </TFormItem>
        </template>
      </div>
    </TForm>
  </section>
</template>
