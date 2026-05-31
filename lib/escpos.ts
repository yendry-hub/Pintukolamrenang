const ESC = 0x1B
const GS = 0x1D
const LF = 0x0A

function cmd(...bytes: number[]): number[] {
  return bytes
}

interface EscPosOptions {
  charPerLine?: number
  lineSpacing?: number
}

function chunkText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) {
      lines.push(rawLine)
    } else {
      let remaining = rawLine
      while (remaining.length > 0) {
        lines.push(remaining.slice(0, maxChars))
        remaining = remaining.slice(maxChars)
      }
    }
  }
  return lines
}

function centerLine(text: string, maxChars: number): string {
  const pad = Math.max(0, maxChars - text.length)
  const leftPad = Math.floor(pad / 2)
  return ' '.repeat(leftPad) + text
}

export function receiptToEscPos(receipt: string, options?: EscPosOptions): number[] {
  const maxChars = options?.charPerLine ?? 32
  const out: number[] = []

  out.push(...cmd(ESC, 0x40))
  out.push(...cmd(ESC, 0x61, 0x00))
  out.push(...cmd(ESC, 0x32))
  out.push(...cmd(ESC, 0x74, 0x0B))
  out.push(...cmd(GS, 0x21, 0x00))

  const lines = chunkText(receipt, maxChars)

  for (const line of lines) {
    if (line.startsWith('\t\t\t')) {
      out.push(...cmd(ESC, 0x61, 0x01))
      const content = centerLine(line.replace(/\t/g, ''), maxChars)
      for (const ch of content) {
        out.push(ch.charCodeAt(0))
      }
      out.push(LF)
      out.push(...cmd(ESC, 0x61, 0x00))
    } else if (line.startsWith('\t')) {
      const content = line.replace(/\t/g, '')
      out.push(...cmd(ESC, 0x61, 0x01))
      for (const ch of content) {
        out.push(ch.charCodeAt(0))
      }
      out.push(LF)
      out.push(...cmd(ESC, 0x61, 0x00))
    } else if (line.startsWith('=') || line.startsWith('-')) {
      for (const ch of line) {
        out.push(ch.charCodeAt(0))
      }
      out.push(LF)
    } else {
      for (const ch of line) {
        out.push(ch.charCodeAt(0))
      }
      out.push(LF)
    }
  }

  out.push(LF, LF, LF)
  out.push(...cmd(GS, 0x56, 0x00))

  return out
}
