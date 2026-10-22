<script setup lang="ts">
import type { ResourcePayChannelUi } from '@/shared/resourceSale'

/**
 * 购买确认弹窗（Teleport 到 body）。
 *
 * 纯展示 + 三个动作出口：`close`（点遮罩或 ×）、`select-channel`（支付宝 / 微信）、
 * `confirm`（积分单的「确认兑换」）。下单、串行队列、支付面世代号、轮询都在
 * `useResourcePurchase` 里，这一层不碰 router / TMessage / api。
 *
 * ⚠️ 层级：`.resource-purchase-modal .actions`（0,2,0）压的是全站 `modal.css` 的
 * `.pay-modal .actions`（0,2,0）/ `.modal-wrap .pay-modal .actions`（0,3,0）这一组；
 * scoped 会再补一个属性选择器。**必须保持「`.resource-purchase-modal .actions` 两段式」**，
 * 不许简化成 `.actions`——单类写法只有 0,2,0，会与 `.pay-modal .actions` 打平、按顺序输给全站样式。
 */
const props = defineProps<{
  /** 是否展示（v-if 在子组件内部，Teleport 始终挂着） */
  open: boolean
  /** 资源标题；资源还没取到时传空串，整块标题行不渲染 */
  title: string
  priceLabel: string
  /** 积分单：没有渠道选择与二维码，底部换成「确认兑换」 */
  isPointsListing: boolean
  /** 买家积分余额（积分单才展示，null 表示还在拉） */
  balance: number | null
  /** 推广归因轻提示（比例 > 0 且本次带推广码时才为 true） */
  showPromoHint: boolean
  channel: ResourcePayChannelUi
  /** 后端拒绝原因，持久展示在弹窗里 */
  error: string
  /** 下单进行中：渠道按钮与兑换按钮都置灰 */
  submitting: boolean
  orderNo: string
  orderStatus: string
  qrDataUrl: string
}>()

const emit = defineEmits<{
  close: []
  'select-channel': [channel: ResourcePayChannelUi]
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="modal-wrap resource-purchase-modal-wrap"
      @click.self="emit('close')"
    >
      <section
        class="pay-modal resource-purchase-modal"
        role="dialog"
        aria-modal="true"
        aria-label="购买确认"
      >
        <header class="resource-purchase-modal__head">
          <div class="resource-purchase-modal__titles">
            <p class="resource-purchase-modal__eyebrow">数字化资源</p>
            <h3>购买确认</h3>
          </div>
          <button
            type="button"
            class="resource-purchase-modal__close"
            aria-label="关闭"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <p v-if="title" class="resource-purchase-modal__subject">
          <strong>{{ title }}</strong>
        </p>

        <div class="resource-purchase-modal__amount" aria-live="polite">
          <span>{{ isPointsListing ? '应付积分' : '应付金额' }}</span>
          <strong>{{ priceLabel }}</strong>
        </div>

        <p v-if="isPointsListing" class="resource-purchase-modal__balance">
          当前积分余额：
          <strong>{{ balance == null ? '加载中…' : balance }}</strong>
        </p>

        <ul class="resource-purchase-modal__notes">
          <li>本商品为数字化资源（虚拟商品），支付成功后获得下载权。</li>
          <li v-if="isPointsListing">
            确认后立即扣积分并解锁下载；平台抽成后净额计入卖家积分账户。
          </li>
          <li>尚未产生成功下载前可申请退款；下载成功后不支持自助退款。</li>
        </ul>

        <!-- R029 推广归因轻提示：只说明「这单是推广者带来的」，不打断下单，也不透露推广者是谁 -->
        <p v-if="showPromoHint" class="resource-purchase-modal__promo-hint" role="note">
          本单由推广者带来，卖家将从净收中支付约定分成。
        </p>

        <div
          v-if="!isPointsListing"
          class="payment-options"
          role="radiogroup"
          aria-label="支付方式选择"
        >
          <button
            type="button"
            class="payment-option"
            :class="{
              active: channel === 'alipay',
              'payment-option--alipay': channel === 'alipay',
            }"
            :disabled="submitting"
            @click="emit('select-channel', 'alipay')"
          >
            <img class="payment-option-icon" src="/icons/alipay.png" alt="" />
            支付宝
          </button>
          <button
            type="button"
            class="payment-option"
            :class="{
              active: channel === 'wechat',
              'payment-option--wechat': channel === 'wechat',
            }"
            :disabled="submitting"
            @click="emit('select-channel', 'wechat')"
          >
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="" />
            微信
          </button>
        </div>

        <p v-if="error" class="resource-purchase-modal__error" role="alert">
          {{ error }}
        </p>

        <div
          v-if="!isPointsListing && (qrDataUrl || submitting || orderNo)"
          class="resource-purchase-modal__qr"
        >
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="支付二维码" width="220" height="220" />
          <p v-else-if="submitting" class="resource-purchase-modal__order">正在获取支付码…</p>
          <p v-else-if="orderNo" class="resource-purchase-modal__order">
            订单号 {{ orderNo }} · {{ orderStatus }}
          </p>
        </div>

        <div v-if="isPointsListing" class="actions">
          <button
            class="ghost primary"
            type="button"
            :disabled="submitting"
            @click="emit('confirm')"
          >
            {{ submitting ? '兑换中...' : `确认兑换 ${priceLabel}` }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 色值取父级全局块里挂在 `.resource-purchase-modal-wrap` 上的 `--rdp-purchase-*`（新文件不许有裸色值） */
.resource-purchase-modal-wrap {
  z-index: 90;
  background: var(--rdp-purchase-scrim);
  backdrop-filter: blur(4px);
}

.resource-purchase-modal {
  width: min(440px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px 22px 20px;
  border-radius: 24px;
  border: 1px solid var(--rdp-purchase-border);
  background:
    radial-gradient(circle at top right, var(--rdp-purchase-glow), transparent 42%),
    var(--rdp-purchase-surface);
  box-shadow: 0 22px 48px var(--rdp-purchase-shadow);
}

.resource-purchase-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.resource-purchase-modal__titles {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.resource-purchase-modal__eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--rdp-purchase-muted);
}

.resource-purchase-modal__head h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--rdp-purchase-ink);
  line-height: 1.25;
}

