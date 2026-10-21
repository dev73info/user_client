import { ref } from 'vue'

import {
  ocrBusinessLicense,
  uploadBusinessLicenseFile,
  uploadGuardianConsentFile,
  uploadLegalCertBackFile,
  uploadLegalCertFrontFile,
} from '@/api/realname'
import {
  MAX_BUSINESS_SCOPE_LEN,
  MAX_COMPANY_ADDRESS_LEN,
  type RealnameDraftFields,
} from '@/shared/realnameForm'
import { settlementProvinces } from '@/utils/settlementAccount'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 实名材料域：企业开户进件的三张证照（营业执照 + 法人身份证人像面 / 国徽面）与监护人同意书的
 * 上传、以及营业执照的 OCR 回填。
 *
 * **三张证照的落库方式不同，别混**：
 * - 营业执照：上传拿到 `business_license_file`，随实名提交 payload 一起走，**还要**顺手 OCR 回填
 *   企业信息（名称 / 信用代码 / 注册地址 / 经营范围 / 有效期，省市编码由注册地址映射）；
 * - 法人身份证两面：后端上传即落库（`realname_legal_cert.front_file` / `back_file`），只记文件名
 *   供界面回显，**不**进实名提交 payload；上传成功后触发一次有效期识别（见 `useLegalCertPeriod`）；
 * - 监护人同意书：只给 14~18 周岁未成年人的实名提交带（`guardian_consent_file`）。
 *
 * 三件**不**在这里的事：
 * 1. 隐藏 `<input type="file">` 与「选择文件」按钮在 `components/account/RealnameMaterialUpload.vue`：
 *    模板节点在组件里，`ref` 拿不到跨组件边界，所以「点开文件选择框」跟着节点走；这里收到的是
 *    **已选好的 `File`**，校验 / 上传 / 识别全在这一层；
 * 2. 有效期的起止与「用户动过」标记归 `useLegalCertPeriod`（本层只在证件照上传成功后触发它）；
 * 3. 弹窗开合归视图——`watch(realnameDialogVisible)`（关闭即丢弃变更草稿、打开即补一次识别）
 *    必须留在视图。
 */
export type RealnameMaterialsOptions = {
  /** 表单草稿（与草稿域同一份实例）：上传结果就写在这上面。 */
  form: RealnameDraftFields
  /**
   * 证件照上传成功后触发法人证件有效期识别（注入 `useLegalCertPeriod` 的同名函数）。
   *
   * 注入而不是在内部 new 一个：有效期域还要被视图在弹窗打开时调用，两个域共用一份
   * `legalCertOcrLoading`，否则「上传后识别」与「重开弹窗补识别」会各转各的圈。
   */
  autoFillLegalCertPeriod: (settings?: { silent?: boolean }) => Promise<void>
}

const MAX_CONSENT_FILE_SIZE = 5 * 1024 * 1024
/** 营业执照 / 同意书：图片或 PDF。法人身份证两面只收图片（渠道 `pictureUpload` 不认 PDF）。 */
const CONSENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf']
const LEGAL_CERT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
/** 单张 10MB 以内，与后端同一口径。 */
const MAX_LEGAL_CERT_FILE_SIZE = 10 * 1024 * 1024

/**
 * 收件校验：浏览器给的 MIME 不可靠（手机相册常给空串），**扩展名与 MIME 任一命中就算过**。
 * PDF 只对白名单里含 `pdf` 的那两处放行。
 */
function isAllowedFile(file: File, extensions: string[]): boolean {
  const dot = file.name.lastIndexOf('.')
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()
  if (ext && extensions.includes(ext)) return true
  const mime = (file.type || '').toLowerCase()
  return IMAGE_MIMES.includes(mime) || (extensions.includes('pdf') && mime === 'application/pdf')
}

/**
 * 从营业执照地址里认领渠道省市编码。
 *
 * 渠道省市表的名称是「云南省」「昭通市」这种全称，营业执照地址（"云南省昭通市彝良县…"）
 * 通常包含它们；省份名去掉「省/市/自治区」后缀再比一次，兼容「广西壮族自治区」这类写法。
 * 认不出就返回空，交给用户自己选。
 */
