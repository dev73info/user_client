/**
 * 富文本编辑器工具栏的动作表与相关类型。
 *
 * 动作表是「按钮文本 + 动作名 + title」的纯数据，工具栏组件按它渲染一排按钮，
 * 真正执行在 `useRichTextEditorToolbar` 的 `runToolbarAction` / `runInsertAction` 里，
 * 两边共用这里的动作名联合类型，漏一个分支类型检查就会报。
 */

export type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet'
  | 'ordered'
  | 'blockquote'
  | 'code'
export type InsertAction = 'attachment' | 'image' | 'video'
export type ToolbarDropdown = 'heading' | 'insert' | 'codeLanguage'
export type NotifyType = 'success' | 'warning' | 'error'

export const toolbarActions: Array<{ label: string; action: ToolbarAction; title: string }> = [
  { label: 'B', action: 'bold', title: '加粗' },
  { label: 'I', action: 'italic', title: '斜体' },
  { label: 'U', action: 'underline', title: '下划线' },
  { label: '列表', action: 'bullet', title: '无序列表' },
  { label: '编号', action: 'ordered', title: '有序列表' },
  { label: '引用', action: 'blockquote', title: '引用' },
  { label: '</>', action: 'code', title: '代码块' },
]

export const insertOptions: Array<{ label: string; action: InsertAction }> = [
  { label: '附件', action: 'attachment' },
  { label: '图片', action: 'image' },
  { label: '视频', action: 'video' },
]
