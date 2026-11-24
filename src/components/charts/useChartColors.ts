import { useEffect, useState } from 'react';

export interface ChartColors {
  accent: string;
  accentSoft: string;
  fg: string;
  muted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  surface: string;
  subtle: string;
}

function read(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, alpha?: number) => {
    const raw = cs.getPropertyValue(name).trim() || '0 0 0';
    return alpha === undefined ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`;
  };
  return {
    accent: v('--accent'),
    accentSoft: v('--accent', 0.35),
    fg: v('--fg'),
    muted: v('--muted'),
    border: v('--border'),
    success: v('--success'),
    danger: v('--danger'),
    warning: v('--warning'),
    surface: v('--elevated'),
    subtle: v('--subtle'),
  };
}

/**
 * SVG presentation attributes can't use CSS variables, so charts read the
 * resolved theme colours here and re-render when theme/accent changes.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(() => read());
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

export const tooltipStyle = (c: ChartColors): React.CSSProperties => ({
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  fontSize: 12,
  color: c.fg,
  boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.3)',
});
