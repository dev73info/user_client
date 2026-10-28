import { reactive, ref } from 'vue'

export function useResourceVersionDraft() {
  const versionFileInput = ref<HTMLInputElement | null>(null)
  const selectedVersionFile = ref<File | null>(null)
  const selectedVersionFileName = ref('')
  const versionForm = reactive({
    version: '',
    priceYuan: '0',
    note: '',
  })

  function clearFileSelection() {
    selectedVersionFile.value = null
    selectedVersionFileName.value = ''
    if (versionFileInput.value) {
      versionFileInput.value.value = ''
    }
  }

  function reset() {
    versionForm.version = ''
    versionForm.priceYuan = '0'
    versionForm.note = ''
    clearFileSelection()
  }

  function triggerFileSelect() {
    versionFileInput.value?.click()
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    selectedVersionFile.value = file
    selectedVersionFileName.value = file?.name ?? ''
  }

  return {
    versionFileInput,
    selectedVersionFile,
    selectedVersionFileName,
    versionForm,
    clearFileSelection,
    reset,
    triggerFileSelect,
    handleFileChange,
  }
}
