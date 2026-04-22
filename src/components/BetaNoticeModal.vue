<script setup lang="ts">
import { ref, onMounted } from 'vue'

import { recordAgreementAcceptance } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

// 当本协议内容变更时，升级此版本号，将强制所有用户重新同意
const CONSENT_VERSION = '2026-04-22-v1'
const AGREEMENT_CODE = 'beta-access'
const CLIENT_PLATFORM = 'user-client'
const STORAGE_KEY = 'beta_consent'

const auth = useAuthStore()
const visible = ref(false)
const checkedRead = ref(false)
const checkedResponsible = ref(false)
const agreeBtnLoading = ref(false)
const submitError = ref('')

function hasValidConsent(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const record = JSON.parse(raw) as { version?: string }
    return record.version === CONSENT_VERSION
  } catch {
    return false
  }
}

onMounted(() => {
  if (!hasValidConsent()) {
    visible.value = true
  }
})

async function handleAgree() {
  if (!checkedRead.value || !checkedResponsible.value) return
  agreeBtnLoading.value = true
  submitError.value = ''

  try {
    const response = await recordAgreementAcceptance(
      auth.token,
      AGREEMENT_CODE,
      CONSENT_VERSION,
      CLIENT_PLATFORM,
    )

    const record = {
      version: CONSENT_VERSION,
      agreed_at: response.agreed_at,
      ua: navigator.userAgent.slice(0, 200),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))

    visible.value = false
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '协议留痕失败，请稍后重试'
  } finally {
    agreeBtnLoading.value = false
  }
}

function handleReject() {
  // 拒绝则关闭标签页或跳转到安全页
  window.location.href = 'about:blank'
}
</script>

