<script setup lang="ts">
/**
 * 订单与渠道对不上（例如云闪付订单却拿到别的支付内容）时的兜底提示：
 * 与其给一个扫不出来的二维码，不如明确让用户回订单页重新发起。
 */
</script>

<template>
  <div class="payment-launch-panel">
    <p class="payment-launch-panel__title">支付订单不匹配</p>
    <p class="payment-launch-panel__error">
      当前订单内容不是云闪付订单，请返回需求页重新发起支付。
    </p>
  </div>
</template>
