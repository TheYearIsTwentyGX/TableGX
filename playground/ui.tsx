import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cellInteractionProps, isolateCellEvent } from 'tablegx'

export function Section({
  title,
  description,
  controls,
  children,
}: {
  title: string
  description?: string
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>
      {children}
    </section>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  )
}

/**
 * A small inline tag used inside custom cells. When `onRemove` is provided it
 * renders an interactive ✕ button that uses `cellInteractionProps` /
 * `isolateCellEvent` so clicking it removes the tag WITHOUT triggering the
 * cell's `onCellClick`, row selection, expansion, or inline edit.
 */
export function Pill({
  children,
  onRemove,
}: {
  children: ReactNode
  onRemove?: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground">
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          {...cellInteractionProps}
          onClick={(e) => {
            isolateCellEvent(e)
            onRemove()
          }}
          className="-mr-0.5 rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          ✕
        </button>
      )}
    </span>
  )
}

/**
 * A lightweight popover positioned at a screen coordinate (e.g. the cursor
 * position from a cell's `onCellClick` event). Renders into a portal on
 * <body>, closes on outside click or Escape, and clamps to the viewport.
 */
export function PopoverPanel({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y + 12, window.innerHeight - 220)

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ position: 'fixed', top, left, zIndex: 50 }}
      className="max-h-[200px] min-w-[180px] max-w-[220px] overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {children}
    </div>,
    document.body,
  )
}