<template>
  <el-dialog v-model="visible" title="内测参与协议 — 请仔细阅读" width="680px" :close-on-click-modal="false"
    :close-on-press-escape="false" :show-close="false" class="beta-notice-dialog" align-center>
    <div class="beta-notice-body">
      <el-alert title="本平台当前处于内测阶段，使用前须阅读并同意以下协议" type="warning" :closable="false" show-icon
        style="margin-bottom: 16px" />

      <div class="beta-notice-scroll">
        <h3>柒叁信息（73Info）平台内测参与协议</h3>
        <p class="beta-notice-meta">版本：{{ CONSENT_VERSION }} &nbsp;|&nbsp; 协议主体：彝良县柒叁信息传输店（个体工商户，以下简称"平台"）</p>

        <p>欢迎参与 73Info 平台内测。<strong>在您点击"同意并进入"之前，请务必完整阅读本协议全文。点击同意即表示您与平台就以下事项达成具有法律约束力的合意。</strong></p>

        <h4>一、内测性质声明</h4>
        <p>1.1 本平台当前版本为<strong>非公开内测版本</strong>，功能尚未完整，存在缺陷、不稳定及随时变更的可能，不代表最终正式产品形态。</p>
        <p>1.2 内测资格由平台邀请授予，不可转让。未经平台书面授权，参与者不得向任何第三方公开平台内测功能、界面、数据或操作流程等信息。</p>
        <p>1.3 平台有权随时修改、中止或终止内测，并可在不提前通知的情况下回收任何参与者的内测资格。</p>

        <h4>二、数据风险告知</h4>
        <p>2.1 内测期间，平台<strong>不保证数据持久性</strong>。系统可能进行数据重置、数据库迁移或历史记录清除，由此导致的数据丢失平台不承担任何责任。</p>
        <p>2.2 内测期间产生的订单、交易记录、余额等数据仅用于功能验证目的，平台保留在内测结束后对上述数据进行清除或调整的权利。</p>
        <p>2.3 参与者不应将重要的、不可替代的真实业务数据用于内测操作。</p>

        <h4>三、真实交易免责</h4>
        <p>3.1 若内测阶段涉及真实资金交易（含支付宝、微信支付等渠道），参与者须自行评估风险并自愿参与，平台对内测阶段产生的真实资金损失、交易纠纷不承担赔偿责任，但法律法规明确要求的除外。</p>
        <p>3.2 平台会在技术合理范围内保障资金安全，但不对内测系统的 100% 可用性及资金安全作出明示或默示保证。</p>

        <h4>四、保密义务</h4>
        <p>4.1 参与者知悉的内测产品信息（包括但不限于功能设计、界面布局、技术方案、定价策略）均属保密信息，不得向任何第三方披露或用于商业竞争目的。</p>
        <p>4.2 保密义务自本协议生效之日起持续至内测结束后 <strong>两（2）年</strong>。</p>

        <h4>五、知识产权</h4>
        <p>5.1 平台保留内测版本的全部知识产权。参与者不得对平台软件进行反编译、反汇编或其他形式的逆向工程。</p>

        <h4>六、免责声明</h4>
        <p>6.1 平台不对内测版本造成的任何直接或间接损失（包括但不限于利润损失、业务中断、数据丢失）承担超出法律强制性规定以外的赔偿责任。</p>
        <p>6.2 平台对内测版本不提供任何形式的服务水平协议（SLA）。</p>

        <h4>七、协议变更</h4>
        <p>7.1 平台可能不时更新本协议，更新后将以弹窗形式再次征得参与者同意。继续使用平台视为接受更新后的协议。</p>

        <h4>八、法律适用与争议解决</h4>
        <p>8.1 本协议受<strong>中华人民共和国法律</strong>管辖。</p>
        <p>8.2 因本协议产生的争议，双方应首先协商解决；协商不成的，提交平台注册地有管辖权的人民法院诉讼解决。</p>

        <h4>九、联系方式</h4>
        <p>如对本协议有疑问，请联系：<strong>fanbo@73info.cn</strong></p>

        <p class="beta-notice-version">本协议版本号：{{ CONSENT_VERSION }}，同意时间将记录于本地存储，以备查验。</p>
      </div>

      <div class="beta-notice-checks">
        <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" show-icon />
        <el-checkbox v-model="checkedRead">
          我已<strong>完整阅读</strong>上述内测参与协议全文，理解其中所有条款
        </el-checkbox>
        <el-checkbox v-model="checkedResponsible">
          我自愿参与内测，接受数据风险及保密义务，并承担相应责任
        </el-checkbox>
      </div>
    </div>

    <template #footer>
      <div class="beta-notice-actions">
        <el-button @click="handleReject" plain>不同意，退出</el-button>
        <el-button type="primary" :disabled="!checkedRead || !checkedResponsible" :loading="agreeBtnLoading"
          @click="handleAgree">
          同意并进入平台
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 强制弹窗本体为白色，防止继承页面暗色背景 */
:deep(.beta-notice-dialog .el-dialog) {
  background: #ffffff !important;
  color: #1a1a1a;
}

:deep(.beta-notice-dialog .el-dialog__title) {
  color: #1a1a1a;
  font-weight: 600;
}

:deep(.beta-notice-dialog .el-dialog__body) {
  background: #ffffff;
  color: #1a1a1a;
}

:deep(.beta-notice-dialog .el-dialog__footer) {
  background: #ffffff;
}

.beta-notice-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.beta-notice-scroll {
  max-height: 48vh;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.75;
  color: #1a1a1a;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 16px;
  background: #ffffff;
}

.beta-notice-scroll h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #0d0d0d;
}

.beta-notice-scroll h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 14px 0 4px;
  color: #0d0d0d;
}

.beta-notice-scroll p {
  margin: 4px 0;
  color: #1a1a1a;
}

.beta-notice-meta {
  font-size: 12px;
  color: #555;
  margin-bottom: 12px !important;
}

.beta-notice-version {
  font-size: 12px;
  color: #888;
  margin-top: 14px !important;
  border-top: 1px solid #e4e7ed;
  padding-top: 8px;
}

.beta-notice-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

:deep(.beta-notice-dialog .el-checkbox__label) {
  color: #1a1a1a;
}

.beta-notice-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
