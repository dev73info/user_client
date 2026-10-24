<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { paymentRefundDocument } from '@/shared/legalContent'
import { legalDocumentToBlocks } from '@/components/legal/legalText'

const router = useRouter()

/**
 * 正文来源：`shared/legalContent.json` 的 `paymentRefund` 段（与静态快照脚本读同一份）。
 *
 * 早先去调 `/api/auth/agreement-content?code=payment_refund_notice`，但**后端 2.0 没有这个端点**
 * （契约里只有 `/api/auth/user-service-agreement`），必然 404 再被 catch 吞掉。现在直接渲染内置正文。
 */
const blocks = computed(() => legalDocumentToBlocks(paymentRefundDocument))
const title = paymentRefundDocument.heading
/** 生效日期写在正文区块里（`{ type: 'effective' }`），页头不再单独占一行。 */
const hasEffectiveBlock = paymentRefundDocument.blocks.some((block) => block.type === 'effective')

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
        <!-- 生效日期由正文第一块（`type: 'effective'`）渲染，页头不重复 -->
        <p v-if="!hasEffectiveBlock" class="legal-loading">生效日期以说明正文为准。</p>

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
