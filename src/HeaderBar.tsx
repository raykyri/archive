import React from "react"

interface HeaderBarProps {
  files: any[]
  onClearArchive: () => void
  onToggleTheme: () => void
  isDarkMode: boolean
}

export function HeaderBar({ files, onClearArchive, onToggleTheme, isDarkMode }: HeaderBarProps) {
  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-end">
      <div className="flex items-center gap-2">
        {files.length > 0 && (
          <button
            onClick={onClearArchive}
            className="px-2 py-1 border rounded text-sm"
          >
            Clear
          </button>
        )}
        <button
          onClick={onToggleTheme}
          className="px-2 py-1 border rounded text-sm"
          title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? "☀️" : "🌙"}
        </button>
      </div>
    </div>
  )
}