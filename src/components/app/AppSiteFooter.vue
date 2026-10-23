<script setup lang="ts">
/**
 * 站点页脚：三列基础信息（网站信息 / 备案与合规 / 服务说明）+ 版权行。
 *
 * 从 `App.vue` 拆出，模板逐节点搬移；显隐仍由外壳按路由 `meta.hideSiteFooter` 判定后
 * 用 `v-if` 控制，所以这里不关心自己什么时候出现。
 */
const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="site-footer-host">
    <footer class="site-footer" aria-label="网站基础信息">
      <div class="site-footer-grid">
        <div class="site-footer-block">
          <h3>网站信息</h3>
          <p>平台名称：柒叁信息（73info）</p>
          <p>平台状态：内测中</p>
          <p>联系邮箱：fanbo@73info.cn</p>
          <p>投诉与侵权处理：fanbo@73info.cn</p>
        </div>
        <div class="site-footer-block">
          <h3>备案与合规</h3>
          <p>
            ICP备案号：
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              >滇ICP备2026006119号-3</a
            >
          </p>
          <p>
            公安备案号：
            <a
              class="public-security-beian-link"
              href="https://beian.mps.gov.cn/#/query/webSearch?code=53062802000023"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img class="public-security-beian-icon" src="/icons/beian.png" alt="公安备案图标" />
              <span>滇公网安备53062802000023号</span>
            </a>
          </p>
          <p>
            增值电信业务经营许可证：
            <a
              href="https://dxzhgl.miit.gov.cn/dxxzsp/xkz/xkzgl/resource/qiyesearch.jsp?num=%25E6%25BB%2587B2-20260273&type=xuke"
              target="_blank"
              rel="noopener noreferrer"
              >滇B2-20260273</a
            >
          </p>
          <p>交易说明：第三方支付担保与分账</p>
        </div>
        <div class="site-footer-block">
          <h3>服务说明</h3>
          <p><router-link to="/about">关于我们</router-link></p>
          <p><router-link to="/terms">用户协议</router-link></p>
          <p><router-link to="/privacy">隐私政策</router-link></p>
          <p><router-link to="/payment-refund">支付与退款说明</router-link></p>
        </div>
      </div>
      <p class="site-footer-copy">© {{ currentYear }} 柒叁信息 73Info. All rights reserved.</p>
    </footer>
  </div>
</template>
