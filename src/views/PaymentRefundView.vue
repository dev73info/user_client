<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchAgreementContent, type AgreementContent } from '@/api/auth'
import { paymentRefundDocument } from '@/shared/legalContent'
import { legalDocumentToBlocks, parseLegalText } from '@/components/legal/legalText'

const router = useRouter()

/**
 * 正文来源：后端 `contract_template` 的 `payment_refund_notice` 行是**唯一事实源**
 * （R043 任务-02 入库、任务-03 切读）。接口不可用时才回落到前端 JSON 兜底快照。
 */
const agreement = ref<AgreementContent | null>(null)
const loading = ref(true)

const blocks = computed(() =>
  agreement.value
    ? parseLegalText(agreement.value.content)
    : legalDocumentToBlocks(paymentRefundDocument),
)
const title = computed(() => agreement.value?.title || paymentRefundDocument.heading)
const version = computed(() => agreement.value?.version || '')
const effectiveAt = computed(() => agreement.value?.effective_at || '')

async function loadAgreement() {
  loading.value = true
  try {
    agreement.value = await fetchAgreementContent('payment_refund_notice')
  } catch {
    agreement.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadAgreement)

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
        <p v-if="version"><strong>版本号：</strong>{{ version }}</p>
        <p v-if="effectiveAt"><strong>生效日期：</strong>{{ effectiveAt }}</p>
        <p v-if="loading" class="legal-loading">说明内容加载中…</p>

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
