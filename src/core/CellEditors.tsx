import { motion } from 'framer-motion'
import * as React from 'react'
import { useRef, useState } from 'react'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import type { EditInputType } from '../types'

export type EditNavigation = 'next' | 'prev'

export type CellEditorProps = {
  inputType: EditInputType
  selectOptions?: { label: string; value: string }[]
  initialValue: string
  disabled?: boolean
  /** Commit the edit; `nav` requests focus move to the adjacent editable cell. */
  onCommit: (value: string | number | boolean, nav?: EditNavigation) => void
  onCancel: () => void
}

function parseNumber(raw: string): string | number {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : raw
}

/**
 * Renders the editor matching `meta.inputType` (spec §7.3) with the §7.4
 * commit/cancel/navigation key handling.
 */
export function CellEditor({
  inputType,
  selectOptions,
  initialValue,
  disabled,
  onCommit,
  onCancel,
}: CellEditorProps) {
  const [value, setValue] = useState(initialValue)
  // Set once an explicit commit/cancel ran, so the trailing blur is ignored.
  const doneRef = useRef(false)

  const commit = (v: string | number | boolean, nav?: EditNavigation) => {
    if (doneRef.current) return
    doneRef.current = true
    onCommit(v, nav)
  }

  const cancel = () => {
    if (doneRef.current) return
    doneRef.current = true
    onCancel()
  }

  const handleNavKeys = (e: React.KeyboardEvent, current: string | number | boolean) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
      return true
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      commit(current, e.shiftKey ? 'prev' : 'next')
      return true
    }
    return false
  }

  const wrap = (children: React.ReactNode) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="flex min-w-0 flex-1 items-center"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  )

  if (inputType === 'boolean') {
    const checked = value === 'true'
    return wrap(
      <label className="my-1.5 flex items-center gap-2 text-sm">
        <Checkbox
          autoFocus
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => {
            setValue(String(next === true))
            commit(next === true)
          }}
          onKeyDown={(e) => {
            if (handleNavKeys(e, checked)) return
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(checked)
            }
          }}
          onBlur={() => commit(checked)}
          aria-label="Edit boolean value"
        />
        {checked ? 'Yes' : 'No'}
      </label>,
    )
  }

  if (inputType === 'select') {
    return wrap(
      <Select
        defaultOpen
        value={value || undefined}
        disabled={disabled}
        onValueChange={(next) => {
          setValue(next)
          commit(next)
        }}
        onOpenChange={(open) => {
          if (!open) cancel()
        }}
      >
        <SelectTrigger
          size="sm"
          autoFocus
          className="my-1.5 h-8 w-full min-w-0"
          onKeyDown={(e) => {
            handleNavKeys(e, value)
          }}
        >
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {(selectOptions ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )
  }

  if (inputType === 'number') {
    return wrap(
      <Input
        autoFocus
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        className="my-1.5 h-8 w-full min-w-0"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (handleNavKeys(e, parseNumber(value))) return
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(parseNumber(value))
          }
        }}
        onBlur={() => commit(parseNumber(value))}
        onFocus={(e) => e.target.select()}
        aria-label="Edit number value"
      />,
    )
  }

  // text — auto-expanding textarea; Enter commits, Shift+Enter inserts a newline.
  return wrap(
    <Textarea
      autoFocus
      rows={1}
      value={value}
      disabled={disabled}
      className="my-1.5 min-h-11 w-full min-w-0 resize-none py-2"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (handleNavKeys(e, value)) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit(value)
        }
      }}
      onBlur={() => commit(value)}
      onFocus={(e) => {
        const el = e.target
        el.setSelectionRange(el.value.length, el.value.length)
      }}
      aria-label="Edit text value"
    />,
  )
}
