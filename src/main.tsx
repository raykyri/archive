import "./style.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { unzip } from "unzipit"
import React, { useState, useCallback } from "react"
import { formatFileSize, isBinary } from "./helpers"
import { VirtualizedTextViewer } from "./VirtualizedTextViewer"

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

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle("dark")
  }, [])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      console.log(`Uploaded file size: ${(file.size / 1024).toFixed(2)} KB`)
      const { entries } = await unzip(file)

      const fileList: FileEntry[] = []
      for (const [path, entry] of Object.entries(entries)) {
        if (!entry.isDirectory) {
          fileList.push({ path, entry, size: entry.size })
        }
      }
      setFiles(fileList)
      setDirectoryTree(buildDirectoryTree(fileList))
      setContent("")
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
  }, [])

  return (
    <>
      <div className="w-64 min-w-64 border-r border-gray-200 dark:border-gray-700 p-2 overflow-y-auto flex-shrink-0">
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
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="text-sm"
          />
          <button onClick={toggleTheme} className="px-2 py-1 border rounded">
            Toggle
          </button>
        </div>
        <VirtualizedTextViewer content={content} />
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
