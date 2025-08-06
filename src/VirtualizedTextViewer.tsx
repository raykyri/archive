import React, { useRef, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { splitTextIntoBlocks } from "./helpers"

interface VirtualizedTextViewerProps {
  content: string
}

export function VirtualizedTextViewer({ content }: VirtualizedTextViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const lines = content.split('\n')
  const linesPerBlock = lines.length <= 50 ? 1 : 100
  const blocks = splitTextIntoBlocks(content, linesPerBlock)

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => linesPerBlock * 20, // Estimate lines per block * 20px per line
    overscan: 2,
  })

  // Scroll to top when content changes
  useEffect(() => {
    if (content && parentRef.current) {
      parentRef.current.scrollTop = 0
    }
  }, [content])

  if (!content) {
    return (
      <div className="p-4 flex-1 overflow-auto whitespace-pre-wrap">
        {content}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="p-4 flex-1 overflow-auto"
      style={{ height: "100%" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <pre className="whitespace-pre-wrap font-mono text-sm leading-5 m-0">
              {blocks[virtualItem.index]}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}
