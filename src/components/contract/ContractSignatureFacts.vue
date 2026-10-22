<script setup lang="ts">
/**
 * 签约方与合同正文（只读展示）。
 *
 * 已签署的合同正文以爱签那份为准，由「查看合同」入口跳过去；
 * 只有爱签取不到预览链接时（`showLocalDocument`）才回退展示本地正文。
 */
defineProps<{
  parties: Array<{ name: string; signedAt: string | null }>
  content: string
  hasCustomAttachment: boolean
  /** 是否铺本地正文：未签署，或爱签预览不可用。 */
  showLocalDocument: boolean
}>()

const PARTY_LABELS = ['甲方', '乙方', '丙方'] as const
</script>

<template>
  <div class="signature-facts">
    <section class="signature-parties">
      <h3>签约方</h3>
      <dl>
        <div v-for="(party, index) in parties" :key="PARTY_LABELS[index] ?? index">
          <dt>{{ PARTY_LABELS[index] ?? '签约方' }}</dt>
          <dd>
            {{ party.name
            }}<span>{{ party.signedAt ? `已签署 · ${party.signedAt}` : '未签署' }}</span>
          </dd>
        </div>
      </dl>
    </section>
    <details v-if="showLocalDocument" class="signature-document" open>
      <summary>{{ hasCustomAttachment ? '平台主合同正文（点击查看）' : '合同正文' }}</summary>
      <!-- R012：带自定义附件时正文区要讲清「平台正文才是唯一被签署的主文件」，附件只是条款补充。 -->
      <p v-if="hasCustomAttachment" class="document-source-note">
        本合同正文由平台按《需求开发合同》生成，仍是唯一被签署的主文件；
        自定义合同附件随本合同一并签署与归档，只是条款补充。
      </p>
      <div class="contract-content">{{ content }}</div>
    </details>
  </div>
</template>

<style scoped>
.signature-parties,
.signature-document {
  margin: 24px 0;
}

.signature-parties h3 {
  font-size: 15px;
  margin: 0 0 16px;
}

.signature-parties dl {
  margin: 0;
  display: grid;
  gap: 14px;
}

.signature-parties dl > div {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  font-size: 14px;
  gap: 12px;
}

.signature-parties dt {
  color: #667085;
}

.signature-parties dd {
  margin: 0;
  display: grid;
  gap: 4px;
}

.signature-parties dd span {
  color: #667085;
  font-size: 12px;
}

.signature-document summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  padding: 14px 0;
  border-top: 1px solid #e5e9ef;
}

/* R012：正文区上方的来源说明（平台正文才是主文件，附件只是条款补充）。 */
.document-source-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #eef6f6;
  color: #3f5b59;
  font-size: 12.5px;
  line-height: 1.7;
}

.contract-content {
  border: 1px solid #cfd8e3;
  border-radius: 8px;
  padding: 1.35rem 1.5rem;
  min-height: 200px;
  background: #ffffff;
  color: #1f2937;
  font-size: 0.94rem;
  line-height: 1.8;
  white-space: pre-wrap;
  margin-bottom: 1.5rem;
  max-height: 60vh;
  overflow-y: auto;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}

@media (max-width: 640px) {
  .contract-content {
    padding: 1rem;
  }
}
</style>
