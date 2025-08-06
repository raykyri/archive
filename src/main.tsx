import "./style.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { unzip } from "unzipit"
import React, { useState, useCallback, useEffect, useRef } from "react"
import { formatFileSize, isBinary } from "./helpers"
import { VirtualizedTextViewer } from "./VirtualizedTextViewer"
import { archiveCache } from "./indexedDbCache"

// Set initial theme based on system preference
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark")
}

interface FileEntry {
  path: string
  entry: any
  size: number
}

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: TreeNode[]
  fileEntry?: FileEntry
}

function buildDirectoryTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const nodeMap = new Map<string, TreeNode>()

  for (const fileEntry of files) {
    const parts = fileEntry.path.split("/")
    let currentPath = ""
    let currentNodes = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      currentPath = currentPath ? `${currentPath}/${part}` : part

      let node = nodeMap.get(currentPath)
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          children: [],
          fileEntry: isLast ? fileEntry : undefined,
        }
        nodeMap.set(currentPath, node)
        currentNodes.push(node)
      }

      if (!isLast) {
        currentNodes = node.children
      }
    }
  }

  // Sort directories before files at each level
  function sortNodes(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

    for (const node of nodes) {
      if (node.isDirectory) {
        sortNodes(node.children)
      }
    }
  }

  sortNodes(root)
  return root
}

function getVisibleFiles(nodes: TreeNode[], expandedDirs: Set<string>, result: FileEntry[] = []): FileEntry[] {
  for (const node of nodes) {
    if (!node.isDirectory && node.fileEntry) {
      result.push(node.fileEntry)
    } else if (node.isDirectory && expandedDirs.has(node.path)) {
      getVisibleFiles(node.children, expandedDirs, result)
    }
  }
  return result
}

interface DirectoryNodeProps extends DirectoryNodeWrapperProps {
  fileIndex?: number
}

