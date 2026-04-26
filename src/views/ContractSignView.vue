<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchMyRequirementContract, signContract, type ContractDetail } from '@/api/contracts'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const requirementId = String(route.query.requirement_id ?? '')

const loading = ref(true)
const signing = ref(false)
const contract = ref<ContractDetail | null>(null)
const error = ref('')
const successMsg = ref('')

async function loadContract() {
    loading.value = true
    error.value = ''
    try {
        contract.value = await fetchMyRequirementContract(requirementId)
    } catch {
        error.value = '加载合同失败，请刷新重试'
    } finally {
        loading.value = false
    }
}

async function handleSign() {
    if (!contract.value || signing.value) return
    signing.value = true
    error.value = ''
    try {
        contract.value = await signContract(contract.value.id)
        successMsg.value = '合同已签署成功！'
    } catch {
        error.value = '签署失败，请稍后重试'
    } finally {
        signing.value = false
    }
}

function goHome() {
    router.push('/')
}

onMounted(() => {
    auth.hydrate()
    if (!requirementId) {
        router.replace('/')
        return
    }
    void loadContract()
})
</script>

<template>
    <main class="page-shell">
        <section class="panel">
            <header class="panel-head">
                <div>
                    <h2>需求服务合同</h2>
                    <p class="lead">请阅读以下合同内容，确认后点击签署按钮完成签署。</p>
                </div>
            </header>

            <div v-if="loading" class="status-msg">加载中…</div>

            <div v-else-if="!contract" class="status-msg">
                <p>暂无可签署的合同，可能合同尚在生成中，请稍后刷新页面。</p>
                <button class="btn-secondary" @click="goHome">返回首页</button>
            </div>

            <template v-else>
                <div class="contract-meta">
                    <p><strong>合同编号：</strong>{{ contract.contract_no }}</p>
                    <p><strong>合同标题：</strong>{{ contract.title }}</p>
                    <p><strong>甲方：</strong>{{ contract.party_a_name }}（{{ contract.party_a_username }}）</p>
                    <p><strong>乙方：</strong>{{ contract.party_b_name }}（{{ contract.party_b_username }}）</p>
                    <p><strong>乙方签署时间：</strong>{{ contract.party_b_signed_at ?? '待签署' }}</p>
                    <p v-if="contract.party_a_signed_at"><strong>甲方签署时间：</strong>{{ contract.party_a_signed_at }}</p>
                </div>

                <div class="contract-content" v-html="contract.content"></div>

                <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
                <div v-if="error" class="msg-error">{{ error }}</div>

                <div class="contract-actions">
                    <button v-if="contract.status === 'pending_party_a'" class="btn-primary" :disabled="signing"
                        @click="handleSign">
                        {{ signing ? '签署中…' : '确认签署合同' }}
                    </button>
                    <span v-else-if="contract.status === 'signed'" class="badge-signed">已签署</span>
                    <button class="btn-secondary" @click="goHome">返回首页</button>
                </div>
            </template>
        </section>
    </main>
</template>

<style scoped>
.page-shell {
    min-height: 100vh;
    padding: 2rem 1rem;
    max-width: 800px;
    margin: 0 auto;
}

.panel {
    background: #fff;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.panel-head {
    margin-bottom: 1.5rem;
}

.panel-head h2 {
    font-size: 1.4rem;
    font-weight: 600;
}

.panel-head .lead {
    color: #666;
    margin-top: 0.4rem;
}

.status-msg {
    color: #666;
    padding: 1rem 0;
}

.contract-meta {
    background: #f8f9fa;
    border-radius: 6px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
}

.contract-meta p {
    margin: 0.3rem 0;
    font-size: 0.95rem;
}

.contract-content {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1.2rem 1.5rem;
    min-height: 200px;
    font-size: 0.9rem;
    line-height: 1.8;
    white-space: pre-wrap;
    margin-bottom: 1.5rem;
    max-height: 60vh;
    overflow-y: auto;
}

.contract-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
}

.btn-primary {
    padding: 0.6rem 1.6rem;
    background: #1a73e8;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-secondary {
    padding: 0.6rem 1.4rem;
    background: transparent;
    color: #444;
    border: 1px solid #ccc;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
}

.badge-signed {
    display: inline-block;
    padding: 0.4rem 0.9rem;
    background: #e6f4ea;
    color: #34a853;
    border-radius: 4px;
    font-size: 0.9rem;
}

.msg-success {
    color: #34a853;
    margin-bottom: 1rem;
    font-weight: 500;
}

.msg-error {
    color: #d32f2f;
    margin-bottom: 1rem;
}
</style>
