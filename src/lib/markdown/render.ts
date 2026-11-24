import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

/**
 * Safe Markdown + math rendering for card content.
 *
 * Pipeline: math segments are swapped for placeholders → Markdown → math
 * re-inserted as KaTeX HTML → everything sanitised with DOMPurify. Card
 * content is untrusted (it may come from imported files), so the sanitiser
 * always runs last and strips scripts, event handlers and unsafe URLs.
 */

const marked = new Marked({ gfm: true, breaks: true, async: false });

// $$…$$, \[…\], \(…\), and $…$ (no space just inside the dollars, and not a
// price like "$5 and $10").
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled || typeof window === 'undefined') return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
  } catch {
    return escapeHtml(display ? `$$${tex}$$` : `$${tex}$`);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const cache = new Map<string, string>();

export function renderMarkdown(source: string): string {
  if (!source) return '';
  const hit = cache.get(source);
  if (hit !== undefined) return hit;
  installHooks();

  const math: string[] = [];
  const withPlaceholders = source.replace(MATH_RE, (_m, d1, d2, i1, i2) => {
    const display = d1 !== undefined || d2 !== undefined;
    const tex = (d1 ?? d2 ?? i1 ?? i2 ?? '').trim();
    math.push(renderMath(tex, display));
    return `FOUNDYMATHPH${math.length - 1}X`;
  });

  let html = marked.parse(withPlaceholders) as string;
  html = html.replace(/FOUNDYMATHPH(\d+)X/g, (_m, i) => math[Number(i)] ?? '');

  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

  if (cache.size > 500) cache.clear();
  cache.set(source, clean);
  return clean;
}

const TEX_SYMBOLS: Record<string, string> = {
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', degree: '°', circ: '°',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', sigma: 'σ', Sigma: 'Σ', omega: 'ω', Omega: 'Ω', phi: 'φ', rho: 'ρ', tau: 'τ', int: '∫', sum: 'Σ',
  partial: '∂', nabla: '∇', forall: '∀', exists: '∃', in: '∈', cdots: '⋯', ldots: '…', quad: ' ', qquad: ' ',
};
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };

/** Readable plain-text approximation of simple TeX (for previews and search). */
export function texToText(tex: string): string {
  // Resolve innermost groups first so nested \frac{…\sqrt{…}}{…} flattens.
  let out = tex;
  for (let i = 0; i < 6; i++) {
    const next = out
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => TEX_SYMBOLS[name] ?? (name === 'left' || name === 'right' ? '' : m.slice(1)))
    // TeX: ^{…} raises a group, a bare ^ raises one character only.
    .replace(/\^(?:\{([0-9+\-n]+)\}|([0-9n]))/g, (m, group: string | undefined, single: string | undefined) => {
      const p = group ?? single ?? '';
      return p.split('').every((ch) => SUP[ch]) ? p.split('').map((ch) => SUP[ch]).join('') : m;
    })
    .replace(/\\[,;!]/g, ' ')
    .replace(/[{}]/g, '');
}

/** Plain-text version (for search, multiple-choice comparisons, etc.). */
export function stripMarkdown(source: string): string {
  return source
    .replace(MATH_RE, (_m, d1, d2, i1, i2) => texToText(String(d1 ?? d2 ?? i1 ?? i2 ?? '')))
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
