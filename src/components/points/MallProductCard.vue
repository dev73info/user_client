<script setup lang="ts">
import { computed } from 'vue'
import { TButton } from 'ui_73info'

import type { PointsProduct } from '@/api/points'

const props = defineProps<{
  product: PointsProduct
  owned: boolean
  insufficientPoints: boolean
  busy: boolean
}>()
const emit = defineEmits<{ redeem: [] }>()

function kindLabel(kind: string) {
  if (kind === 'permission') return '权限'
  if (kind === 'badge') return '徽章'
  if (kind === 'consumable') return '消耗卡'
  return '商品'
}
function durationLabel(days: number) {
  return days == null || days < 0 ? '永久' : `${days} 天`
}
function actionLabel() {
  if (props.owned) return '已拥有'
  if (props.product.stock <= 0) return '已售罄'
  if (props.insufficientPoints) return '积分不足'
  return '立即兑换'
}

/** 权益 / 徽章走蓝色，消耗卡（道具卡）走琥珀色，与设计稿的两种 chip 对应。 */
const kindTone = computed(() => (props.product.kind === 'consumable' ? 'consumable' : 'perk'))

/** 商品图标是纯装饰的类别符号，按 kind 取一个几何字符，不额外引图标库。 */
const kindIcon = computed(() => {
  if (props.product.kind === 'badge') return '★'
  if (props.product.kind === 'consumable') return '▦'
  return '◐'
})
</script>

<template>
  <div class="mall-card">
    <div class="mall-card__body">
      <div class="mall-card__head">
        <span class="mall-card__kind" :class="'mall-card__kind--' + kindTone">
          {{ kindLabel(product.kind) }}
        </span>
        <span class="mall-card__cost">{{ product.points_cost }} <small>PTS</small></span>
      </div>
      <span class="mall-card__icon" :class="'mall-card__icon--' + kindTone" aria-hidden="true">
        {{ kindIcon }}
      </span>
      <h4>{{ product.name }}</h4>
      <p class="mall-card__duration">
        有效期：{{ durationLabel(product.duration_days) }} · 库存：{{ product.stock }}
      </p>
      <TButton
        variant="outline"
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
