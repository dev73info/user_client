<script setup lang="ts">
/**
 * 重要条款提示（R043 任务-03）。
 *
 * 为什么要有这个组件：《民法典》第 496 条要求格式条款提供方对免责、责任限制等条款
 * 履行提示说明义务，未履行则该条款不成为合同内容。现在协议页只有一个
 * 「我已阅读并同意」的勾选框，责任限制、免责、费用、争议解决、协议变更这些重点
 * 条款没有任何单独提示。
 *
 * 摘要文案只做"人话翻译"：不新增平台义务、不扩大或缩小责任范围。
 * 摘要与协议正文不一致时**以正文为准**。
 *
 * ⚠️ 改这份提示的文案（摘要、条目、顺序）时，必须同步升
 * `src/components/legal/legalNotice.ts` 里的 `LEGAL_NOTICE_VERSION`——
 * 留痕里的 `notice_version` 要证明"用户看到的是哪一版提示"。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { fetchAgreementContent, type AgreementContent } from '@/api/auth'
import { LEGAL_NOTICE_VERSION } from './legalNotice'
import { findLegalSectionTitle, legalSectionAnchor } from './legalText'

type KeyTermItem = {
  /** 条目名 */
  label: string
  /** 人话摘要 */
  summary: string
  /** 在协议正文里定位章节的关键词（各协议章节名不同，只能按关键词找） */
  keyword: string
}

/**
 * 提示项固定为五类：责任限制、免责、费用与支付、争议解决、协议变更。
 * 顺序即展示顺序，摘要文案只在这里写，不要散落到各页面。
 */
const KEY_TERM_ITEMS: KeyTermItem[] = [
  {
    label: '责任限制',
    summary:
      '平台就本协议承担的赔偿责任，以争议所涉订单的平台服务费为限；故意或重大过失、人身损害、知识产权、个人信息与支付合规等情形不适用该上限。',
    keyword: '责任',
  },
  {
    label: '免责',
    summary:
      '因不可抗力、基础运营商故障、第三方服务异常、支付渠道处理等平台不能控制的原因造成的损失，按协议约定处理。',
    keyword: '违约',
  },
  {
    label: '费用与支付',
    summary:
      '平台服务费、保证金、充值与提现的金额、用途与规则，以页面展示和《支付与退款说明》为准；平台不会要求向私人账户转账。',
    keyword: '费用',
  },
  {
    label: '争议解决',
    summary: '争议先协商；协商不成的，按协议约定的管辖法院起诉。',
    keyword: '争议',
  },
  {
    label: '协议变更',
    summary: '协议变更会提前公告与通知；涉及重要条款的变更会单独提示。',
    keyword: '变更',
  },
]

const props = withDefaults(
  defineProps<{
    /** 要提示的协议 code（对应后端 contract_template.name） */
    code?: string
    /** 页面里已渲染的章节标题；给了才能跳到正文对应位置 */
    headings?: { id: string; title: string }[]
    /** 没有正文可跳时的兜底链接（例如登录弹窗里跳到 /terms） */
    fallbackHref?: string
  }>(),
  {
    code: 'user_service_agreement',
    headings: () => [],
    fallbackHref: '',
  },
)

const emit = defineEmits<{
  (e: 'loaded', payload: { version: string; effective_at: string }): void
}>()

const agreement = ref<AgreementContent | null>(null)
const version = ref('')
const effectiveAt = ref('')

/** 每个条目的跳转地址：能定位到正文章节就跳章节，否则走兜底链接。 */
const items = computed(() =>
  KEY_TERM_ITEMS.map((item) => {
    const title = findLegalSectionTitle(item.keyword, props.headings ?? [])
    return {
      ...item,
      href: title ? legalSectionAnchor(title) : props.fallbackHref,
    }
  }),
)

async function loadAgreement() {
  try {
    const content = await fetchAgreementContent(props.code)
    agreement.value = content
    version.value = content.version
    effectiveAt.value = content.effective_at
    emit('loaded', { version: content.version, effective_at: content.effective_at })
  } catch {
    agreement.value = null
    version.value = ''
    effectiveAt.value = ''
  }
}

onMounted(loadAgreement)
watch(() => props.code, loadAgreement)

defineExpose({ version, effectiveAt, noticeVersion: LEGAL_NOTICE_VERSION })
</script>

<template>
  <section class="key-terms-notice" aria-label="重要条款提示">
    <header class="key-terms-notice__head">
      <h3 class="key-terms-notice__title">重要条款提示</h3>
      <p v-if="version" class="key-terms-notice__meta">
        协议版本 {{ version }}<template v-if="effectiveAt"> · 生效日期 {{ effectiveAt }}</template>
      </p>
    </header>

    <ul class="key-terms-notice__list">
      <li v-for="item in items" :key="item.label" class="key-terms-notice__item">
        <p class="key-terms-notice__label">
          {{ item.label }}
          <a v-if="item.href" class="key-terms-notice__link" :href="item.href">查看对应条款</a>
        </p>
        <p class="key-terms-notice__summary">{{ item.summary }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.key-terms-notice {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 16px;
  background: var(--el-fill-color-blank, #fff);
}

.key-terms-notice__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.key-terms-notice__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.key-terms-notice__meta {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.key-terms-notice__list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.key-terms-notice__item {
  margin: 6px 0;
}

.key-terms-notice__label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.key-terms-notice__summary {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular, #606266);
}

.key-terms-notice__link {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
}
</style>
