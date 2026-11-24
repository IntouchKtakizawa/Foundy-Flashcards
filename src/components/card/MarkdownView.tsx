import { memo, useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown/render';
import { cn } from '@/lib/utils';

/** Renders sanitised Markdown + KaTeX math. Content is always passed through DOMPurify. */
export const MarkdownView = memo(function MarkdownView({ source, className, image, imageAlt }: { source: string; className?: string; image?: string | null; imageAlt?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div className={cn('prose-card', className)}>
      {image && <img src={image} alt={imageAlt ?? ''} className="mb-3 max-h-56 rounded-lg object-contain" />}
      {/* eslint-disable-next-line react/no-danger -- sanitised by renderMarkdown */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});
