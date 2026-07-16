"use client"

import { Fragment, type ReactNode } from "react"

type MarkdownDocumentProps = {
  content: string
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }

export function MarkdownDocument({ content }: MarkdownDocumentProps) {
  return (
    <div className="space-y-3 text-xs leading-relaxed text-gray-300">
      {parseMarkdown(content).map((block, index) => (
        <MarkdownBlockView block={block} key={index} />
      ))}
    </div>
  )
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.type === "heading") {
    const className =
      block.level === 1
        ? "text-sm font-semibold text-white"
        : block.level === 2
          ? "pt-1 text-xs font-semibold text-gray-100"
          : "text-xs font-semibold text-gray-200"

    return <div className={className}>{renderInline(block.text)}</div>
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul"
    return (
      <ListTag className={block.ordered ? "list-decimal space-y-1 pl-4" : "list-disc space-y-1 pl-4"}>
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ListTag>
    )
  }

  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-gray-200">
        <code>{block.text}</code>
      </pre>
    )
  }

  return <p>{renderInline(block.text)}</p>
}

function parseMarkdown(content: string) {
  const blocks: MarkdownBlock[] = []
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed || trimmed === "---") {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({ type: "code", text: codeLines.join("\n") })
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed)
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].trim()
        const match = ordered ? item.match(/^\d+\.\s+(.+)$/) : item.match(/^[-*]\s+(.+)$/)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (
        !current ||
        current === "---" ||
        current.startsWith("```") ||
        /^(#{1,6})\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break
      }
      paragraph.push(current)
      index += 1
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") })
  }

  return blocks
}

function renderInline(text: string) {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith("`")) {
      nodes.push(
        <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-gray-100" key={nodes.length}>
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <strong className="font-semibold text-gray-100" key={nodes.length}>
          {token.slice(2, -2)}
        </strong>,
      )
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))

  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>)
}
