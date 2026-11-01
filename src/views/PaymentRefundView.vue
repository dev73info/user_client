<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { fetchAgreementContent, type UserServiceAgreement } from '@/api/auth'
import {
  formatLegalDate,
  legalDocumentToBlocks,
  parseLegalText,
} from '@/components/legal/legalText'
import { paymentRefundDocument } from '@/shared/legalContent'

const router = useRouter()

/**
 * 正文来源：后端 `contract_template`（`name = payment_refund_notice`）优先；
 * 接口不可用时回落到 `shared/legalContent.json` 的构建期快照。
 */
const agreement = ref<UserServiceAgreement | null>(null)

const blocks = computed(() =>
  agreement.value
    ? parseLegalText(agreement.value.content)
    : legalDocumentToBlocks(paymentRefundDocument),
)
const title = computed(() => agreement.value?.title || paymentRefundDocument.heading)
/** 快照自带生效日期区块；后端正文没有，页头单独展示模板的公示时间。 */
const hasEffectiveBlock = computed(
  () =>
    !agreement.value && paymentRefundDocument.blocks.some((block) => block.type === 'effective'),
)

onMounted(async () => {
  try {
    agreement.value = await fetchAgreementContent('payment_refund_notice')
  } catch {
    // 接口不可用：保持快照兜底。
  }
})

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }

  router.push('/')
}
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ title }}</h2>
        </div>
        <button class="top-back" type="button" @click="goBack">返回</button>
      </header>

      <article class="content-block">
        <p v-if="agreement?.effective_at">
          <strong>生效日期：</strong>{{ formatLegalDate(agreement.effective_at) }}
        </p>
        <!-- 快照的生效日期由正文区块渲染；后端正文没有该区块时页头单独一行 -->
        <p v-else-if="!hasEffectiveBlock" class="legal-loading">生效日期以说明正文为准。</p>

        <template v-for="(block, index) in blocks" :key="index">
          <h3 v-if="block.type === 'heading'" :id="block.id">{{ block.text }}</h3>
          <ul v-else-if="block.type === 'list'">
            <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
          </ul>
          <p v-else>{{ block.text }}</p>
        </template>
      </article>
    </section>
  </main>
</template>
