<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

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
                    <h2>隐私政策</h2>
                    <p class="lead">柒叁信息 73Info 尊重并保护您的个人隐私。本政策说明我们的数据处理方式。</p>
                </div>
                <button class="top-back" type="button" @click="goBack">返回</button>
            </header>

            <article class="content-block">
                <h3>1. 信息收集</h3>
                <p>我们在您使用平台服务时可能收集以下信息：登录账号、用户名、邮箱地址、需求内容、订单记录、支付信息、评价内容和浏览行为。</p>

                <h3>2. 信息使用</h3>
                <p>我们会将收集的信息用于：提供服务、确保账户安全、处理支付与订单、改进产品体验、客户支持和合规审计。</p>

                <h3>3. 信息分享</h3>
                <p>未经用户同意，我们不会向第三方出售或交换个人信息。仅在下列情形下可能共享：法律法规要求、平台服务提供方（如支付渠道）、保护平台安全或防范违规行为。</p>

                <h3>4. 缓存与存储</h3>
                <p>平台会合理保存用户数据，并采取安全措施防止数据泄露、损坏或丢失。对于不再提供服务的账户，我们会依法合理处理相关信息。</p>

                <h3>5. Cookies 与本地存储</h3>
                <p>网站可能使用 Cookie 或本地存储来维持登录状态、优化体验和统计访问。您可以通过浏览器设置管理 Cookie 权限。</p>

                <h3>6. 未成年人保护</h3>
                <p>如果您是未成年人，请在监护人指导下使用本平台。我们不建议未成年人独立完成支付行为。</p>

                <h3>7. 隐私政策更新</h3>
                <p>本政策可能不时更新。更新后将在平台展示生效日期，继续使用即视为接受更新后的政策。</p>
            </article>
        </section>
    </main>
</template>
