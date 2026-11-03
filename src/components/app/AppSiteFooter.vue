<script setup lang="ts">
/**
 * 站点页脚：工作台风格的单行信息条（品牌 / 版权 / 服务链接 / 系统状态），
 * 下方一行小字保留平台与备案信息（ICP、公安备案、增值电信许可证必须展示）。
 *
 * 外壳只在首页（路由 `home`）用 `v-if` 渲染它，内页不展示，所以这里不关心自己什么时候出现。
 */
const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="site-footer-host">
    <footer class="site-footer" aria-label="网站基础信息">
      <div class="site-footer-inner">
        <div class="site-footer-main">
          <div class="site-footer-brand">
            <strong>73info.cn</strong>
            <span>© {{ currentYear }} 柒叁信息 73Info. All rights reserved.</span>
          </div>
          <nav class="site-footer-links" aria-label="服务说明">
            <router-link to="/about">关于我们</router-link>
            <router-link to="/terms">用户协议</router-link>
            <router-link to="/rules">平台规则</router-link>
            <router-link to="/privacy">隐私政策</router-link>
            <router-link to="/payment-refund">支付与退款说明</router-link>
            <span class="site-footer-status">
              <span class="site-footer-status__dot" aria-hidden="true"></span>
              系统状态: 正常
            </span>
          </nav>
        </div>

        <div class="site-footer-legal">
          <span>平台名称：柒叁信息（73info）</span>
          <span>平台状态：内测中</span>
          <span> 联系与投诉邮箱：<a href="mailto:fanbo@73info.cn">fanbo@73info.cn</a> </span>
          <span>
            ICP备案号：
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              >滇ICP备2026006119号-3</a
            >
          </span>
          <span>
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
          </span>
          <span>
            增值电信业务经营许可证：
            <a
              href="https://dxzhgl.miit.gov.cn/dxxzsp/xkz/xkzgl/resource/qiyesearch.jsp?num=%25E6%25BB%2587B2-20260273&type=xuke"
              target="_blank"
              rel="noopener noreferrer"
              >滇B2-20260273</a
            >
          </span>
        </div>
      </div>
    </footer>
  </div>
</template>
