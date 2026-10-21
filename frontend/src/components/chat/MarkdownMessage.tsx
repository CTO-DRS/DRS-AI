import {
  cloneElement,
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Memoized markdown renderer for assistant messages.
 * Styled for: code blocks (dark bg + language label), inline code,
 * lists, tables, blockquotes and links (open in a new tab).
 */

/** react-markdown injects an extra `node` prop (hast element) that must not reach the DOM. */
function domProps<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete (rest as { node?: unknown }).node;
  return rest;
}

function getCodeLanguage(children: ReactNode): { lang: string; codeEl: ReactNode } {
  const child: unknown = Array.isArray(children) ? children[0] : children;
  if (isValidElement(child)) {
    const element = child as ReactElement<{ className?: string }>;
    const className = element.props.className ?? '';
    const match = /language-([\w-]+)/.exec(className);
    const lang = match?.[1] ?? 'text';
    // Force block styling on the inner <code> (handles the no-language case too).
    const codeEl = cloneElement(element, {
      className: `font-mono text-xs leading-relaxed text-zinc-100 ${className}`.trim(),
    });
    return { lang, codeEl };
  }
  return { lang: 'text', codeEl: child as ReactNode };
}

const components: Components = {
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-500 underline decoration-blue-500/40 underline-offset-2 hover:text-blue-400"
      {...domProps(props)}
    >
      {children}
    </a>
  ),
  pre: ({ children, ...props }) => {
    const { lang, codeEl } = getCodeLanguage(children);
    return (
      <div className="my-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {lang}
          </span>
        </div>
        <pre className="overflow-x-auto p-4" {...domProps(props)}>
          {codeEl}
        </pre>
      </div>
    );
  },
  code: ({ className, children, ...props }) => {
    if (className?.includes('language-')) {
      // Block code — final styling applied by the `pre` wrapper.
      return (
        <code className={className} {...domProps(props)}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-pink-600 dark:text-pink-400"
        {...domProps(props)}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-3 border-s-4 border-primary/40 ps-4 italic text-muted-foreground"
      {...domProps(props)}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...domProps(props)}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/60" {...domProps(props)}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-b border-border px-3 py-2 text-start font-semibold"
      {...domProps(props)}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-b border-border px-3 py-2 align-top text-start" {...domProps(props)}>
      {children}
    </td>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-3 list-disc space-y-1 ps-6 marker:text-muted-foreground" {...domProps(props)}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-3 list-decimal space-y-1 ps-6 marker:text-muted-foreground" {...domProps(props)}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...domProps(props)}>
      {children}
    </li>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...domProps(props)}>
      {children}
    </p>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="my-3 text-xl font-bold first:mt-0" {...domProps(props)}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="my-3 text-lg font-bold first:mt-0" {...domProps(props)}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="my-2 text-base font-semibold first:mt-0" {...domProps(props)}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="my-2 text-sm font-semibold first:mt-0" {...domProps(props)}>
      {children}
    </h4>
  ),
  hr: (props) => <hr className="my-4 border-border" {...domProps(props)} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...domProps(props)}>
      {children}
    </strong>
  ),
};

function MarkdownMessageBase({ content }: { content: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownMessage = memo(MarkdownMessageBase);
