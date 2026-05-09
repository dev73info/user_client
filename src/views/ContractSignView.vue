<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
const accepted = ref(false)

const signingLogs = computed(() => contract.value?.signing_logs ?? [])
const currentParty = computed<'party_a' | 'party_b' | null>(() => {
    if (!contract.value || !auth.username) return null
    if (contract.value.party_a_username === auth.username) return 'party_a'
    if (contract.value.party_b_username === auth.username) return 'party_b'
    return null
})
const canSignContract = computed(() => {
    if (!contract.value) return false
    return (
        (contract.value.status === 'pending_party_a' && currentParty.value === 'party_a') ||
        (contract.value.status === 'pending_party_b' && currentParty.value === 'party_b')
    )
})
const waitingMessage = computed(() => {
    if (!contract.value || contract.value.status === 'signed') return ''
    if (contract.value.status === 'pending_party_b') return '等待乙方开发者签署合同'
    if (contract.value.status === 'pending_party_a') return '等待甲方需求方签署合同'
    return ''
})

function actionLabel(action: string): string {
    const labels: Record<string, string> = {
        created: '创建合同',
        updated: '更新合同',
        deleted: '删除合同',
        auto_created: '系统生成',
        party_a_signed: '甲方签署',
        party_b_signed: '乙方签署',
    }
    return labels[action] ?? action
}

function statusLabel(status: string): string {
    const labels: Record<string, string> = {
        draft: '草稿',
        pending_party_a: '待甲方签署',
        pending_party_b: '待乙方签署',
        signed: '已签署',
        void: '已作废',
    }
    return labels[status] ?? status
}

async function loadContract() {
    loading.value = true
    error.value = ''
    try {
        contract.value = await fetchMyRequirementContract(auth.token, requirementId)
        accepted.value = false
    } catch {
        error.value = '加载合同失败，请刷新重试'
    } finally {
        loading.value = false
    }
}

async function handleSign() {
    if (!contract.value || signing.value) return
    if (!accepted.value) {
        error.value = '请先确认已阅读并同意合同内容'
        return
    }
    signing.value = true
    error.value = ''
    try {
        contract.value = await signContract(auth.token, contract.value.id)
        successMsg.value = '合同已签署成功！'
    } catch {
        error.value = '签署失败，请稍后重试'
    } finally {
        signing.value = false
    }
}

function goHome() {
    if (route.query.from === 'dev') {
        router.push({ name: 'dev-my-requirements' })
        return
    }
    router.push({ name: 'workbench-requirements' })
}

