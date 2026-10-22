<script setup lang="ts">
import { TButton } from 'ui_73info'

import type { PointsProduct } from '@/api/points'

const props = defineProps<{
  product: PointsProduct
  /** 已永久拥有该权益：按钮置灰并显示「已拥有」。 */
  owned: boolean
  /** 当前积分不足：按钮置灰并显示「积分不足」。 */
  insufficientPoints: boolean
  /** 正在兑换这一件：按钮转圈。 */
  busy: boolean
}>()

const emit = defineEmits<{
  redeem: []
}>()

function kindLabel(kind: string) {
  if (kind === 'permission') return '权限'
  if (kind === 'badge') return '徽章'
  if (kind === 'consumable') return '消耗卡'
  return '商品'
}
function durationLabel(days: number) {
  return days == null || days < 0 ? '永久' : `${days} 天`
}
function consumableHint(product: PointsProduct) {
  if (product.kind !== 'consumable') return ''
  if (product.perk_code === 'resource_featured_card') return '资源精选卡 · 使用后进入首页精选'
  if (product.perk_code === 'resource_pin_card') return '资源置顶卡 · 提升曝光，无精选角标'
  return '兑换后放入背包，请到我的资源使用'
}
function actionLabel() {
  if (props.owned) return '已拥有'
  if (props.product.stock <= 0) return '已售罄'
  if (props.insufficientPoints) return '积分不足'
  return '立即兑换'
}
</script>

<template>
  <div class="mall-card">
    <div class="mall-card__body">
      <div class="mall-card__head">
        <span class="mall-card__kind">{{ kindLabel(product.kind) }}</span>
        <span class="mall-card__cost">{{ product.points_cost }} 积分</span>
      </div>
      <h4>{{ product.name }}</h4>
      <p class="mall-card__duration">
        有效期：{{ durationLabel(product.duration_days) }} · 库存：{{ product.stock }}
      </p>
      <p v-if="consumableHint(product)" class="mall-card__hint">{{ consumableHint(product) }}</p>
      <TButton
        variant="solid"
        tone="accent"
        :disabled="owned || insufficientPoints || product.stock <= 0"
        :loading="busy"
        style="width: 100%"
        @click="emit('redeem')"
      >
        {{ actionLabel() }}
      </TButton>
    </div>
  </div>
</template>

<style scoped src="./mall-product-card.css"></style>
<style scoped src="./mall-shared.css"></style>
