import { Fragment, ReactNode } from 'react';

/**
 * Lightweight markdown renderer (no external deps).
 * Supports: fenced code blocks, inline code, bold, italic, headers,
 * unordered/ordered lists, links. Good enough for streaming chat output.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split by inline code first
  const codeParts = text.split(/(`[^`]+`)/g);
  codeParts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="px-1.5 py-0.5 rounded bg-muted text-[0.85em] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
      return;
    }
    // Bold / italic / links
    const regex = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let j = 0;
    while ((match = regex.exec(part)) !== null) {
      if (match.index > last) nodes.push(<Fragment key={`${keyPrefix}-${i}-${j++}`}>{part.slice(last, match.index)}</Fragment>);
      const token = match[0];
      if (token.startsWith('**')) {
        nodes.push(<strong key={`${keyPrefix}-b${i}-${j++}`}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*')) {
        nodes.push(<em key={`${keyPrefix}-i${i}-${j++}`}>{token.slice(1, -1)}</em>);
      } else {
        const m = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (m) {
          nodes.push(
            <a key={`${keyPrefix}-a${i}-${j++}`} href={m[2]} target="_blank" rel="noreferrer" className="underline text-primary">
              {m[1]}
            </a>
          );
        }
      }
      last = match.index + token.length;
    }
    if (last < part.length) {
      nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{part.slice(last)}</Fragment>);
    }
  });
  return nodes;
}

export default function MarkdownLite({ content }: { content: string }) {
  if (!content) return null;
  const blocks: ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={`code-${key++}`} className="my-2 rounded-lg bg-zinc-950 text-zinc-100 p-3 overflow-x-auto text-sm">
          {lang && <div className="text-xs text-zinc-400 mb-1">{lang}</div>}
          <code className="font-mono whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headers
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm'];
      blocks.push(
        <div key={`h-${key++}`} className={`font-bold mt-3 mb-1 ${sizes[level - 1]}`}>
          {renderInline(h[2], `h${key}`)}
        </div>
      );
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 my-2 space-y-1">
          {items.map((it, n) => <li key={n}>{renderInline(it, `ul${key}-${n}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="list-decimal pl-5 my-2 space-y-1">
          {items.map((it, n) => <li key={n}>{renderInline(it, `ol${key}-${n}`)}</li>)}
        </ol>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p-${key++}`} className="whitespace-pre-wrap my-1">
        {renderInline(para.join('\n'), `p${key}`)}
      </p>
    );
  }

  return <div className="markdown-lite">{blocks}</div>;
}
