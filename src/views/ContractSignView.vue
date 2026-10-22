<script setup lang="ts">
import { TIcon, ArrowLeft, Refresh } from 'ui_73info'
import ContractAttachmentPanel from '@/components/ContractAttachmentPanel.vue'
import ContractArchiveBanner from '@/components/contract/ContractArchiveBanner.vue'
import ContractMetaCard from '@/components/contract/ContractMetaCard.vue'
import ContractSignPanel from '@/components/contract/ContractSignPanel.vue'
import ContractSignatureFacts from '@/components/contract/ContractSignatureFacts.vue'
import ContractSigningHistory from '@/components/contract/ContractSigningHistory.vue'
import { useContractSign } from '@/composables/useContractSign'

/**
 * 合同签署页（R047 拆分后只剩装配）。
 *
 * - 取数、签署闸门、到期归档、爱签轮询：`composables/useContractSign`；
 * - 路由身份与回跳：`composables/useContractSignNavigation`；
 * - 纯展示口径：`shared/contractSign` / `shared/contractSignRedirect`；
 * - 区块：`components/contract/*`，只吃 props、只发 emit。
 *
 * 整页跳转（去爱签签署 / 看爱签预览）必须留在这里：那是离开 SPA 的
 * `window.location` 级跳转，组件只 emit、composable 只交出 URL。
 */
function openPage(url: string) {
  window.location.href = url
}

const {
  loading,
  signing,
  contract,
  token: currentToken,
  error,
  successMsg,
  noticeSigner,
  requirementArchived,
  archiveBanner,
  archiveSignBlockedMessage,
  currentSigner,
  signerIdentityReady,
  canSignContract,
  canSubmitSign,
  showSignatureFacts,
  showLocalDocument,
  parties,
  signingLogs,
  hasCustomAttachment,
  attachmentRequirementId,
  showAttachmentPanel,
  currentPartyAsAttachmentParty,
  effectiveUntilLabel,
  developmentCycleText,
  showBecomeDeveloper,
  applyUpdatedContract,
  loadContract,
  handleSign,
  viewContract,
  goBack,
  goRealname,
  goBecomeDeveloper,
  isWorkbenchSignature,
  isDeveloperAgreement,
  isApiUsageAgreement,
} = useContractSign({ openPage })
</script>

<template>
  <main class="page-shell" :class="{ 'page-shell--workbench': isWorkbenchSignature }">
    <section class="panel">
      <!-- 工作台外壳不再铺页面标题栏，签署页自己出示标题与返回（两种入口同一套页头） -->
      <header class="panel-head">
        <div class="panel-head__title">
          <h2>
            {{
              isApiUsageAgreement
                ? '接口使用协议'
                : isDeveloperAgreement
                  ? '开发者入驻协议'
                  : '需求服务合同'
            }}
          </h2>
          <p v-if="canSignContract" class="lead">请核对实名认证身份后完成签署。</p>
        </div>
        <button type="button" class="btn-secondary panel-head__back" @click="goBack">
          <TIcon><ArrowLeft /></TIcon>返回
        </button>
      </header>

      <div v-if="loading" class="status-msg">加载中…</div>

      <div v-else-if="!contract" class="status-msg">
        <p :role="error ? 'alert' : 'status'">{{ error || '暂无可签署的合同' }}</p>
        <button type="button" class="btn-secondary" @click="loadContract">
          <TIcon><Refresh /></TIcon>重新加载
        </button>
        <button class="btn-secondary" @click="goBack">
          <TIcon><ArrowLeft /></TIcon>返回
        </button>
      </div>

      <template v-else>
        <ContractMetaCard
          :contract-no="contract.contract_no"
          :title="contract.title"
          :status="contract.status"
          :content-sha256="contract.content_sha256"
          :platform-agreement="isApiUsageAgreement || isDeveloperAgreement"
          :effective-until-label="effectiveUntilLabel"
          :development-cycle-text="developmentCycleText"
          :workbench="isWorkbenchSignature"
          @view-contract="viewContract"
        />

        <ContractArchiveBanner v-if="archiveBanner.title" :banner="archiveBanner" />

        <!-- R012：自定义合同附件。双方上传自己的合同文件或在页面内拟定条款，作为主合同的附件随卷签署；
             必须经平台放行后才能发起签署。开发者入驻协议没有附件，不展示。 -->
        <ContractAttachmentPanel
          v-if="showAttachmentPanel"
          :token="currentToken"
          :contract="contract"
          :requirement-id="attachmentRequirementId"
          :party="currentPartyAsAttachmentParty"
          @updated="applyUpdatedContract"
        />

        <div v-if="successMsg" class="msg-success">{{ successMsg }}</div>
        <div v-if="error" class="msg-error">{{ error }}</div>

        <ContractSignatureFacts
          v-if="showSignatureFacts"
          :parties="parties"
          :content="contract.content"
          :has-custom-attachment="hasCustomAttachment"
          :show-local-document="showLocalDocument"
        />

        <ContractSignPanel
          v-model:notice="noticeSigner"
          :can-sign-contract="canSignContract"
          :can-submit-sign="canSubmitSign"
          :signing="signing"
          :signer="currentSigner"
          :signer-identity-ready="signerIdentityReady"
          :requirement-archived="requirementArchived"
          :archive-sign-blocked-message="archiveSignBlockedMessage"
          :show-become-developer="showBecomeDeveloper"
          :workbench="isWorkbenchSignature"
          @realname="goRealname"
          @sign="handleSign"
          @become-developer="goBecomeDeveloper"
        />

        <ContractSigningHistory v-if="showSignatureFacts" :logs="signingLogs" />
      </template>
    </section>
  </main>
</template>

<style scoped>
.page-shell.page-shell--workbench {
  min-height: auto;
  max-width: 1180px;
  padding: 20px 20px 40px;
  overflow-wrap: anywhere;
}
.page-shell--workbench .panel {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.page-shell--workbench .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #247f7d;
  border-color: #cce3e2;
  background: #fff;
  white-space: normal;
}

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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e8edf4;
}

.panel-head__title {
  min-width: 0;
}

.panel-head__back {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-left: auto;
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
  /* 工作台外壳不铺满屏：手机档收窄内边距（原 `.page-shell--workbench` 同一条，见拆分前的视图） */
  .page-shell.page-shell--workbench {
    padding: 16px 12px 28px;
  }

  .page-shell {
    padding: 1rem;
  }

  .panel {
    padding: 1.25rem;
  }
}
</style>
