import React, { useRef, useEffect, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { splitTextIntoBlocks } from "./helpers"

interface VirtualizedTextViewerProps {
  content: string
}

export function VirtualizedTextViewer({ content }: VirtualizedTextViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const measureElementRef = useRef<HTMLPreElement>(null)
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(
    new Map(),
  )

  const lines = content.split("\n")
  const linesPerBlock = lines.length <= 50 ? 1 : 100
  const blocks = splitTextIntoBlocks(content, linesPerBlock)

  // Measure a block's actual height
  const measureBlock = (index: number): number => {
    if (measuredHeights.has(index)) {
      return measuredHeights.get(index)!
    }

    if (!measureElementRef.current) {
      // Fallback to estimation if measure element isn't ready
      const lineHeight = 17.5
      const actualLines = blocks[index].split("\n").length
      return actualLines * lineHeight
    }

    // Set the content and measure
    measureElementRef.current.textContent = blocks[index]
    const height = measureElementRef.current.offsetHeight

    // Add extra height for debugging
    const debugHeight = height + 0

    // Cache the measurement
    setMeasuredHeights((prev) => new Map(prev).set(index, debugHeight))

    return debugHeight
  }

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => measureBlock(index),
    overscan: 2,
  })

  // Clear measurements and scroll to top when content changes
  useEffect(() => {
    setMeasuredHeights(new Map())
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
      {/* Hidden element for measuring text height */}
      <pre
        ref={measureElementRef}
        className="whitespace-pre-wrap font-mono text-sm leading-5 m-0 absolute invisible"
        style={{
          top: -9999,
          left: -9999,
          width: "calc(100% - 2rem)", // Account for padding
        }}
      />
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
