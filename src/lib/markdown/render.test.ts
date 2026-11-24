import { describe, expect, it } from 'vitest';
import { renderMarkdown, stripMarkdown } from './render';

describe('markdown rendering', () => {
  it('renders markdown and math', () => {
    const html = renderMarkdown('**bold** and $F = ma$');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('katex');
  });

  it('sanitises scripts, event handlers and javascript: URLs', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script>[x](javascript:alert(3))');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('does not treat prices as maths', () => {
    expect(renderMarkdown('It costs $5 and $10')).not.toContain('katex');
  });

  it('produces readable plain text for maths', () => {
    expect(stripMarkdown('$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$')).toBe('x = (-b ± √(b²-4ac))/(2a)');
  });
});