function matchRegionFromAddress(address: string): { prov?: string; area?: string } {
  const text = address.replace(/\s/g, '')
  if (!text) return {}
  const stripSuffix = (title: string) =>
    title.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)$/, '')
  const pickLongest = <T extends { title: string }>(items: T[]) =>
    [...items]
      .filter((item) => text.includes(item.title) || text.includes(stripSuffix(item.title)))
      .sort((a, b) => b.title.length - a.title.length)[0]
  const province = pickLongest(settlementProvinces)
  if (!province) return {}
  const city = pickLongest(province.cities ?? [])
  return { prov: province.value, area: city?.value }
}

export function useRealnameMaterials(options: RealnameMaterialsOptions) {
  const auth = useAuthStore()
  const { form } = options

  const consentUploading = ref(false)
  const businessLicenseUploading = ref(false)
  /** 营业执照 OCR 进行中（辅助填写，不挡提交）。 */
  const businessLicenseOcrLoading = ref(false)
  /** 法人身份证人像面 / 国徽面：企业开户进件三张证照里的另外两张（上传即落库）。 */
  const legalCertFrontUploading = ref(false)
  const legalCertBackUploading = ref(false)

  /** 登录态守卫：四个上传口共用一段提示，抽出来免得四份文案各自漂移。 */
  function ensureToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  /**
   * 用营业执照 OCR 结果回填企业信息（**辅助填写**，失败只提示、不阻断）。
   *
   * 只回填它能确定的几项：企业名称、统一社会信用代码、注册地址、
   * 经营范围、营业执照有效期；法人姓名表单里没有这个输入项，不回填。
   * 其中注册地址、经营范围、执照有效期（以及由注册地址映射出的企业所在省市）**不再在表单里展示**，
   * 所以识别不出来时用户没法手填，只能重传；成功时靠表单下方的识别结果摘要供用户核对。
   */
  async function autoFillFromBusinessLicense(businessLicenseFile: string) {
    if (!businessLicenseFile.trim()) return
    businessLicenseOcrLoading.value = true
    try {
      const ocr = await ocrBusinessLicense(auth.token, businessLicenseFile)
      let filled = 0
      const apply = (value: string | null, assign: (next: string) => void) => {
        if (value && value.trim()) {
          assign(value.trim())
          filled += 1
        }
      }
      apply(ocr.company_name, (next) => (form.companyName = next))
      apply(ocr.unified_social_credit_code, (next) => (form.unifiedSocialCreditCode = next))
      let truncated = false
      const clip = (value: string, max: number) => {
        if (value.length <= max) return value
        truncated = true
        return value.slice(0, max)
      }
      apply(
        ocr.company_address,
        (next) => (form.companyAddress = clip(next, MAX_COMPANY_ADDRESS_LEN)),
      )
      apply(ocr.business_scope, (next) => (form.businessScope = clip(next, MAX_BUSINESS_SCOPE_LEN)))
      apply(ocr.business_license_expires_on, (next) => (form.businessLicenseExpiresOn = next))
      // 地址拿到了就把「企业所在省市」按渠道省市表认领填好（认不出则留给用户选）
      const region = matchRegionFromAddress(form.companyAddress)
      if (region.prov) {
        form.companyProvCode = region.prov
        form.companyAreaCode = region.area ?? ''
      }
      // 「未认出所在省市」不在这里提醒：表单下方那条识别结果摘要会一直挂着它，提交也会被拦。
      const notes = [
        truncated ? `经营范围超过 ${MAX_BUSINESS_SCOPE_LEN} 字，已按渠道上限截断` : '',
      ].filter(Boolean)
      if (filled > 0) {
        const message = `已按营业执照自动填入企业信息${notes.length ? `（${notes.join('；')}）` : ''}`
        if (truncated) {
          TMessage.warning(message)
        } else {
          TMessage.success(message)
        }
      } else {
        TMessage.warning('营业执照未识别出可用信息，请重新上传更清晰的照片')
      }
    } catch (err) {
      TMessage.warning(
        err instanceof Error ? err.message : '营业执照识别失败，请重新上传更清晰的照片',
      )
    } finally {
      businessLicenseOcrLoading.value = false
    }
  }

  /**
   * 营业执照：先上传、写回文件名，**再** OCR 回填企业信息。
   *
   * 两步的顺序不能换：OCR 的入参就是上一步返回的 `business_license_file`。
   * 识别失败不影响上传结果（`autoFillFromBusinessLicense` 自己吞掉异常）。
   */
  async function handleBusinessLicenseFile(file: File) {
    if (!isAllowedFile(file, CONSENT_EXTENSIONS)) {
      TMessage.warning('营业执照仅支持 PNG、JPG、WEBP 图片或 PDF 文件')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      TMessage.warning('营业执照文件不能超过 10MB')
      return
    }
    if (!ensureToken()) return
    businessLicenseUploading.value = true
    try {
      const result = await uploadBusinessLicenseFile(auth.token, file)
      form.businessLicenseFile = result.business_license_file
      TMessage.success('营业执照已上传')
      // 上传成功后顺手让后端 OCR 识别一次，把企业信息回填；失败不影响上传结果。
      await autoFillFromBusinessLicense(result.business_license_file)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传营业执照失败')
    } finally {
      businessLicenseUploading.value = false
    }
  }

  /**
   * 法人身份证**人像面**：后端上传即落库，所以只记文件名供界面回显，不进提交实名的 payload。
   *
   * 上传成功后 `void` 掉有效期识别（不 `await`）：识别是辅助填写，不该把上传按钮多转一圈。
   * 时序仍与拆分前一致——先写 `form.legalCertFrontFile`，识别才开始按 side 取已经落库的照片。
   */
  async function handleLegalCertFrontFile(file: File) {
    if (!isAllowedFile(file, LEGAL_CERT_EXTENSIONS)) {
      TMessage.warning('法人身份证人像面仅支持 PNG、JPG、WEBP 图片')
      return
    }
    if (file.size > MAX_LEGAL_CERT_FILE_SIZE) {
      TMessage.warning('法人身份证人像面文件不能超过 10MB')
      return
    }
    if (!ensureToken()) return
    legalCertFrontUploading.value = true
    try {
      const result = await uploadLegalCertFrontFile(auth.token, file)
      form.legalCertFrontFile = result.front_file
      TMessage.success('法人身份证人像面已上传')
      // 上传成功后顺手识别证件有效期并回填；识别失败静默降级，不挡提交。
      void options.autoFillLegalCertPeriod()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传法人身份证人像面失败')
    } finally {
      legalCertFrontUploading.value = false
    }
  }

  /** 法人身份证**国徽面**：与上面同一套处理（有效期一般印在这一面，所以同样触发识别）。 */
  async function handleLegalCertBackFile(file: File) {
    if (!isAllowedFile(file, LEGAL_CERT_EXTENSIONS)) {
      TMessage.warning('法人身份证国徽面仅支持 PNG、JPG、WEBP 图片')
      return
    }
    if (file.size > MAX_LEGAL_CERT_FILE_SIZE) {
      TMessage.warning('法人身份证国徽面文件不能超过 10MB')
      return
    }
    if (!ensureToken()) return
    legalCertBackUploading.value = true
    try {
      const result = await uploadLegalCertBackFile(auth.token, file)
      form.legalCertBackFile = result.back_file
      TMessage.success('法人身份证国徽面已上传')
      // 同上：有效期一般印在国徽面，上传这一面后立刻识别一次。
      void options.autoFillLegalCertPeriod()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传法人身份证国徽面失败')
    } finally {
      legalCertBackUploading.value = false
    }
  }

  /** 监护人同意书（只给 14~18 周岁的未成年人）：图片或 PDF，5MB 以内。 */
  async function handleConsentFile(file: File) {
    if (!isAllowedFile(file, CONSENT_EXTENSIONS)) {
      TMessage.warning('同意书仅支持 PNG、JPG、WEBP 图片或 PDF 文件')
      return
    }
    if (file.size > MAX_CONSENT_FILE_SIZE) {
      TMessage.warning('同意书文件不能超过 5MB')
      return
    }
    if (!ensureToken()) return

    consentUploading.value = true
    try {
      const result = await uploadGuardianConsentFile(auth.token, file)
      form.guardianConsentFile = result.guardian_consent_file
      TMessage.success('监护人同意书已上传')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '上传监护人同意书失败')
    } finally {
      consentUploading.value = false
    }
  }

  return {
    consentUploading,
    businessLicenseUploading,
    businessLicenseOcrLoading,
    legalCertFrontUploading,
    legalCertBackUploading,
    handleBusinessLicenseFile,
    handleLegalCertFrontFile,
    handleLegalCertBackFile,
    handleConsentFile,
  }
}
