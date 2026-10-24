export function parseCnyToFen(value: string | number): number | null {
  const normalized = String(value).trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [yuan = '', fraction = ''] = unsigned.split('.')
  const fen = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(fen)) {
    return null
  }

  return negative ? -fen : fen
}

export function formatFenAsCny(value: number | null | undefined): string {
  const fen = value ?? 0
  if (!Number.isSafeInteger(fen)) {
    return '0.00'
  }

  const negative = fen < 0
  const absolute = Math.abs(fen)
  return `${negative ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}
