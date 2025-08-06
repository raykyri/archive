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

interface DirectoryNodeProps {
  node: TreeNode
  onFileClick: (fileEntry: FileEntry) => void
  level: number
}

function DirectoryNode({ node, onFileClick, level }: DirectoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState(node.name === "data")
  const indent = level * 12

  if (!node.isDirectory) {
    const fileSize = node.fileEntry ? formatFileSize(node.fileEntry.size) : ""
    return (
      <button
        onClick={() => node.fileEntry && onFileClick(node.fileEntry)}
        className="block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm flex justify-between items-center"
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        <span className="truncate">📄&nbsp;{node.name}</span>
        <span className="text-gray-500 dark:text-gray-400 text-xs ml-2 whitespace-nowrap">
          {fileSize}
        </span>
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm font-medium"
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {isExpanded ? "📂" : "📁"}&nbsp;{node.name}
      </button>
      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <DirectoryNode
              key={child.path}
              node={child}
              onFileClick={onFileClick}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [directoryTree, setDirectoryTree] = useState<TreeNode[]>([])
  const [content, setContent] = useState<string>("")
  const [currentView, setCurrentView] = useState<'about' | 'file'>('about')
  const [isLoading, setIsLoading] = useState(false)
  const hasInitialized = useRef(false)

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

  const handleFileClick = useCallback(async (fileEntry: FileEntry) => {
    const uint8 = await fileEntry.entry.arrayBuffer()
    const data = new Uint8Array(uint8)
    if (isBinary(data)) {
      setContent(`Binary file: ${fileEntry.path}`)
    } else {
      setContent(new TextDecoder().decode(data))
    }
    setCurrentView('file')
  }, [])

  const showAbout = useCallback(() => {
    setCurrentView('about')
  }, [])

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
          <DirectoryNode
            key={node.path}
            node={node}
            onFileClick={handleFileClick}
            level={0}
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