.resource-purchase-modal__close {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid var(--rdp-purchase-close-border);
  border-radius: 999px;
  background: var(--rdp-purchase-plate-surface);
  color: var(--rdp-purchase-muted);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.resource-purchase-modal__close:hover {
  color: var(--rdp-purchase-ink);
  border-color: var(--rdp-purchase-close-border-hover);
  background: var(--rdp-purchase-white);
}

.resource-purchase-modal__subject {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--rdp-purchase-plate-surface);
  border: 1px solid var(--rdp-purchase-plate-border);
  color: var(--rdp-purchase-body);
  font-size: 13px;
  line-height: 1.5;
}

.resource-purchase-modal__subject strong {
  display: block;
  color: var(--rdp-purchase-ink);
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-purchase-modal__amount {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--rdp-purchase-amount-border);
  background: linear-gradient(
    135deg,
    var(--rdp-purchase-amount-from),
    var(--rdp-purchase-amount-to)
  );
  text-align: center;
}

.resource-purchase-modal__amount span {
  color: var(--rdp-purchase-amount-ink);
  font-size: 13px;
  font-weight: 700;
}

.resource-purchase-modal__amount strong {
  color: var(--rdp-purchase-amount-ink);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}

.resource-purchase-modal__balance {
  margin: 0;
  color: var(--rdp-purchase-soft-ink);
  font-size: 13px;
  line-height: 1.5;
}

.resource-purchase-modal__balance strong {
  color: var(--rdp-purchase-ink);
  font-weight: 700;
}

.resource-purchase-modal__notes {
  margin: 0;
  padding: 12px 14px 12px 30px;
  border-radius: 14px;
  border: 1px solid var(--rdp-purchase-notes-border);
  background: var(--rdp-purchase-notes-surface);
  color: var(--rdp-purchase-body);
  font-size: 13px;
  line-height: 1.65;
}

.resource-purchase-modal__notes li + li {
  margin-top: 4px;
}

/* R029 推广轻提示：中性说明色，不阻断下单 */
.resource-purchase-modal__promo-hint {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px dashed var(--rdp-purchase-dashed);
  background: var(--rdp-purchase-dashed-surface);
  color: var(--rdp-purchase-soft-ink);
  font-size: 12px;
  line-height: 1.6;
}

.resource-purchase-modal__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--rdp-purchase-error-border);
  background: var(--rdp-purchase-error-surface);
  color: var(--rdp-purchase-error-ink);
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.resource-purchase-modal .payment-options {
  margin: 0;
}

/* ⚠️ 两段式不能简化：单类 `.actions` 会被全站 `modal.css` 的 `.pay-modal .actions` 反压 */
.resource-purchase-modal .actions {
  margin-top: 2px;
  justify-content: flex-end;
}

.resource-purchase-modal__qr {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 10px;
  min-height: 248px;
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed var(--rdp-purchase-dashed);
  background: var(--rdp-purchase-dashed-surface);
  text-align: center;
  color: var(--rdp-purchase-soft-ink);
  font-size: 13px;
  line-height: 1.55;
}

.resource-purchase-modal__qr img {
  border-radius: 12px;
  border: 1px solid var(--rdp-purchase-plate-border);
  background: var(--rdp-purchase-white);
}

.resource-purchase-modal__order {
  margin: 0;
  font-size: 12px;
  color: var(--rdp-purchase-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .resource-purchase-modal {
    width: min(100%, 100%);
    gap: 14px;
    padding: 18px 16px 16px;
    border-radius: 20px;
  }

  .resource-purchase-modal__amount strong {
    font-size: 24px;
  }

  .resource-purchase-modal .actions {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
  }

  .resource-purchase-modal .actions .ghost {
    width: 100%;
  }
}
</style>
