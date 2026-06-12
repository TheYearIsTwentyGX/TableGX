import { useMemo, useState } from 'react'
import { customColumn, ReadOnlyTable, type ColumnDef } from 'tablegx'
import { Section } from '../ui'

/**
 * Reproduces the clinical quality-metrics dashboard from the bug report: short
 * month headers (Jan…Jun), a YTD column, and a Benchmark column, all with
 * sorting/filtering disabled so each header is sized to padding + measured text
 * with no icon slack. That is the exact scenario where a consumer font wider
 * than the library's hardcoded measurement stack used to clip the last glyph
 * ("Mar" → "Mai", "May" → "Maj", "Bench"). Switch the font below to a non-
 * default one and confirm the labels stay fully visible.
 */

type MetricRow = {
  id: string
  metric: string
  jan: number
  feb: number
  mar: number
  apr: number
  may: number
  jun: number
  ytd: number
  percent?: boolean
  bold?: boolean
  benchmark?: string
}

const zero = { jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, ytd: 0 }

const metrics: MetricRow[] = [
  { id: 'census', metric: 'Avg Census', ...zero },
  { id: 'don', metric: 'DON floor hours', ...zero },
  { id: 'nm', metric: 'Nurse Manager floor hours', ...zero },
  { id: 'occ', metric: 'Occurences - Total', ...zero, percent: true, bold: true },
  { id: 'pu', metric: 'Pressure Ulcers', ...zero, percent: true, bold: true },
  { id: 'res', metric: 'Residents w/PU', ...zero, percent: true },
  { id: 'fapu', metric: 'Facility Acquired PU', ...zero, percent: true, benchmark: '< 3%' },
  { id: 'nfapu', metric: 'New Facility Acquired PU', ...zero, percent: true, benchmark: '< 3%' },
]

const MONTHS: { id: keyof MetricRow & string; header: string }[] = [
  { id: 'jan', header: 'Jan' },
  { id: 'feb', header: 'Feb' },
  { id: 'mar', header: 'Mar' },
  { id: 'apr', header: 'Apr' },
  { id: 'may', header: 'May' },
  { id: 'jun', header: 'Jun' },
  { id: 'ytd', header: 'YTD' },
]

const FONTS = [
  { key: 'system', label: 'System (default)', stack: '' },
  { key: 'verdana', label: 'Verdana (wide)', stack: 'Verdana, Geneva, sans-serif' },
  { key: 'georgia', label: 'Georgia (serif)', stack: "Georgia, 'Times New Roman', serif" },
] as const

type FontKey = (typeof FONTS)[number]['key']

function valueColumn(id: keyof MetricRow & string, header: string): ColumnDef<MetricRow, unknown> {
  return {
    ...customColumn<MetricRow>(
      id,
      header,
      ({ row, value }) => (
        <div className="flex w-full flex-col items-center justify-center leading-tight">
          <span className={row.bold ? 'font-semibold tabular-nums' : 'tabular-nums'}>
            {Number(value ?? 0).toLocaleString()}
          </span>
          {row.percent && <span className="text-[11px] text-muted-foreground">0%</span>}
        </div>
      ),
      { measureText: (r) => Number(r[id] ?? 0).toLocaleString() },
    ),
    enableSorting: false,
    enableColumnFilter: false,
  }
}

export function MetricsExample() {
  const [fontKey, setFontKey] = useState<FontKey>('verdana')
  const fontStack = FONTS.find((f) => f.key === fontKey)!.stack

  const columns = useMemo<ColumnDef<MetricRow, unknown>[]>(
    () => [
      {
        ...customColumn<MetricRow>(
          'metric',
          'Metric',
          ({ row, value }) => (
            <span className={row.bold ? 'font-semibold' : ''}>{String(value ?? '')}</span>
          ),
          { measureText: (r) => String(r.metric ?? ''), maxColumnWidth: 220 },
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
      ...MONTHS.map((m) => valueColumn(m.id, m.header)),
      {
        ...customColumn<MetricRow>(
          'benchmark',
          'Benchmark',
          ({ value }) =>
            value ? <span className="text-muted-foreground">{String(value)}</span> : null,
          { measureText: (r) => String(r.benchmark ?? '') },
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    [],
  )

  return (
    <Section
      title="Quality metrics (header-clipping repro)"
      description="The grid from the bug report. Month/YTD/Benchmark columns have no sort or filter icons, so each header is sized purely from its measured text. Switch to a non-default font — the headers re-fit to that font and the last glyph of 'Mar', 'May', 'Benchmark' stays visible."
      controls={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Font:</span>
          {FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFontKey(f.key)}
              className={
                f.key === fontKey
                  ? 'rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground'
                  : 'rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {/* The library sets no font-family of its own, so cells inherit this
          wrapper's font — switching it mimics a consumer app's font. The `key`
          remounts the table so auto-widths re-measure against the new font. */}
      <div className="h-[460px]" style={{ fontFamily: fontStack || undefined }}>
        <ReadOnlyTable<MetricRow>
          key={fontKey}
          data={metrics}
          columns={columns}
          getRowId={(r) => r.id}
          frozenColumns={1}
        />
      </div>
    </Section>
  )
}
