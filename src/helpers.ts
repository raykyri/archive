export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${sizes[i]}`
}

export function splitTextIntoBlocks(
  text: string,
  linesPerBlock: number = 100,
): string[] {
  const lines = text.split("\n")
  const blocks: string[] = []

  for (let i = 0; i < lines.length; i += linesPerBlock) {
    const blockLines = lines.slice(i, i + linesPerBlock)
    blocks.push(blockLines.join("\n"))
  }

  return blocks
}

export function isBinary(data: Uint8Array): boolean {
  const len = Math.min(data.length, 1000)
  for (let i = 0; i < len; i++) {
    const byte = data[i]
    if (byte === 0 || byte < 7 || (byte > 13 && byte < 32)) {
      return true
    }
  }
  return false
}
