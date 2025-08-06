import React, { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { splitTextIntoBlocks } from "./helpers"

interface VirtualizedTextViewerProps {
  content: string
}

export function VirtualizedTextViewer({ content }: VirtualizedTextViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const blocks = splitTextIntoBlocks(content, 100)

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 2000, // Estimate ~100 lines * 20px per line
    overscan: 2,
  })

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
