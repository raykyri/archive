import "./style.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { unzip } from "unzipit"
import JSZip from "jszip"
import React, { useState, useCallback, useEffect, useRef } from "react"
import { formatFileSize, isBinary } from "./helpers"
import { VirtualizedTextViewer } from "./VirtualizedTextViewer"
import { HeaderBar } from "./HeaderBar"
import { FileUpload } from "./FileUpload"
import { archiveCache } from "./indexedDbCache"
import {
  getTwitterArchiveItemCount,
  parseTwitterAccount,
} from "./twitterArchiveParser"

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

function getVisibleFiles(
  nodes: TreeNode[],
  expandedDirs: Set<string>,
  result: FileEntry[] = [],
): FileEntry[] {
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

function DirectoryNode({
  node,
  onFileClick,
  level,
  selectedFilePath,
  expandedDirs,
  setExpandedDirs,
  focusedFileIndex,
  fileIndex,
  visibleFiles,
}: DirectoryNodeProps) {
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
            ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
            : isFocused
              ? "bg-gray-100 dark:bg-gray-800"
              : "hover:bg-gray-200 dark:hover:bg-gray-700"
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
    setExpandedDirs((prev) => {
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
  const fileIndex = node.fileEntry
    ? visibleFiles.findIndex((f) => f.path === node.path)
    : undefined

  return <DirectoryNode {...props} fileIndex={fileIndex} />
}

function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [directoryTree, setDirectoryTree] = useState<TreeNode[]>([])
  const [content, setContent] = useState<string>("")
  const [currentView, setCurrentView] = useState<"about" | "file">("about")
  const [selectedFilePath, setSelectedFilePath] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const hasInitialized = useRef(false)
  const [focusedFileIndex, setFocusedFileIndex] = useState<number>(-1)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["data"]),
  )
  const directoryListRef = useRef<HTMLDivElement>(null)
  const [twitterCounts, setTwitterCounts] = useState<Record<string, number>>({})
  const [accountInfo, setAccountInfo] = useState<{
    email: string
    createdVia: string
    username: string
    accountId: string
    createdAt: string
    accountDisplayName: string
  } | null>(null)
  const [pendingHashRestore, setPendingHashRestore] = useState<string | null>(
    null,
  )
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  )

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    // Capture initial hash before any navigation
    const initialHash = window.location.hash.slice(1)
    if (initialHash) {
      setPendingHashRestore(decodeURIComponent(initialHash))
    }

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
          setCurrentView("about")

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
    setIsDarkMode(document.documentElement.classList.contains("dark"))
  }, [])

  const clearArchive = useCallback(() => {
    setFiles([])
    setDirectoryTree([])
    setContent("")
    setSelectedFilePath("")
    setCurrentView("about")
    setPendingHashRestore(null)
    localStorage.removeItem("lastArchiveKey")

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    if (fileInput) {
      fileInput.value = ""
    }
  }, [])

  const exportCoreData = useCallback(async () => {
    const coreFiles = [
      "data/tweets.js",
      "data/like.js",
      "data/follower.js",
      "data/following.js",
      "data/account.js",
      "data/README.txt",
      "data/profile.js",
      "data/note-tweet.js",
      "data/community-tweet.js",
    ]

    const zip = new JSZip()
    const dataFolder = zip.folder("data")

    for (const filePath of coreFiles) {
      const file = files.find((f) => f.path === filePath)
      if (file) {
        try {
          const uint8 = await file.entry.arrayBuffer()
          const content = new Uint8Array(uint8)
          dataFolder?.file(filePath.replace("data/", ""), content)
        } catch (error) {
          console.error(`Error reading ${filePath}:`, error)
        }
      }
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = "twitter-core-data.zip"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error creating zip file:", error)
    }
  }, [files])

  const processFile = useCallback(async (file: File) => {
    // Clear previous archive state first
    setFiles([])
    setDirectoryTree([])
    setContent("")
    setPendingHashRestore(null)
    localStorage.removeItem("lastArchiveKey")

    setIsLoading(true)
    console.log(`File size: ${(file.size / 1024).toFixed(2)} KB`)

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
      setCurrentView("about")
    } catch (error) {
      console.error("Error loading archive:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const visibleFiles = getVisibleFiles(directoryTree, expandedDirs)

  const handleFileClick = useCallback(
    async (fileEntry: FileEntry) => {
      const uint8 = await fileEntry.entry.arrayBuffer()
      const data = new Uint8Array(uint8)
      if (isBinary(data)) {
        setContent(`Binary file: ${fileEntry.path}`)
      } else {
        setContent(new TextDecoder().decode(data))
      }
      setSelectedFilePath(fileEntry.path)
      setCurrentView("file")

      // Set focused index to the clicked file
      const fileIndex = visibleFiles.findIndex((f) => f.path === fileEntry.path)
      if (fileIndex >= 0) {
        setFocusedFileIndex(fileIndex)
      }
    },
    [visibleFiles],
  )

  const showAbout = useCallback(() => {
    setSelectedFilePath("")
    setCurrentView("about")
  }, [])

  const openFile = useCallback(
    (filePath: string) => {
      const fileEntry = files.find((f) => f.path === filePath)
      if (fileEntry) {
        handleFileClick(fileEntry)
      }
    },
    [files, handleFileClick],
  )

  // Parse Twitter archive files to get counts and account info
  const parseTwitterArchiveData = useCallback(async () => {
    const twitterFiles = [
      "data/like.js",
      "data/tweets.js",
      "data/mute.js",
      "data/block.js",
      "data/direct-messages.js",
      "data/follower.js",
      "data/following.js",
    ]

    const counts: Record<string, number> = {}

    for (const filePath of twitterFiles) {
      const file = files.find((f) => f.path === filePath)
      if (file) {
        try {
          const uint8 = await file.entry.arrayBuffer()
          const content = new TextDecoder().decode(new Uint8Array(uint8))
          const count = getTwitterArchiveItemCount(content)
          counts[filePath] = count
        } catch (error) {
          console.error(`Error parsing ${filePath}:`, error)
          counts[filePath] = 0
        }
      }
    }

    setTwitterCounts(counts)

    // Parse account.js for account information
    const accountFile = files.find((f) => f.path === "data/account.js")
    if (accountFile) {
      try {
        const uint8 = await accountFile.entry.arrayBuffer()
        const content = new TextDecoder().decode(new Uint8Array(uint8))
        const account = parseTwitterAccount(content)
        setAccountInfo(account)
      } catch (error) {
        console.error("Error parsing account.js:", error)
        setAccountInfo(null)
      }
    }
  }, [files])

  // Parse Twitter data when files change
  useEffect(() => {
    if (files.length > 0) {
      parseTwitterArchiveData()
    } else {
      setTwitterCounts({})
      setAccountInfo(null)
    }
  }, [files, parseTwitterArchiveData])

  // Attempt to restore pending hash when files are loaded
  useEffect(() => {
    if (files.length > 0 && pendingHashRestore) {
      const fileEntry = files.find((f) => f.path === pendingHashRestore)
      if (fileEntry) {
        handleFileClick(fileEntry)
      }
      // Clear pending restore whether successful or not
      setPendingHashRestore(null)
    }
  }, [files, pendingHashRestore, handleFileClick])

  // Update URL hash when view changes
  useEffect(() => {
    // Don't clear hash if we're waiting to restore a pending file
    if (currentView === "about" && !pendingHashRestore) {
      window.location.hash = ""
    } else if (selectedFilePath) {
      window.location.hash = encodeURIComponent(selectedFilePath)
    }
  }, [currentView, selectedFilePath, pendingHashRestore])

  // Handle hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) // Remove #
      if (!hash) {
        showAbout()
      } else {
        const decodedPath = decodeURIComponent(hash)
        const fileEntry = files.find((f) => f.path === decodedPath)
        if (fileEntry) {
          handleFileClick(fileEntry)
        }
      }
    }

    // Handle initial hash on page load
    if (files.length > 0) {
      const initialHash = window.location.hash.slice(1)
      if (initialHash) {
        const decodedPath = decodeURIComponent(initialHash)
        const fileEntry = files.find((f) => f.path === decodedPath)
        if (fileEntry) {
          handleFileClick(fileEntry)
        }
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [files, handleFileClick, showAbout])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (visibleFiles.length === 0) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setFocusedFileIndex((prev) => {
          if (prev === -1) return 0
          const nextIndex = prev + 1
          return nextIndex < visibleFiles.length ? nextIndex : prev
        })
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setFocusedFileIndex((prev) => {
          if (prev === -1) return 0
          const nextIndex = prev - 1
          return nextIndex >= 0 ? nextIndex : prev
        })
      } else if (event.key === "Enter" && focusedFileIndex >= 0) {
        event.preventDefault()
        const fileEntry = visibleFiles[focusedFileIndex]
        if (fileEntry) {
          handleFileClick(fileEntry)
        }
      }
    },
    [visibleFiles, focusedFileIndex, handleFileClick],
  )

  useEffect(() => {
    if (focusedFileIndex >= visibleFiles.length) {
      setFocusedFileIndex(
        visibleFiles.length > 0 ? visibleFiles.length - 1 : -1,
      )
    }
  }, [visibleFiles.length, focusedFileIndex])

  // Preserve scroll position when directories expand/collapse
  const scrollPositionRef = useRef<number>(0)

  useEffect(() => {
    const handleBeforeChange = () => {
      if (directoryListRef.current) {
        scrollPositionRef.current = directoryListRef.current.scrollTop
      }
    }

    handleBeforeChange()
  }, [expandedDirs])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (directoryListRef.current) {
        directoryListRef.current.scrollTop = scrollPositionRef.current
      }
    })
  }, [expandedDirs])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  const AboutPage = () => {
    const formatCount = (count: number | undefined) =>
      count !== undefined ? count.toLocaleString() : "--"

    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString()
      } catch {
        return "--"
      }
    }

    const ClickableCount = ({
      filePath,
      children,
    }: {
      filePath: string
      children: React.ReactNode
    }) => {
      const fileExists = files.some((f) => f.path === filePath)
      if (!fileExists) return <span>{children}</span>

      return (
        <button
          onClick={() => openFile(filePath)}
          className="underline cursor-pointer"
        >
          {children}
        </button>
      )
    }

    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Twitter Archive Explorer</h1>
        <div className="mb-6">
          <FileUpload onFileSelect={processFile} isLoading={isLoading} />
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-2">Account Info</h3>
              <div className="space-y-1 text-sm">
                <div>
                  Handle:{" "}
                  <ClickableCount filePath="data/account.js">
                    @{accountInfo?.username || "--"}
                  </ClickableCount>
                </div>
                <div>Name: {accountInfo?.accountDisplayName || "--"}</div>
                <div>
                  Created:{" "}
                  {accountInfo?.createdAt
                    ? formatDate(accountInfo.createdAt)
                    : "--"}
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-2">Content</h3>
              <div className="space-y-1 text-sm">
                <div>
                  Tweets:{" "}
                  <ClickableCount filePath="data/tweets.js">
                    {formatCount(twitterCounts["data/tweets.js"])}
                  </ClickableCount>
                </div>
                <div>
                  DM Conversations:{" "}
                  <ClickableCount filePath="data/direct-messages.js">
                    {formatCount(twitterCounts["data/direct-messages.js"])}
                  </ClickableCount>
                </div>
                <div>
                  Likes:{" "}
                  <ClickableCount filePath="data/like.js">
                    {formatCount(twitterCounts["data/like.js"])}
                  </ClickableCount>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-2">Privacy & Security</h3>
              <div className="space-y-1 text-sm">
                <div>
                  Blocked Users:{" "}
                  <ClickableCount filePath="data/block.js">
                    {formatCount(twitterCounts["data/block.js"])}
                  </ClickableCount>
                </div>
                <div>
                  Muted Users:{" "}
                  <ClickableCount filePath="data/mute.js">
                    {formatCount(twitterCounts["data/mute.js"])}
                  </ClickableCount>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-2">Social</h3>
              <div className="space-y-1 text-sm">
                <div>
                  Following:{" "}
                  <ClickableCount filePath="data/following.js">
                    {formatCount(twitterCounts["data/following.js"])}
                  </ClickableCount>
                </div>
                <div>
                  Followers:{" "}
                  <ClickableCount filePath="data/follower.js">
                    {formatCount(twitterCounts["data/follower.js"])}
                  </ClickableCount>
                </div>
              </div>
            </div>
          </div>
        </div>
        {files.length > 0 && (
          <div className="mt-6">
            <button
              onClick={exportCoreData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
            >
              📦 Export Core Data
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-300 mt-2">
              Downloads core data (tweets, likes, followers, following, account
              info, profile, long tweets, community tweets) as a ZIP file. This
              can be uploaded to the{" "}
              <a
                className="underline"
                href="https://www.community-archive.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Community Archive
              </a>
              !
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="w-64 min-w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={showAbout}
            className={`block w-full text-left px-2 py-1 rounded text-sm font-medium ${
              currentView === "about"
                ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                : "hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            📊 About
          </button>
          <div className="mt-2 mb-1">
            {[
              { path: "data/like.js", name: "Likes" },
              { path: "data/tweets.js", name: "Tweets" },
              { path: "data/mute.js", name: "Muted" },
              { path: "data/block.js", name: "Blocked" },
              { path: "data/direct-messages.js", name: "DM Conversations" },
              { path: "data/follower.js", name: "Followers" },
              { path: "data/following.js", name: "Following" },
            ].map(({ path: filePath, name: displayName }) => {
              const fileExists =
                files.length > 0 && files.some((f) => f.path === filePath)
              const fileEntry = files.find((f) => f.path === filePath)
              const isSelected = selectedFilePath === filePath
              return (
                <button
                  key={filePath}
                  onClick={() => fileEntry && handleFileClick(fileEntry)}
                  disabled={!fileExists}
                  className={`block w-full text-left px-2 py-1 rounded text-sm flex justify-between items-center ${
                    isSelected
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                      : fileExists
                        ? "hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                        : "text-gray-600 dark:text-gray-400"
                  }`}
                  style={{ paddingLeft: "8px" }}
                >
                  <span className="truncate">📄&nbsp;{displayName}</span>
                  {fileExists && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs ml-2 whitespace-nowrap">
                      {twitterCounts[filePath] !== undefined
                        ? twitterCounts[filePath].toLocaleString()
                        : "..."}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div ref={directoryListRef} className="flex-1 overflow-y-auto p-2">
          {files.length > 0 &&
            directoryTree.map((node) => (
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
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar
          files={files}
          onClearArchive={clearArchive}
          onToggleTheme={toggleTheme}
          isDarkMode={isDarkMode}
        />
        {currentView === "about" ? (
          <AboutPage />
        ) : (
          <VirtualizedTextViewer content={content} />
        )}
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
