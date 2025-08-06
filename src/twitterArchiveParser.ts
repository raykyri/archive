/**
 * Parses Twitter archive JavaScript files that assign data to window.YTD
 * @param content The raw file content as a string
 * @returns Parsed JSON data or null if parsing fails
 */
export function parseTwitterArchiveFile(content: string): any[] | null {
  try {
    const lines = content.split('\n')
    
    // Find the first line that starts with window.YTD assignment
    let startIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().match(/^window\.YTD\.\w+\.part\d+\s*=\s*\[/)) {
        startIndex = i
        break
      }
    }
    
    if (startIndex === -1) {
      return null
    }
    
    // Remove the assignment part and keep just the JSON array
    const firstLine = lines[startIndex]
    const jsonStart = firstLine.indexOf('[')
    
    if (jsonStart === -1) {
      return null
    }
    
    // Reconstruct the content starting from the opening bracket
    const jsonContent = firstLine.substring(jsonStart) + '\n' + lines.slice(startIndex + 1).join('\n')
    
    // Parse as JSON
    const data = JSON.parse(jsonContent)
    
    if (!Array.isArray(data)) {
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error parsing Twitter archive file:', error)
    return null
  }
}

/**
 * Gets the count of items in a Twitter archive file
 * @param content The raw file content
 * @returns Number of items or 0 if parsing fails
 */
export function getTwitterArchiveItemCount(content: string): number {
  const data = parseTwitterArchiveFile(content)
  return data ? data.length : 0
}

export interface TwitterAccount {
  account: {
    email: string
    createdVia: string
    username: string
    accountId: string
    createdAt: string
    accountDisplayName: string
  }
}

/**
 * Parses account.js file to extract account information
 * @param content The raw file content
 * @returns Account data or null if parsing fails
 */
export function parseTwitterAccount(content: string): TwitterAccount['account'] | null {
  const data = parseTwitterArchiveFile(content)
  if (data && data.length > 0 && data[0].account) {
    return data[0].account
  }
  return null
}