function DirectoryNode({ node, onFileClick, level, selectedFilePath, expandedDirs, setExpandedDirs, focusedFileIndex, fileIndex, visibleFiles }: DirectoryNodeProps) {
  const isExpanded = expandedDirs.has(node.path)
  const indent = level * 12

  if (!node.isDirectory) {
    const fileSize = node.fileEntry ? formatFileSize(node.fileEntry.size) : ""
    const isSelected = selectedFilePath === node.path
    const isFocused = fileIndex === focusedFileIndex
    return (
      <button
        onClick={() => node.fileEntry && onFileClick(node.fileEntry)}
        className={`block w-full text-left px-2 py-1 rounded text-sm flex justify-between items-center ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
            : isFocused
            ? 'bg-gray-100 dark:bg-gray-800'
            : 'hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        tabIndex={isFocused ? 0 : -1}
        ref={(ref) => {
          if (isFocused && ref) {
            ref.focus()
          }
        }}
      >
        <span className="truncate">📄&nbsp;{node.name}</span>
        <span className="text-gray-500 dark:text-gray-400 text-xs ml-2 whitespace-nowrap">
          {fileSize}
        </span>
      </button>
    )
  }

  const toggleExpand = () => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev)
      if (isExpanded) {
        newSet.delete(node.path)
      } else {
        newSet.add(node.path)
      }
      return newSet
    })
  }

  return (
    <div>
      <button
        onClick={toggleExpand}
        className="block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm font-medium"
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {isExpanded ? "📂" : "📁"}&nbsp;{node.name}
      </button>
      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <DirectoryNodeWrapper
              key={child.path}
              node={child}
              onFileClick={onFileClick}
              level={level + 1}
              selectedFilePath={selectedFilePath}
              expandedDirs={expandedDirs}
              setExpandedDirs={setExpandedDirs}
              focusedFileIndex={focusedFileIndex}
              visibleFiles={visibleFiles}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface DirectoryNodeWrapperProps {
  node: TreeNode
  onFileClick: (fileEntry: FileEntry) => void
  level: number
  selectedFilePath: string
  expandedDirs: Set<string>
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>
  focusedFileIndex: number
  visibleFiles: FileEntry[]
}

function DirectoryNodeWrapper(props: DirectoryNodeWrapperProps) {
  const { node, visibleFiles } = props
  const fileIndex = node.fileEntry ? visibleFiles.findIndex(f => f.path === node.path) : undefined
  
  return (
    <DirectoryNode
      {...props}
      fileIndex={fileIndex}
    />
  )
}

function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [directoryTree, setDirectoryTree] = useState<TreeNode[]>([])
  const [content, setContent] = useState<string>("")
  const [currentView, setCurrentView] = useState<'about' | 'file'>('about')
  const [selectedFilePath, setSelectedFilePath] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const hasInitialized = useRef(false)
  const [focusedFileIndex, setFocusedFileIndex] = useState<number>(-1)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["data"]))

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const initializeApp = async () => {
      await archiveCache.init()

      // Try to restore from cache on startup
      const lastArchiveKey = localStorage.getItem("lastArchiveKey")
      if (lastArchiveKey) {
        const restoreStartTime = performance.now()
        console.log("Restoring from cache...")
        const cachedFiles = await archiveCache.get(lastArchiveKey)
        if (cachedFiles) {
          const fileList: FileEntry[] = cachedFiles.map((cached) => ({
            path: cached.path,
            entry: {
              arrayBuffer: () => Promise.resolve(cached.content.buffer),
              size: cached.size,
              isDirectory: false,
            },
            size: cached.size,
          }))

          setFiles(fileList)
          setDirectoryTree(buildDirectoryTree(fileList))
          setCurrentView('about')

          const restoreDuration = performance.now() - restoreStartTime
          console.log(
            `Total cache restoration took ${restoreDuration.toFixed(2)}ms`,
          )
        }
      }
    }

    initializeApp().catch(console.error)
  }, [])

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle("dark")
  }, [])

  const clearArchive = useCallback(() => {
    setFiles([])
    setDirectoryTree([])
    setContent("")
    setSelectedFilePath("")
    setCurrentView('about')
    localStorage.removeItem("lastArchiveKey")

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    if (fileInput) {
      fileInput.value = ""
    }
  }, [])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Clear previous archive state first
      setFiles([])
      setDirectoryTree([])
      setContent("")
      localStorage.removeItem("lastArchiveKey")

      setIsLoading(true)
      console.log(`Uploaded file size: ${(file.size / 1024).toFixed(2)} KB`)

      try {
        const cacheKey = await archiveCache.generateKey(file)
        const cachedFiles = await archiveCache.get(cacheKey)

        let fileList: FileEntry[]

        if (cachedFiles) {
          console.log("Loading from cache...")
          fileList = cachedFiles.map((cached) => ({
            path: cached.path,
            entry: {
              arrayBuffer: () => Promise.resolve(cached.content.buffer),
              size: cached.size,
              isDirectory: false,
            },
            size: cached.size,
          }))
        } else {
          console.log("Unzipping and caching...")
          const unzipStartTime = performance.now()
          const { entries } = await unzip(file)
          const unzipDuration = performance.now() - unzipStartTime
          console.log(`Zip unpacking took ${unzipDuration.toFixed(2)}ms`)

          const filesToCache: Array<{
            path: string
            content: Uint8Array
            size: number
          }> = []
          fileList = []

          const processStartTime = performance.now()
          for (const [path, entry] of Object.entries(entries)) {
            if (!entry.isDirectory) {
              const content = new Uint8Array(await entry.arrayBuffer())
              filesToCache.push({ path, content, size: entry.size })
              fileList.push({ path, entry, size: entry.size })
            }
          }
          const processDuration = performance.now() - processStartTime
          console.log(
            `File processing took ${processDuration.toFixed(2)}ms for ${fileList.length} files`,
          )

          const saveStartTime = performance.now()
          await archiveCache.save(cacheKey, filesToCache)
          const saveDuration = performance.now() - saveStartTime
          console.log(`Total save operation took ${saveDuration.toFixed(2)}ms`)
        }

        // Save the current archive key for restoration
        localStorage.setItem("lastArchiveKey", cacheKey)

        const treeStartTime = performance.now()
        const tree = buildDirectoryTree(fileList)
        const treeDuration = performance.now() - treeStartTime
        console.log(`Directory tree building took ${treeDuration.toFixed(2)}ms`)

        setFiles(fileList)
        setDirectoryTree(tree)
        setContent("")
        setCurrentView('about')
      } catch (error) {
        console.error("Error loading archive:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const visibleFiles = getVisibleFiles(directoryTree, expandedDirs)

  const handleFileClick = useCallback(async (fileEntry: FileEntry) => {
    const uint8 = await fileEntry.entry.arrayBuffer()
    const data = new Uint8Array(uint8)
    if (isBinary(data)) {
      setContent(`Binary file: ${fileEntry.path}`)
    } else {
      setContent(new TextDecoder().decode(data))
    }
    setSelectedFilePath(fileEntry.path)
    setCurrentView('file')
    
    // Set focused index to the clicked file
    const fileIndex = visibleFiles.findIndex(f => f.path === fileEntry.path)
    if (fileIndex >= 0) {
      setFocusedFileIndex(fileIndex)
    }
  }, [visibleFiles])

  const showAbout = useCallback(() => {
    setSelectedFilePath("")
    setCurrentView('about')
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (visibleFiles.length === 0) return
    
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedFileIndex(prev => {
        if (prev === -1) return 0
        const nextIndex = prev + 1
        return nextIndex < visibleFiles.length ? nextIndex : prev
      })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedFileIndex(prev => {
        if (prev === -1) return 0
        const nextIndex = prev - 1
        return nextIndex >= 0 ? nextIndex : prev
      })
    } else if (event.key === 'Enter' && focusedFileIndex >= 0) {
      event.preventDefault()
      const fileEntry = visibleFiles[focusedFileIndex]
      if (fileEntry) {
        handleFileClick(fileEntry)
      }
    }
  }, [visibleFiles, focusedFileIndex, handleFileClick])

  useEffect(() => {
    if (focusedFileIndex >= visibleFiles.length) {
      setFocusedFileIndex(visibleFiles.length > 0 ? visibleFiles.length - 1 : -1)
    }
  }, [visibleFiles.length, focusedFileIndex])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  const AboutPage = () => (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Archive Summary</h1>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2">Account Info</h3>
            <div className="space-y-1 text-sm">
              <div>Handle: @placeholder_user</div>
              <div>Archive Date: Jan 15, 2024</div>
              <div>Archive Size: 125.3 MB</div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2">Content</h3>
            <div className="space-y-1 text-sm">
              <div>Tweets: 2,847</div>
              <div>Direct Messages: 156</div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2">Privacy & Security</h3>
            <div className="space-y-1 text-sm">
              <div>Blocked Users: 23</div>
              <div>Muted Users: 87</div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2">Connected Apps</h3>
            <div className="space-y-1 text-sm">
              <div>Authorized Apps: 12</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="w-64 min-w-64 border-r border-gray-200 dark:border-gray-700 p-2 overflow-y-auto flex-shrink-0">
        {files.length > 0 && (
          <div className="mb-4">
            <button
              onClick={showAbout}
              className={`block w-full text-left px-2 py-1 rounded text-sm font-medium ${
                currentView === 'about'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              📊 About
            </button>
          </div>
        )}
        {directoryTree.map((node) => (
          <DirectoryNodeWrapper
            key={node.path}
            node={node}
            onFileClick={handleFileClick}
            level={0}
            selectedFilePath={selectedFilePath}
            expandedDirs={expandedDirs}
            setExpandedDirs={setExpandedDirs}
            focusedFileIndex={focusedFileIndex}
            visibleFiles={visibleFiles}
          />
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileUpload}
              className="text-sm"
              disabled={isLoading}
            />
            {isLoading && (
              <span className="text-sm text-gray-500">Loading...</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <button
                onClick={clearArchive}
                className="px-2 py-1 border rounded text-sm"
              >
                Clear
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="px-2 py-1 border rounded text-sm"
            >
              Toggle
            </button>
          </div>
        </div>
        {currentView === 'about' ? <AboutPage /> : <VirtualizedTextViewer content={content} />}
      </div>
    </>
  )
}

const app = document.getElementById("app")!
const root = createRoot(app)
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
