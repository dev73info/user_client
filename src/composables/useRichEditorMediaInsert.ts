import {
  isRichEditorLinkUrl,
  isRichEditorMediaUrl,
  normalizeRichEditorUrl,
  richEditorDefaultLabel,
} from '@/utils/richEditorMedia'
import type { InsertAction, NotifyType } from '@/utils/richEditorToolbarOptions'

/**
 * 工具栏「插入」下拉的三条流程：附件 / 图片 / 视频。
 *
 * 每条都先用单行输入弹窗问地址，校验通过后再问名称 / 说明，最后调编辑器暴露的
 * `insertImage` 等方法真正插进去——那两个方法同时也是编辑器对外的能力，
 * 所以由调用方传进来，这里不自己碰 tiptap 节点。问法与文案从
 * `RichTextEditor.vue` 原样搬来。
 */
export function useRichEditorMediaInsert(options: {
  promptValue: (message: string, title: string, defaultValue?: string) => Promise<string | null>
  notify: (message: string, type?: NotifyType) => void
  insertImage: (src: string, alt?: string) => void
  insertVideo: (src: string, title?: string) => void
  insertAttachment: (href: string, label?: string) => void
  /** 选中某个插入项后先收起下拉，与原来的顺序一致（先收下拉再弹窗）。 */
  closeDropdown: () => void
}) {
  const { promptValue, notify } = options

  async function promptInsertImage() {
    const raw = await promptValue('输入图片地址，支持 https:// 或 /uploads/...', '插入图片')
    if (raw === null) {
      return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
      notify('请输入有效的图片地址', 'warning')
      return
    }

    const alt =
      (await promptValue('图片说明（可选）', '图片说明', richEditorDefaultLabel(src, '图片'))) ?? ''
    options.insertImage(src, alt.trim())
  }

  async function promptInsertVideo() {
    const raw = await promptValue('输入视频地址，支持 https:// 或 /uploads/...', '插入视频')
    if (raw === null) {
      return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
      notify('请输入有效的视频地址', 'warning')
      return
    }

    const title =
      (await promptValue('视频标题（可选）', '视频标题', richEditorDefaultLabel(src, '视频'))) ?? ''
    options.insertVideo(src, title.trim())
  }

  async function promptInsertAttachment() {
    const raw = await promptValue(
      '输入附件地址，支持 https://、mailto:、tel: 或 /uploads/...',
      '插入附件',
    )
    if (raw === null) {
      return
    }

    const href = normalizeRichEditorUrl(raw)
    if (!isRichEditorLinkUrl(href)) {
      notify('请输入有效的附件地址', 'warning')
      return
    }

    const label =
      (await promptValue('附件名称', '附件名称', richEditorDefaultLabel(href, '附件'))) ?? ''
    options.insertAttachment(href, label.trim())
  }

  function runInsertAction(action: InsertAction) {
    options.closeDropdown()
    switch (action) {
      case 'attachment':
        promptInsertAttachment()
        return
      case 'image':
        promptInsertImage()
        return
      case 'video':
        promptInsertVideo()
        return
    }
  }

  return { runInsertAction }
}
