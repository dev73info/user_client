/**
 * 富文本编辑器的标题与字号档位。
 *
 * 标题级别的声明同时被两处用到：`FontSize` 之外的 `StarterKit` 配置（允许哪几级标题）
 * 与工具栏的下拉选项。字号上下限则同时约束工具栏输入框的 `min` / `max`
 * 与 `normalizeFontSizeValue` 的夹取范围，放一起才不会一边改了另一边没跟上。
 */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5
export type HeadingOptionValue = '' | HeadingLevel

export const headingLevels: HeadingLevel[] = [1, 2, 3, 4, 5]

export const headingOptions: Array<{ label: string; value: HeadingOptionValue }> = [
  { label: '正文', value: '' },
  ...headingLevels.map((level) => ({ label: `H${level}`, value: level })),
]

export const fontSizeMin = 12
export const fontSizeMax = 48

/** 把任意输入收敛成 [fontSizeMin, fontSizeMax] 内的整数字号，认不出就返回 null。 */
export function normalizeFontSizeValue(value: unknown): number | null {
  const normalizedValue = String(value ?? '').trim()
  const parsed =
    typeof value === 'number'
      ? value
      : normalizedValue.match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
        ? Number.parseFloat(normalizedValue)
        : Number.NaN
  if (!Number.isFinite(parsed)) {
    return null
  }
  return Math.min(fontSizeMax, Math.max(fontSizeMin, Math.round(parsed)))
}
