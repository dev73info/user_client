<script setup lang="ts">
import { useRouter } from 'vue-router'
import { paymentRefundDocument } from '@/shared/legalContent'

const router = useRouter()
const refundDoc = paymentRefundDocument

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
                    <h2>{{ refundDoc.heading }}</h2>
                </div>
                <button class="top-back" type="button" @click="goBack">返回</button>
            </header>

            <article class="content-block">
                <!-- 正文出自 src/shared/legalContent.json：SPA 与构建期静态快照共用同一份文案 -->
                <template v-for="(block, index) in refundDoc.blocks" :key="index">
                    <h3 v-if="block.type === 'heading'">{{ block.text }}</h3>
                    <p v-else-if="block.type === 'effective'">
                        <strong>{{ block.label }}：</strong>{{ block.text }}
                    </p>
                    <ul v-else-if="block.type === 'list'">
                        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
                    </ul>
                    <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
                    <p v-else-if="block.type === 'paragraph-link'">
                        {{ block.before
                        }}<RouterLink :to="block.to">{{ block.linkText }}</RouterLink>{{ block.after }}
                    </p>
                </template>
            </article>
        </section>
    </main>
</template>
