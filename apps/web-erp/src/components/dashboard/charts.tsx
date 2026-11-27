'use client';

import { useEffect, useRef } from 'react';

export interface Series {
  name: string;
  /** null = no value (a gap). */
  values: (number | null)[];
  color: 'primary' | 'muted' | 'success' | 'danger';
  type: 'bar' | 'line';
}

/**
 * Lazily loaded ECharts (tree-shaken, SVG renderer). The chart is decorative for assistive tech:
 * every chart on the dashboard has an equivalent data table right next to it.
 */
export function TrendChart({
  categories,
  series,
  rtl,
  height = 300,
  label,
}: {
  categories: string[];
  series: Series[];
  rtl: boolean;
  height?: number;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void } | undefined;
    const onResize = () => chart?.resize();
    (async () => {
      const echarts = await import('echarts/core');
      const [{ BarChart, LineChart }, { GridComponent, TooltipComponent, LegendComponent }, { SVGRenderer }] =
        await Promise.all([
          import('echarts/charts'),
          import('echarts/components'),
          import('echarts/renderers'),
        ]);
      echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
      if (disposed || !el.current) return;
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const colors = {
        primary: v('--color-primary'),
        muted: v('--color-text-muted'),
        success: v('--color-success-brand'),
        danger: v('--color-danger-brand'),
      };
      const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const c = echarts.init(el.current, undefined, { renderer: 'svg' });
      chart = c;
      c.setOption({
        textStyle: {
          fontFamily: rtl ? 'IBM Plex Sans Arabic' : 'Inter Variable',
          color: v('--color-text-muted'),
        },
        grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
        // Legend starts at the reading edge; in RTL the key sits to the right of its label.
        legend: {
          top: 0,
          [rtl ? 'right' : 'left']: 0,
          align: rtl ? 'right' : 'left',
          textStyle: { color: v('--color-text') },
        },
        tooltip: { trigger: 'axis', valueFormatter: (x: number) => fmt(x) },
        // Time runs left-to-right in both languages (docs/DECISIONS.md T-28).
        xAxis: {
          type: 'category',
          data: categories,
          axisLine: { lineStyle: { color: v('--color-border') } },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { formatter: fmt },
          splitLine: { lineStyle: { color: v('--color-border') } },
        },
        series: series.map((s) => ({
          name: s.name,
          type: s.type,
          data: s.values,
          smooth: s.type === 'line',
          symbolSize: 6,
          barMaxWidth: 28,
          itemStyle: { color: colors[s.color], borderRadius: s.type === 'bar' ? [4, 4, 0, 0] : 0 },
          lineStyle: { width: 2.5 },
        })),
        animationDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400,
      });
      window.addEventListener('resize', onResize);
    })().catch((err: unknown) => console.error('chart failed to load', err));
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      chart?.dispose();
    };
  }, [categories, series, rtl]);
  // dir="ltr": SVG text would otherwise inherit RTL and flip every label anchor (overlaps).
  return <div ref={el} role="img" aria-label={label} dir="ltr" style={{ height }} className="w-full" />;
}
