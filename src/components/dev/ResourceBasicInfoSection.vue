<script setup lang="ts">
import { TCheckbox, TForm, TFormItem, TInput, TOption, TSelect } from 'ui_73info'
import ResourceIconPicker from '@/components/ResourceIconPicker.vue'
import ResourcePricingFields from '@/components/dev/ResourcePricingFields.vue'
import ResourceRepostFields from '@/components/dev/ResourceRepostFields.vue'

/**
 * 「基础信息」整块：图标、标题、归属、类型、价格、简介、版权声明、所属团队、转载信息。
 *
 * 栅格是 12 列分区（侧栏预览时主栏约 500px，一行塞 4 个会截断）：
 *   1) 图标 | 标题
 *   2) 归属 | 类型 | 售价
 *   3) 简介通栏
 * 列宽全由 `.dev-basic-info-grid__*` 决定，组件只管顺序——插槽顺序就是视觉顺序。
 *
 * 接口资源不渲染「类型」「积分售价」：它一律按原创（见 effectiveOriginType），
 * 也没有积分购入口。
 */
defineProps<{
  isApiKind: boolean
  effectiveOriginType: 'original' | 'repost'
  hasJoinedTeam: boolean
  hasTeams: boolean
  teamOptions: { value: string; label: string }[]
  /** 如图标预览与封面文件的变化，由父级记着（清空封面要同时清 cover_url）。 */
  coverPreview: string
  /** 现金 / 积分价是否可改（绑定定制交付、卖过现金价等约束在父级）。 */
  cashPriceDisabled: boolean
  pointsPriceDisabled: boolean
  pointsLockedBySavedCash: boolean
  boundToRequirement: boolean
  promoShareError: string
  promoShareDisplay: string
  promoShareOff: boolean
  /** 付费（现金或积分）或已勾版权声明时才露出「版权声明」。 */
  isPaidPricing: boolean
}>()

const emit = defineEmits<{
  'update:coverPreview': [value: string]
  /** 简介被手改：自动生成的那句不再跟着归类变。 */
  descriptionInput: []
  /** 现金价输入框的底层元素（实时归一前导 0 用）。 */
  cashPriceInput: [el: HTMLInputElement | null]
  pointsPriceInput: []
}>()

const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
const ownershipType = defineModel<'individual' | 'team'>('ownershipType', { required: true })
const teamId = defineModel<string>('teamId', { required: true })
const originType = defineModel<'original' | 'repost'>('originType', { required: true })
const copyrightDeclared = defineModel<boolean>('copyrightDeclared', { required: true })
const coverFile = defineModel<File | null>('coverFile', { required: true })
const originAuthor = defineModel<string>('originAuthor', { required: true })
const originUrl = defineModel<string>('originUrl', { required: true })
const originOrg = defineModel<string>('originOrg', { required: true })
const originNote = defineModel<string>('originNote', { required: true })
const priceYuan = defineModel<string>('priceYuan', { required: true })
const pricePoints = defineModel<string>('pricePoints', { required: true })
const promoSharePercent = defineModel<number>('promoSharePercent', { required: true })
</script>

<template>
  <section class="dev-upload-block">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">基础信息</h3>
      </section>
    </header>

    <TForm label-position="top" class="dev-upload-form">
      <div class="dev-basic-info-grid">
        <TFormItem label="图标文件" class="dev-basic-info-grid__icon">
          <ResourceIconPicker
            :model-value="coverPreview"
            @update:model-value="emit('update:coverPreview', $event)"
            v-model:file="coverFile"
          />
        </TFormItem>

        <TFormItem label="资源标题" required class="dev-basic-info-grid__title">
          <TInput show-count v-model="title" :maxlength="120" placeholder="输入资源标题" />
        </TFormItem>

        <TFormItem label="归属类型" required class="dev-basic-info-grid__ownership">
          <TSelect v-model="ownershipType">
            <TOption label="个人项目" value="individual" />
            <TOption label="团队项目" value="team" :disabled="!hasJoinedTeam" />
          </TSelect>
        </TFormItem>

        <!-- 接口资源一律「原创」（见 effectiveOriginType），不给这个选择 -->
        <TFormItem v-if="!isApiKind" label="类型" class="dev-basic-info-grid__origin">
          <TSelect v-model="originType">
            <TOption label="原创" value="original" />
            <TOption label="转载" value="repost" />
          </TSelect>
        </TFormItem>

        <ResourcePricingFields
          v-model:price-yuan="priceYuan"
          v-model:price-points="pricePoints"
          v-model:promo-share-percent="promoSharePercent"
          :is-api-kind="isApiKind"
          :cash-price-disabled="cashPriceDisabled"
          :points-price-disabled="pointsPriceDisabled"
          :points-locked-by-saved-cash="pointsLockedBySavedCash"
          :bound-to-requirement="boundToRequirement"
          :promo-share-error="promoShareError"
          :promo-share-display="promoShareDisplay"
          :promo-share-off="promoShareOff"
          @cash-price-input="emit('cashPriceInput', $event)"
          @points-price-input="emit('pointsPriceInput')"
        />

        <TFormItem label="资源简介" required class="dev-basic-info-grid__desc">
          <TInput
            show-count
            v-model="description"
            type="textarea"
            :rows="5"
            :maxlength="500"
            placeholder="用一段简洁说明告诉用户这是什么资源、适合谁、解决什么问题"
            @input="emit('descriptionInput')"
          />
        </TFormItem>

        <TFormItem
          v-if="isPaidPricing || copyrightDeclared"
          label="版权声明"
          class="dev-basic-info-grid__copyright"
        >
          <TCheckbox v-model="copyrightDeclared">
            我确认拥有该资源版权，或已获得合法授权可售卖
          </TCheckbox>
        </TFormItem>

        <TFormItem
          v-show="ownershipType === 'team'"
          label="所属团队"
          required
          class="dev-basic-info-grid__span"
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

        <ResourceRepostFields
          v-if="effectiveOriginType === 'repost'"
          v-model:origin-author="originAuthor"
          v-model:origin-url="originUrl"
          v-model:origin-org="originOrg"
          v-model:origin-note="originNote"
        />
      </div>
    </TForm>
  </section>
</template>
