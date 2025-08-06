import React, { useCallback, useState } from "react"

interface FileUploadProps {
  onFileSelect: (file: File) => Promise<void>
  isLoading: boolean
  disabled?: boolean
}

export function FileUpload({ onFileSelect, isLoading, disabled }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      const item = event.dataTransfer.items[0]
      if (item.kind === 'file' && item.type === 'application/zip') {
        setIsDragOver(true)
      }
    }
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)

    const files = event.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        await onFileSelect(file)
      }
    }
  }, [onFileSelect])

  return (
    <div 
      className={`flex items-center gap-2 p-4 border-2 border-dashed rounded-lg transition-colors duration-200 ${
        isDragOver 
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver ? (
        <div className="text-blue-600 dark:text-blue-400 font-medium text-center w-full">
          📦 Drop ZIP file here
        </div>
      ) : (
        <div className="flex items-center gap-2 w-full">
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="text-sm"
            disabled={isLoading || disabled}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            or drag ZIP file here
          </span>
          {isLoading && (
            <span className="text-sm text-gray-500">Loading...</span>
          )}
        </div>
      )}
    </div>
  )
}