onMounted(async () => {
    auth.hydrate()
    if (!requirementId) {
        router.replace('/')
        return
    }
    if (auth.token) {
        await auth.initializeSession().catch(() => undefined)
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
                    <p><strong>签署状态：</strong><span class="contract-status-chip"
                            :class="`contract-status-chip--${contract.status}`">{{ statusLabel(contract.status)
                            }}</span></p>
                    <p><strong>甲方：</strong>{{ contract.party_a_name }}（{{ contract.party_a_username }}）</p>
                    <p><strong>乙方：</strong>{{ contract.party_b_name }}（{{ contract.party_b_username }}）</p>
                    <p><strong>乙方签署时间：</strong>{{ contract.party_b_signed_at ?? '待签署' }}</p>
                    <p v-if="contract.party_a_signed_at"><strong>甲方签署时间：</strong>{{ contract.party_a_signed_at }}</p>
                    <p><strong>合同指纹：</strong><span class="hash-text">{{ contract.content_sha256 }}</span></p>
                </div>

                <section class="contract-content">{{ contract.content }}</section>

                <section class="evidence-panel">
                    <h3>签署证据摘要</h3>
                    <p>本页记录平台账号、签署时间、合同内容指纹与状态流转。内容指纹用于核对当前合同正文是否被篡改。</p>
                    <div v-if="signingLogs.length > 0" class="log-list">
                        <div v-for="log in signingLogs" :key="log.id" class="log-item">
                            <div>
                                <strong>{{ actionLabel(log.action) }}</strong>
                                <span>{{ log.created_at }}</span>
                            </div>
                            <p>操作账号：{{ log.operator }}</p>
                            <p v-if="log.note">{{ log.note }}</p>
                        </div>
                    </div>
                    <p v-else class="empty-log">暂无签署日志。</p>
                </section>

                <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
                <div v-if="error" class="msg-error">{{ error }}</div>

                <label v-if="canSignContract" class="accept-row">
                    <input v-model="accepted" type="checkbox" />
                    <span>我已完整阅读合同正文，确认以当前平台账号签署，并同意系统保存本次签署记录作为履约证据。</span>
                </label>

                <div class="contract-actions">
                    <button v-if="canSignContract" class="btn-primary" :disabled="signing || !accepted"
                        @click="handleSign">
                        {{ signing ? '签署中…' : '确认签署合同' }}
                    </button>
                    <span v-else-if="contract.status === 'signed'" class="badge-signed">已签署</span>
                    <span v-else-if="waitingMessage" class="badge-pending">{{ waitingMessage }}</span>
                    <button class="btn-secondary" @click="goHome">返回首页</button>
                </div>
            </template>
        </section>
    </main>
</template>

<style scoped>
.page-shell {
    min-height: 100vh;
    padding: 2.5rem 1rem 3rem;
    max-width: 920px;
    margin: 0 auto;
    color: #172033;
}

.panel {
    background: #fff;
    border-radius: 8px;
    padding: 2rem 2.2rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
}

.panel-head {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e8edf4;
}

.panel-head h2 {
    margin: 0;
    color: #f59e0b;
    font-size: 1.65rem;
    font-weight: 800;
    letter-spacing: 0;
}

.panel-head .lead {
    color: #4b5563;
    margin-top: 0.4rem;
    font-size: 0.96rem;
}

.status-msg {
    color: #475569;
    padding: 1rem 0;
}

.contract-meta {
    background: #f8fafc;
    border: 1px solid #dbe5f0;
    border-left: 4px solid #2563eb;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
}

.contract-meta p {
    margin: 0.45rem 0;
    color: #243044;
    font-size: 0.95rem;
    line-height: 1.65;
}

.contract-meta strong {
    color: #0f172a;
    font-weight: 750;
}

.contract-status-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0.12rem 0.6rem;
    border-radius: 999px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 0.84rem;
    font-weight: 750;
}

.contract-status-chip--pending_party_a,
.contract-status-chip--pending_party_b {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #c2410c;
}

.contract-status-chip--signed {
    border-color: #bbf7d0;
    background: #ecfdf5;
    color: #047857;
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

.hash-text {
    display: inline-block;
    max-width: 100%;
    margin-top: 0.2rem;
    padding: 0.28rem 0.45rem;
    border-radius: 5px;
    background: #eaf2ff;
    color: #1e40af;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.86rem;
    font-weight: 700;
    word-break: break-all;
}

.evidence-panel {
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    margin-bottom: 1.5rem;
    background: #eff6ff;
}

.evidence-panel h3 {
    margin: 0 0 0.5rem;
    color: #1e3a8a;
    font-size: 1.08rem;
    font-weight: 800;
}

.evidence-panel p {
    margin: 0.35rem 0;
    color: #334155;
    font-size: 0.9rem;
}

.log-list {
    display: grid;
    gap: 0.65rem;
    margin-top: 0.8rem;
}

.log-item {
    padding: 0.75rem 0.85rem;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
}

.log-item div {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.log-item span {
    color: #475569;
    font-size: 0.85rem;
}

.empty-log {
    color: #475569;
}

.accept-row {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    margin-bottom: 1.1rem;
    padding: 0.9rem 1rem;
    color: #1f2937;
    font-size: 0.94rem;
    line-height: 1.6;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    background: #fffbeb;
}

.accept-row input {
    width: 18px;
    height: 18px;
    margin-top: 0.25rem;
    flex: 0 0 auto;
    accent-color: #f59e0b;
}

.contract-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
}

.btn-primary {
    min-height: 42px;
    padding: 0.75rem 1.8rem;
    background: #f59e0b;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.98rem;
    font-weight: 800;
    box-shadow: 0 10px 18px rgba(245, 158, 11, 0.22);
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-secondary {
    min-height: 42px;
    padding: 0.7rem 1.35rem;
    background: transparent;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 650;
}

.badge-signed {
    display: inline-block;
    padding: 0.55rem 1rem;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #bbf7d0;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 800;
}

.badge-pending {
    display: inline-block;
    padding: 0.55rem 1rem;
    background: #fff7ed;
    color: #c2410c;
    border: 1px solid #fed7aa;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 800;
}

.msg-success {
    color: #047857;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    margin-bottom: 1rem;
    font-weight: 700;
}

.msg-error {
    color: #b91c1c;
    padding: 0.75rem 0.9rem;
    border-radius: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    margin-bottom: 1rem;
    font-weight: 700;
}

@media (max-width: 640px) {
    .page-shell {
        padding: 1rem;
    }

    .panel {
        padding: 1.25rem;
    }

    .contract-content {
        padding: 1rem;
    }
}
</style>
