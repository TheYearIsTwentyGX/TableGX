"use client";
import { flexRender, getCoreRowModel, getExpandedRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, Columns3Icon, ListFilterIcon, Loader2Icon, MinusIcon, PencilIcon, XIcon } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
//#region src/constants.ts
/** Fixed body row height (enables row virtualization). */
const ROW_HEIGHT_PX = 56;
/** Header row height. */
const HEADER_HEIGHT_PX = 48;
/** Pre-measurement fallback width, used only until auto-sizing resolves. */
const MIN_COLUMN_WIDTH_PX = 160;
/** Hard floor so an empty-header column still shows its icons. */
const ABSOLUTE_MIN_COLUMN_WIDTH_PX = 48;
/**
* Auto-sized frozen (pinned) columns are scaled so their combined width does not
* exceed this fraction of the viewport until the user resizes a pinned data column;
* after that, pinned columns use their effective widths and the pane may grow wider.
*/
const FROZEN_PANE_MAX_FRACTION = .5;
/** Horizontal indent applied per nesting depth for the disclosure column. */
const INDENT_STEP_PX = 20;
/** System-wide max width for auto-sized columns (per-column override via meta.maxColumnWidth). */
const MAX_COLUMN_WIDTH_PX = 480;
/** Id of the injected row-selection checkbox column. */
const SELECTION_COLUMN_ID = "__tgx_select__";
//#endregion
//#region src/lib/measure.ts
/** Default cell text font. Matches the table body's `text-sm` Tailwind class. */
const CELL_FONT = "14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/** Header label font (`text-sm font-medium`). */
const HEADER_FONT = "500 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const widthCache = /* @__PURE__ */ new Map();
function approximateWidth(text, font) {
	const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
	const fontSize = sizeMatch ? Number(sizeMatch[1]) : 14;
	return text.length * fontSize * .6;
}
/**
* DOM-free text measurement backed by @chenglou/pretext. `prepare` work is
* cached per (font, text) pair, so repeated measurements are arithmetic-only.
*/
const measureTextWidth = (text, font) => {
	if (text === "") return 0;
	const key = `${font}\u0000${text}`;
	const cached = widthCache.get(key);
	if (cached !== void 0) return cached;
	let width;
	try {
		width = measureNaturalWidth(prepareWithSegments(text, font));
	} catch {
		width = approximateWidth(text, font);
	}
	widthCache.set(key, width);
	return width;
};
/** True when canvas-based measurement can run (i.e. not during SSR). */
function canMeasureText() {
	if (typeof document === "undefined") return false;
	try {
		return document.createElement("canvas").getContext("2d") !== null;
	} catch {
		return false;
	}
}
//#endregion
//#region src/lib/rows.ts
/**
* Depth-first flatten of a nested row tree. `limit` bounds the number of
* visited nodes so huge trees stay cheap to sample.
*/
function flattenWithDepth(rows, getSubRows, limit = Number.POSITIVE_INFINITY) {
	const out = [];
	const visit = (list, depth) => {
		for (const row of list) {
			if (out.length >= limit) return;
			out.push({
				row,
				depth
			});
			const subRows = getSubRows?.(row);
			if (subRows && subRows.length > 0) visit(subRows, depth + 1);
		}
	};
	visit(rows, 0);
	return out;
}
//#endregion
//#region src/hooks/useAutoColumnWidths.ts
/** Horizontal cell padding (px-3 each side). */
const CELL_H_PADDING_PX = 24;
/** Allowance for the sort arrow (and multi-sort priority badge). */
const SORT_ICON_ALLOWANCE_PX = 24;
/** Allowance for the filter affordance button. */
const FILTER_ICON_ALLOWANCE_PX = 28;
/** Allowance for the nested-row disclosure chevron button. */
const EXPAND_TOGGLE_ALLOWANCE_PX = 28;
/** Checkbox glyph + gap used by boolean display cells. */
const BOOLEAN_CHECKBOX_ALLOWANCE_PX = 24;
/** Bounded sample size for cell value measurement. */
const SAMPLE_LIMIT = 200;
/** Bounded node count when scanning nested data for depth/sampling. */
const FLATTEN_LIMIT = 5e3;
function getColumnId(col) {
	const c = col;
	return c.id ?? c.accessorKey ?? "";
}
function getColumnValue(col, row, index) {
	if (col.accessorFn) return col.accessorFn(row, index);
	if (col.accessorKey) return row[col.accessorKey];
}
function sampleIndices(total) {
	if (total <= SAMPLE_LIMIT) return Array.from({ length: total }, (_, i) => i);
	const indices = [];
	const firstChunk = Math.floor(SAMPLE_LIMIT / 2);
	for (let i = 0; i < firstChunk; i++) indices.push(i);
	const remaining = SAMPLE_LIMIT - firstChunk;
	const stride = (total - firstChunk) / remaining;
	for (let i = 0; i < remaining; i++) indices.push(Math.min(total - 1, Math.floor(firstChunk + i * stride)));
	return indices;
}
/**
* Computes the natural width of every column from header + sampled cell text
* (spec §14). Pure and deterministic — exported for tests; the hook wraps it.
*/
function computeAutoWidths({ columns, data, getSubRows, enableExpanding, measure = measureTextWidth }) {
	const widths = /* @__PURE__ */ new Map();
	const flat = enableExpanding ? flattenWithDepth(data, getSubRows, FLATTEN_LIMIT) : data.map((row) => ({
		row,
		depth: 0
	}));
	const maxDepth = flat.reduce((acc, r) => Math.max(acc, r.depth), 0);
	const indices = sampleIndices(flat.length);
	const disclosureColumnId = enableExpanding && columns[0] ? getColumnId(columns[0]) : null;
	for (const col of columns) {
		const c = col;
		const id = getColumnId(col);
		const meta = col.meta ?? {};
		const headerLabel = typeof col.header === "string" ? col.header : "";
		let headerWidth = CELL_H_PADDING_PX;
		if (headerLabel) headerWidth += measure(headerLabel, HEADER_FONT);
		if (col.enableSorting !== false) headerWidth += SORT_ICON_ALLOWANCE_PX;
		if (col.enableColumnFilter === true) headerWidth += FILTER_ICON_ALLOWANCE_PX;
		headerWidth = Math.max(headerWidth, 48);
		let contentWidth;
		if (meta.fixedMeasureWidth !== void 0) contentWidth = meta.fixedMeasureWidth + CELL_H_PADDING_PX;
		else if (meta.inputType === "boolean" && !meta.measureText) contentWidth = BOOLEAN_CHECKBOX_ALLOWANCE_PX + Math.max(measure("Yes", CELL_FONT), measure("No", CELL_FONT)) + CELL_H_PADDING_PX;
		else {
			let maxText = 0;
			for (const index of indices) {
				const entry = flat[index];
				if (!entry) continue;
				const text = meta.measureText ? meta.measureText(entry.row) : String(getColumnValue(c, entry.row, index) ?? "");
				if (!text) continue;
				const w = measure(text, CELL_FONT);
				if (w > maxText) maxText = w;
			}
			contentWidth = maxText + CELL_H_PADDING_PX;
		}
		if (id === disclosureColumnId) contentWidth += EXPAND_TOGGLE_ALLOWANCE_PX + maxDepth * 20;
		const upper = Math.max(headerWidth, meta.maxColumnWidth ?? 480);
		const width = Math.min(Math.max(contentWidth, headerWidth), upper);
		widths.set(id, Math.ceil(width));
	}
	return widths;
}
function mapsEqual(a, b) {
	if (a === null || a.size !== b.size) return false;
	for (const [k, v] of b) if (a.get(k) !== v) return false;
	return true;
}
/**
* Pre-paint auto column widths. Widths resolve in a layout effect (before the
* browser paints) so there is never a visible layout shift; during SSR the
* caller falls back to MIN_COLUMN_WIDTH_PX.
*/
function useAutoColumnWidths(options) {
	const [autoWidths, setAutoWidths] = useState(null);
	const latest = useRef(options);
	latest.current = options;
	const columnsKey = options.columns.map(getColumnId).join("\0");
	useLayoutEffect(() => {
		const opts = latest.current;
		if (!opts.measure && !canMeasureText()) return;
		const next = computeAutoWidths(opts);
		setAutoWidths((prev) => mapsEqual(prev, next) ? prev : next);
	}, [
		options.data,
		columnsKey,
		options.enableExpanding,
		options.getSubRows,
		options.measure
	]);
	return autoWidths;
}
//#endregion
//#region src/hooks/useIsomorphicLayoutEffect.ts
/**
* `useLayoutEffect` on the client (pre-paint DOM reads/writes), `useEffect`
* during SSR so React doesn't warn.
*/
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
//#endregion
//#region src/hooks/useColumnVirtualization.ts
const OVERSCAN_COLUMNS = 3;
/**
* Pixels of buffer the rendered window must keep beyond both viewport edges.
* The window is only recomputed when the viewport eats into this margin, so
* steady scrolling commits once per window refill instead of once per column.
*/
const SLACK_PX = 120;
/** Pixels rendered behind the trailing edge after a refill. */
const BACK_PX = 240;
/** Minimum pixels rendered ahead of the leading edge after a refill. */
const LEAD_MIN_PX = 600;
/** Lookahead horizon: render what the viewport will reach within this time. */
const LEAD_TIME_MS = 250;
/**
* Computes the visible index range of the scrollable (non-pinned) columns from
* the current scrollLeft, the cumulative widths, and the visible pane width.
* Pure — exported for tests.
*/
function computeColumnRange(scrollLeft, paneWidth, offsets, overscan = OVERSCAN_COLUMNS) {
	const count = offsets.length - 1;
	if (count <= 0) return {
		start: 0,
		end: -1
	};
	const window = computeWindowRange(scrollLeft, scrollLeft + paneWidth, offsets);
	return {
		start: Math.max(0, window.start - overscan),
		end: Math.min(count - 1, window.end + overscan)
	};
}
/**
* Index range of the columns intersecting [windowLeft, windowRight], in pixels.
* Pure — exported for tests.
*/
function computeWindowRange(windowLeft, windowRight, offsets) {
	const count = offsets.length - 1;
	if (count <= 0) return {
		start: 0,
		end: -1
	};
	let lo = 0;
	let hi = count - 1;
	while (lo < hi) {
		const mid = lo + hi >> 1;
		if ((offsets[mid + 1] ?? 0) <= windowLeft) lo = mid + 1;
		else hi = mid;
	}
	const first = lo;
	let last = first;
	while (last + 1 < count && (offsets[last + 1] ?? 0) < windowRight) last++;
	return {
		start: first,
		end: last
	};
}
/** Prefix sums of column widths: offsets[i] = left edge of column i; offsets[n] = total. */
function computeOffsets(widths) {
	const offsets = new Array(widths.length + 1);
	offsets[0] = 0;
	for (let i = 0; i < widths.length; i++) offsets[i + 1] = (offsets[i] ?? 0) + (widths[i] ?? 0);
	return offsets;
}
/**
* Manual column virtualization for the scroll pane (spec §13.2).
*
* The rendered window is wider than the viewport and held until the viewport
* scrolls within SLACK_PX of its edge (hysteresis), then refilled with extra
* columns ahead of the scroll direction sized by the current scroll velocity.
* Fast horizontal scrolling therefore reveals pre-rendered columns instead of
* waiting for a React commit per column boundary.
*/
function useColumnVirtualization(widths, paneWidth, getScrollLeft) {
	const offsets = useMemo(() => computeOffsets(widths), [widths]);
	const totalWidth = offsets[offsets.length - 1] ?? 0;
	const [range, setRange] = useState(() => computeColumnRange(0, paneWidth || 1920, offsets));
	const sampleRef = useRef({
		left: 0,
		time: 0
	});
	const update = useCallback((force) => {
		const count = offsets.length - 1;
		const pane = paneWidth || 1920;
		const left = getScrollLeft();
		const now = typeof performance !== "undefined" ? performance.now() : Date.now();
		const prev = sampleRef.current;
		const dt = now - prev.time;
		const velocity = !force && dt > 0 && dt < 120 ? (left - prev.left) / dt : 0;
		sampleRef.current = {
			left,
			time: now
		};
		setRange((current) => {
			if (count <= 0) return current.start === 0 && current.end === -1 ? current : {
				start: 0,
				end: -1
			};
			if (!force && current.end >= current.start) {
				const coveredLeft = offsets[current.start] ?? 0;
				const coveredRight = offsets[current.end + 1] ?? 0;
				const needLeft = Math.max(0, left - SLACK_PX);
				const needRight = Math.min(totalWidth, left + pane + SLACK_PX);
				if (coveredLeft <= needLeft && coveredRight >= needRight) return current;
			}
			const lead = Math.min(Math.max(LEAD_MIN_PX, Math.abs(velocity) * LEAD_TIME_MS), Math.max(800, pane));
			const forward = velocity >= 0;
			const next = computeWindowRange(left - (forward ? BACK_PX : lead), left + pane + (forward ? lead : BACK_PX), offsets);
			return current.start === next.start && current.end === next.end ? current : next;
		});
	}, [
		offsets,
		paneWidth,
		getScrollLeft,
		totalWidth
	]);
	useIsomorphicLayoutEffect(() => {
		update(true);
	}, [update]);
	return {
		range,
		offsets,
		totalWidth,
		onScroll: useCallback(() => update(false), [update])
	};
}
//#endregion
//#region src/hooks/useLocalStorageState.ts
/**
* Like useState, but persists to localStorage under `key` when a key is given.
* SSR-safe: the stored value is applied on the client only; reads are lazy.
*/
function useLocalStorageState(key, initialValue) {
	const [value, setValue] = useState(() => {
		if (!key || typeof window === "undefined") return initialValue;
		try {
			const raw = window.localStorage.getItem(key);
			return raw === null ? initialValue : JSON.parse(raw);
		} catch {
			return initialValue;
		}
	});
	const keyRef = useRef(key);
	keyRef.current = key;
	useEffect(() => {
		if (!keyRef.current || typeof window === "undefined") return;
		try {
			window.localStorage.setItem(keyRef.current, JSON.stringify(value));
		} catch {}
	}, [value]);
	return [value, useCallback((next) => {
		setValue((prev) => typeof next === "function" ? next(prev) : next);
	}, [])];
}
//#endregion
//#region src/hooks/useRowSelectionBridge.ts
function toRecord(ids) {
	const record = {};
	for (const id of ids) record[id] = true;
	return record;
}
function toIds(state) {
	return Object.keys(state).filter((k) => state[k]);
}
/**
* Bridges TanStack's keyed RowSelectionState to the flat `selectedRowIds`
* public API (spec §11). Controlled when `selectedRowIds` is provided,
* uncontrolled (with change callback) otherwise.
*/
function useRowSelectionBridge(selectedRowIds, onSelectedRowIdsChange) {
	const isControlled = selectedRowIds !== void 0;
	const [internal, setInternal] = useState({});
	const state = useMemo(() => isControlled ? toRecord(selectedRowIds) : internal, [
		isControlled,
		selectedRowIds,
		internal
	]);
	const stateRef = useRef(state);
	stateRef.current = state;
	const onChangeRef = useRef(onSelectedRowIdsChange);
	onChangeRef.current = onSelectedRowIdsChange;
	return [state, useCallback((updater) => {
		const next = typeof updater === "function" ? updater(stateRef.current) : updater;
		if (!isControlled) setInternal(next);
		onChangeRef.current?.(toIds(next));
	}, [isControlled])];
}
//#endregion
//#region src/lib/cell.ts
/**
* Extracts a cell's editable string value: `String(value)`, or `''` for
* null/undefined (spec §7.5).
*/
function getCellEditValue(row, columnId) {
	const value = row[columnId];
	return value === null || value === void 0 ? "" : String(value);
}
//#endregion
//#region src/lib/cn.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region src/lib/aggregates.ts
function toNumber(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}
function isNonEmpty(value) {
	return value !== null && value !== void 0 && value !== "";
}
/**
* Computes a footer aggregate over raw cell values. Numeric aggregates ignore
* non-numeric values; `count` tallies non-empty values. Returns null when no
* value participates (so the caller can render nothing).
*/
function computeAggregate(kind, values) {
	if (kind === "count") return values.reduce((acc, v) => isNonEmpty(v) ? acc + 1 : acc, 0);
	const numbers = [];
	for (const value of values) {
		const n = toNumber(value);
		if (n !== null) numbers.push(n);
	}
	if (numbers.length === 0) return null;
	switch (kind) {
		case "sum": return numbers.reduce((a, b) => a + b, 0);
		case "avg": return numbers.reduce((a, b) => a + b, 0) / numbers.length;
		case "min": return Math.min(...numbers);
		case "max": return Math.max(...numbers);
	}
}
/** Default footer formatter. */
function formatAggregate(value, format) {
	return format ? format(value) : value.toLocaleString();
}
//#endregion
//#region src/lib/filtering.ts
/** True when the filter value no longer restricts anything. */
function isEmptyFilterValue(value) {
	if (value === null || value === void 0) return true;
	const v = value;
	return (v.text === void 0 || v.text === "") && (v.checkedValues ?? null) === null;
}
/** Core predicate shared by the table filterFn and cross-tab intersection. */
function matchesFilterValue(cellValue, filterValue) {
	const text = String(cellValue ?? "");
	if (filterValue.text) {
		if (!text.toLowerCase().includes(filterValue.text.toLowerCase())) return false;
	}
	if (filterValue.checkedValues) {
		if (!filterValue.checkedValues.has(text)) return false;
	}
	return true;
}
/**
* Default column filter: case-insensitive "includes" text search combined with
* a faceted checklist of exact values (spec §10.1).
*/
const tgxFilterFn = (row, columnId, filterValue) => {
	if (isEmptyFilterValue(filterValue)) return true;
	return matchesFilterValue(row.getValue(columnId), filterValue);
};
tgxFilterFn.autoRemove = (value) => isEmptyFilterValue(value);
//#endregion
//#region src/ui/button.tsx
const buttonVariants = cva("group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none active:scale-[0.97] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/90",
			destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
			outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
			secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
			ghost: "hover:bg-muted hover:text-foreground"
		},
		size: {
			default: "h-9 gap-1.5 px-4 py-2",
			sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
			icon: "size-9",
			"icon-sm": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
const Button = React.forwardRef(({ className, variant, size, asChild = false, type, ...props }, ref) => {
	return /* @__PURE__ */ jsx(asChild ? Slot : "button", {
		ref,
		"data-slot": "button",
		type: asChild ? type : type ?? "button",
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
});
Button.displayName = "Button";
//#endregion
//#region src/ui/checkbox.tsx
const Checkbox = React.forwardRef(({ className, checked, ...props }, ref) => /* @__PURE__ */ jsx(CheckboxPrimitive.Root, {
	ref,
	"data-slot": "checkbox",
	checked,
	className: cn("peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input outline-none transition-colors", "after:absolute after:-inset-x-3 after:-inset-y-2", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", "disabled:cursor-not-allowed disabled:opacity-50", "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground", className),
	...props,
	children: /* @__PURE__ */ jsx(CheckboxPrimitive.Indicator, {
		className: "grid place-content-center text-current transition-none [&>svg]:size-3.5",
		children: checked === "indeterminate" ? /* @__PURE__ */ jsx(MinusIcon, {}) : /* @__PURE__ */ jsx(CheckIcon, {})
	})
}));
Checkbox.displayName = "Checkbox";
//#endregion
//#region src/ui/alert-dialog.tsx
const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxs(AlertDialogPrimitive.Portal, { children: [/* @__PURE__ */ jsx(AlertDialogPrimitive.Overlay, {
	"data-slot": "alert-dialog-overlay",
	"data-tgx-fade": "",
	className: "fixed inset-0 z-50 bg-black/50"
}), /* @__PURE__ */ jsx(AlertDialogPrimitive.Content, {
	ref,
	"data-slot": "alert-dialog-content",
	"data-tgx-dialog": "",
	className: cn("fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg sm:max-w-lg", className),
	...props
})] }));
AlertDialogContent.displayName = "AlertDialogContent";
function AlertDialogHeader({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "alert-dialog-header",
		className: cn("flex flex-col gap-2 text-center sm:text-left", className),
		...props
	});
}
function AlertDialogFooter({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "alert-dialog-footer",
		className: cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
		...props
	});
}
const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(AlertDialogPrimitive.Title, {
	ref,
	"data-slot": "alert-dialog-title",
	className: cn("text-lg font-semibold", className),
	...props
}));
AlertDialogTitle.displayName = "AlertDialogTitle";
const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(AlertDialogPrimitive.Description, {
	ref,
	"data-slot": "alert-dialog-description",
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
AlertDialogDescription.displayName = "AlertDialogDescription";
const AlertDialogAction = React.forwardRef(({ className, variant = "default", ...props }, ref) => /* @__PURE__ */ jsx(AlertDialogPrimitive.Action, {
	ref,
	className: cn(buttonVariants({ variant }), className),
	...props
}));
AlertDialogAction.displayName = "AlertDialogAction";
const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(AlertDialogPrimitive.Cancel, {
	ref,
	className: cn(buttonVariants({ variant: "outline" }), className),
	...props
}));
AlertDialogCancel.displayName = "AlertDialogCancel";
//#endregion
//#region src/ui/tooltip.tsx
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(TooltipPrimitive.Portal, { children: /* @__PURE__ */ jsx(TooltipPrimitive.Content, {
	ref,
	"data-slot": "tooltip-content",
	"data-tgx-pop": "",
	sideOffset,
	className: cn("z-50 w-fit rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md", className),
	...props
}) }));
TooltipContent.displayName = "TooltipContent";
//#endregion
//#region src/core/CellActions.tsx
/** Swallows every event that could leak into row/cell behaviors (spec §20.2). */
function isolate(e) {
	e.stopPropagation();
}
function ActionButton({ action, row, isSubmitting }) {
	const [busy, setBusy] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const disabled = busy || isSubmitting === true || action.isDisabled?.(row) === true;
	const run = async (event) => {
		const result = action.onClick(row, event);
		if (result instanceof Promise) {
			setBusy(true);
			try {
				await result;
			} finally {
				setBusy(false);
			}
		}
	};
	const handleClick = (event) => {
		isolate(event);
		if (disabled) return;
		if (action.confirm) {
			setConfirmOpen(true);
			return;
		}
		run(event);
	};
	const iconOnly = !action.label;
	let button = /* @__PURE__ */ jsxs(Button, {
		variant: action.variant ?? "ghost",
		size: iconOnly ? "icon-sm" : "sm",
		disabled,
		"aria-label": action.ariaLabel ?? action.label,
		"aria-busy": busy || void 0,
		"data-tgx-cell-action": action.id,
		onClick: handleClick,
		onDoubleClick: isolate,
		onMouseDown: isolate,
		onPointerDown: isolate,
		children: [busy ? /* @__PURE__ */ jsx(Loader2Icon, { className: "animate-spin" }) : action.icon, action.label]
	});
	if (action.tooltip) button = /* @__PURE__ */ jsx(TooltipProvider, {
		delayDuration: 300,
		children: /* @__PURE__ */ jsxs(Tooltip, { children: [/* @__PURE__ */ jsx(TooltipTrigger, {
			asChild: true,
			children: button
		}), /* @__PURE__ */ jsx(TooltipContent, { children: action.tooltip })] })
	});
	if (!action.confirm) return button;
	return /* @__PURE__ */ jsxs(Fragment, { children: [button, /* @__PURE__ */ jsx(AlertDialog, {
		open: confirmOpen,
		onOpenChange: setConfirmOpen,
		children: /* @__PURE__ */ jsxs(AlertDialogContent, {
			onClick: isolate,
			onDoubleClick: isolate,
			children: [/* @__PURE__ */ jsxs(AlertDialogHeader, { children: [/* @__PURE__ */ jsx(AlertDialogTitle, { children: action.confirm.title }), action.confirm.description && /* @__PURE__ */ jsx(AlertDialogDescription, { children: action.confirm.description })] }), /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [/* @__PURE__ */ jsx(AlertDialogCancel, { children: "Cancel" }), /* @__PURE__ */ jsx(AlertDialogAction, {
				variant: action.variant === "destructive" ? "destructive" : "default",
				onClick: (event) => {
					isolate(event);
					setConfirmOpen(false);
					run(event);
				},
				children: action.confirm.confirmLabel ?? "Confirm"
			})] })]
		})
	})] });
}
/**
* Declarative cell action buttons (spec §20). Right-aligned after the value,
* click-isolated from selection/expansion/edit, with hidden/disabled/confirm/
* busy states.
*/
function CellActions({ actions, row, isSubmitting }) {
	const visible = actions.filter((action) => action.isHidden?.(row) !== true);
	if (visible.length === 0) return null;
	return /* @__PURE__ */ jsx("span", {
		className: "ml-auto flex shrink-0 items-center gap-1 pl-1",
		onClick: isolate,
		onDoubleClick: isolate,
		children: visible.map((action) => /* @__PURE__ */ jsx(ActionButton, {
			action,
			row,
			isSubmitting
		}, action.id))
	});
}
//#endregion
//#region src/ui/input.tsx
const Input = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("input", {
	ref,
	"data-slot": "input",
	className: cn("h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm", "placeholder:text-muted-foreground", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50", className),
	...props
}));
Input.displayName = "Input";
//#endregion
//#region src/ui/select.tsx
const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectTrigger = React.forwardRef(({ className, size = "default", children, ...props }, ref) => /* @__PURE__ */ jsxs(SelectPrimitive.Trigger, {
	ref,
	"data-slot": "select-trigger",
	"data-size": size,
	className: cn("flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none", "data-[size=default]:h-8 data-[size=sm]:h-7", "data-[placeholder]:text-muted-foreground", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", "disabled:cursor-not-allowed disabled:opacity-50", "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", "[&[data-state=open]>svg:last-child]:rotate-180", className),
	...props,
	children: [children, /* @__PURE__ */ jsx(SelectPrimitive.Icon, {
		asChild: true,
		children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "text-muted-foreground transition-transform duration-150" })
	})]
}));
SelectTrigger.displayName = "SelectTrigger";
const SelectContent = React.forwardRef(({ className, children, position = "popper", ...props }, ref) => /* @__PURE__ */ jsx(SelectPrimitive.Portal, { children: /* @__PURE__ */ jsxs(SelectPrimitive.Content, {
	ref,
	"data-slot": "select-content",
	"data-tgx-pop": "",
	position,
	sideOffset: 4,
	className: cn("relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10", position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]", className),
	...props,
	children: [
		/* @__PURE__ */ jsx(SelectPrimitive.ScrollUpButton, {
			className: "flex h-6 items-center justify-center text-muted-foreground",
			children: /* @__PURE__ */ jsx(ChevronUpIcon, { className: "size-4" })
		}),
		/* @__PURE__ */ jsx(SelectPrimitive.Viewport, {
			className: "p-1",
			children
		}),
		/* @__PURE__ */ jsx(SelectPrimitive.ScrollDownButton, {
			className: "flex h-6 items-center justify-center text-muted-foreground",
			children: /* @__PURE__ */ jsx(ChevronDownIcon, { className: "size-4" })
		})
	]
}) }));
SelectContent.displayName = "SelectContent";
const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(SelectPrimitive.Item, {
	ref,
	"data-slot": "select-item",
	className: cn("relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none", "focus:bg-accent focus:text-accent-foreground", "data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
	...props,
	children: [/* @__PURE__ */ jsx("span", {
		className: "absolute right-2 flex size-3.5 items-center justify-center",
		children: /* @__PURE__ */ jsx(SelectPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) })
	}), /* @__PURE__ */ jsx(SelectPrimitive.ItemText, { children })]
}));
SelectItem.displayName = "SelectItem";
//#endregion
//#region src/ui/textarea.tsx
const Textarea = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("textarea", {
	ref,
	"data-slot": "textarea",
	className: cn("flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none md:text-sm", "placeholder:text-muted-foreground", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50", className),
	...props
}));
Textarea.displayName = "Textarea";
//#endregion
//#region src/core/CellEditors.tsx
function parseNumber(raw) {
	const trimmed = raw.trim();
	if (trimmed === "") return "";
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : raw;
}
/**
* Renders the editor matching `meta.inputType` (spec §7.3) with the §7.4
* commit/cancel/navigation key handling.
*/
function CellEditor({ inputType, selectOptions, initialValue, disabled, onCommit, onCancel }) {
	const [value, setValue] = useState(initialValue);
	const doneRef = useRef(false);
	const commit = (v, nav) => {
		if (doneRef.current) return;
		doneRef.current = true;
		onCommit(v, nav);
	};
	const cancel = () => {
		if (doneRef.current) return;
		doneRef.current = true;
		onCancel();
	};
	const handleNavKeys = (e, current) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			cancel();
			return true;
		}
		if (e.key === "Tab") {
			e.preventDefault();
			e.stopPropagation();
			commit(current, e.shiftKey ? "prev" : "next");
			return true;
		}
		return false;
	};
	const wrap = (children) => /* @__PURE__ */ jsx(motion.div, {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		transition: { duration: .12 },
		className: "flex min-w-0 flex-1 items-center",
		onClick: (e) => e.stopPropagation(),
		onDoubleClick: (e) => e.stopPropagation(),
		children
	});
	if (inputType === "boolean") {
		const checked = value === "true";
		return wrap(/* @__PURE__ */ jsxs("label", {
			className: "my-1.5 flex items-center gap-2 text-sm",
			children: [/* @__PURE__ */ jsx(Checkbox, {
				autoFocus: true,
				checked,
				disabled,
				onCheckedChange: (next) => {
					setValue(String(next === true));
					commit(next === true);
				},
				onKeyDown: (e) => {
					if (handleNavKeys(e, checked)) return;
					if (e.key === "Enter") {
						e.preventDefault();
						commit(checked);
					}
				},
				onBlur: () => commit(checked),
				"aria-label": "Edit boolean value"
			}), checked ? "Yes" : "No"]
		}));
	}
	if (inputType === "select") return wrap(/* @__PURE__ */ jsxs(Select, {
		defaultOpen: true,
		value: value || void 0,
		disabled,
		onValueChange: (next) => {
			setValue(next);
			commit(next);
		},
		onOpenChange: (open) => {
			if (!open) cancel();
		},
		children: [/* @__PURE__ */ jsx(SelectTrigger, {
			size: "sm",
			autoFocus: true,
			className: "my-1.5 h-8 w-full min-w-0",
			onKeyDown: (e) => {
				handleNavKeys(e, value);
			},
			children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select…" })
		}), /* @__PURE__ */ jsx(SelectContent, { children: (selectOptions ?? []).map((option) => /* @__PURE__ */ jsx(SelectItem, {
			value: option.value,
			children: option.label
		}, option.value)) })]
	}));
	if (inputType === "number") return wrap(/* @__PURE__ */ jsx(Input, {
		autoFocus: true,
		type: "number",
		inputMode: "decimal",
		value,
		disabled,
		className: "my-1.5 h-8 w-full min-w-0",
		onChange: (e) => setValue(e.target.value),
		onKeyDown: (e) => {
			if (handleNavKeys(e, parseNumber(value))) return;
			if (e.key === "Enter") {
				e.preventDefault();
				commit(parseNumber(value));
			}
		},
		onBlur: () => commit(parseNumber(value)),
		onFocus: (e) => e.target.select(),
		"aria-label": "Edit number value"
	}));
	return wrap(/* @__PURE__ */ jsx(Textarea, {
		autoFocus: true,
		rows: 1,
		value,
		disabled,
		className: "my-1.5 min-h-11 w-full min-w-0 resize-none py-2",
		onChange: (e) => setValue(e.target.value),
		onKeyDown: (e) => {
			if (handleNavKeys(e, value)) return;
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				commit(value);
			}
		},
		onBlur: () => commit(value),
		onFocus: (e) => {
			const el = e.target;
			el.setSelectionRange(el.value.length, el.value.length);
		},
		"aria-label": "Edit text value"
	}));
}
//#endregion
//#region src/core/ExpandToggle.tsx
/** Disclosure chevron for nested parent rows; rotates on expand (spec §19.2). */
function ExpandToggle({ expanded, onToggle }) {
	return /* @__PURE__ */ jsx(Button, {
		variant: "ghost",
		size: "icon-sm",
		className: "size-6 shrink-0 text-muted-foreground",
		"aria-label": expanded ? "Collapse row" : "Expand row",
		"aria-expanded": expanded,
		onClick: (e) => {
			e.stopPropagation();
			onToggle();
		},
		onDoubleClick: (e) => e.stopPropagation(),
		children: /* @__PURE__ */ jsx(motion.span, {
			className: "flex",
			animate: { rotate: expanded ? 90 : 0 },
			transition: {
				type: "spring",
				stiffness: 500,
				damping: 35
			},
			children: /* @__PURE__ */ jsx(ChevronRightIcon, {})
		})
	});
}
//#endregion
//#region src/core/BodyCell.tsx
/** Single body cell renderer implementing the spec §6 decision order. */
function BodyCellInner({ cell, width, isEditing, canEdit, singleClickEdit, editorsDisabled, isSubmitting, initialEditValue, onBeginEdit, onCommitEdit, onCancelEdit, onDirectBooleanSave, showExpandControl, className }) {
	const meta = cell.column.columnDef.meta ?? {};
	const row = cell.row;
	const isBoolean = meta.inputType === "boolean";
	const actions = meta.actions;
	const interactiveBoolean = canEdit && isBoolean && singleClickEdit && !editorsDisabled;
	const beginEdit = () => {
		if (!canEdit || isEditing || editorsDisabled) return;
		onBeginEdit(cell);
	};
	const clickProps = {};
	if (canEdit && !isEditing) if (singleClickEdit) {
		if (!isBoolean) clickProps.onClick = beginEdit;
	} else clickProps.onDoubleClick = beginEdit;
	let content;
	if (isEditing) content = /* @__PURE__ */ jsx(CellEditor, {
		inputType: meta.inputType ?? "text",
		selectOptions: meta.selectOptions,
		initialValue: initialEditValue,
		disabled: editorsDisabled,
		onCommit: (value, nav) => onCommitEdit(cell, value, nav),
		onCancel: onCancelEdit
	});
	else if (isBoolean) {
		const checked = Boolean(row.original[cell.column.id] ?? cell.getValue());
		content = /* @__PURE__ */ jsxs("span", {
			className: "flex min-w-0 items-center gap-2 text-sm",
			children: [interactiveBoolean ? /* @__PURE__ */ jsx(Checkbox, {
				checked,
				disabled: isSubmitting,
				"aria-label": checked ? "Yes" : "No",
				onClick: (e) => e.stopPropagation(),
				onCheckedChange: (next) => onDirectBooleanSave(cell, next === true)
			}) : /* @__PURE__ */ jsx("span", {
				role: "checkbox",
				"aria-checked": checked,
				"aria-disabled": "true",
				"aria-label": checked ? "Yes" : "No",
				className: cn("flex size-4 shrink-0 cursor-not-allowed items-center justify-center rounded-[4px] border border-input opacity-50", checked && "border-primary bg-primary text-primary-foreground"),
				children: checked && /* @__PURE__ */ jsx(CheckIcon, { className: "size-3.5" })
			}), /* @__PURE__ */ jsx("span", {
				className: "truncate text-muted-foreground",
				children: checked ? "Yes" : "No"
			})]
		});
	} else content = /* @__PURE__ */ jsx("span", {
		className: "min-w-0 flex-1 truncate",
		children: flexRender(cell.column.columnDef.cell, cell.getContext())
	});
	return /* @__PURE__ */ jsxs("div", {
		"data-tgx-cell": cell.column.id,
		className: cn("group/cell flex items-center gap-1 overflow-hidden px-3 text-sm", canEdit && !isEditing && "cursor-pointer", className),
		style: {
			width,
			height: 56
		},
		...clickProps,
		children: [
			showExpandControl && /* @__PURE__ */ jsx("span", {
				className: "flex shrink-0 items-center",
				style: { paddingLeft: row.depth * 20 },
				children: row.getCanExpand() ? /* @__PURE__ */ jsx(ExpandToggle, {
					expanded: row.getIsExpanded(),
					onToggle: () => row.toggleExpanded()
				}) : /* @__PURE__ */ jsx("span", {
					className: "inline-block size-6 shrink-0",
					"aria-hidden": true
				})
			}),
			content,
			canEdit && !isEditing && !isBoolean && /* @__PURE__ */ jsx(PencilIcon, {
				"aria-hidden": true,
				className: "size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/cell:opacity-60"
			}),
			actions && actions.length > 0 && /* @__PURE__ */ jsx(CellActions, {
				actions,
				row: row.original,
				isSubmitting
			})
		]
	});
}
const BodyCell = React.memo(BodyCellInner);
//#endregion
//#region src/ui/dropdown-menu.tsx
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.Content, {
	ref,
	"data-slot": "dropdown-menu-content",
	"data-tgx-pop": "",
	sideOffset,
	className: cn("z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10", className),
	...props
}) }));
DropdownMenuContent.displayName = "DropdownMenuContent";
const DropdownMenuItem = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Item, {
	ref,
	"data-slot": "dropdown-menu-item",
	className: cn("relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none", "focus:bg-accent focus:text-accent-foreground", "data-[disabled]:pointer-events-none data-[disabled]:opacity-50", "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
	...props
}));
DropdownMenuItem.displayName = "DropdownMenuItem";
const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => /* @__PURE__ */ jsxs(DropdownMenuPrimitive.CheckboxItem, {
	ref,
	"data-slot": "dropdown-menu-checkbox-item",
	checked,
	className: cn("relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none", "focus:bg-accent focus:text-accent-foreground", "data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
	...props,
	children: [/* @__PURE__ */ jsx("span", {
		className: "pointer-events-none absolute right-2 flex size-3.5 items-center justify-center",
		children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) })
	}), children]
}));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";
function DropdownMenuLabel({ className, ...props }) {
	return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Label, {
		"data-slot": "dropdown-menu-label",
		className: cn("px-1.5 py-1 text-xs font-medium text-muted-foreground", className),
		...props
	});
}
function DropdownMenuSeparator({ className, ...props }) {
	return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Separator, {
		"data-slot": "dropdown-menu-separator",
		className: cn("-mx-1 my-1 h-px bg-border", className),
		...props
	});
}
//#endregion
//#region src/core/ColumnVisibilityPicker.tsx
/** Toolbar dropdown listing hideable columns (spec §12). */
function ColumnVisibilityPicker({ items, onToggle, className }) {
	const hiddenCount = items.filter((i) => !i.visible).length;
	if (items.length === 0) return null;
	return /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
		asChild: true,
		children: /* @__PURE__ */ jsxs(Button, {
			variant: "outline",
			size: "sm",
			className: cn("shrink-0", className),
			children: [
				/* @__PURE__ */ jsx(Columns3Icon, { className: "mr-1 size-4" }),
				"Columns",
				hiddenCount > 0 && /* @__PURE__ */ jsx("span", {
					className: "ml-1.5 rounded bg-primary/15 px-1.5 text-xs text-primary tabular-nums",
					children: hiddenCount
				})
			]
		})
	}), /* @__PURE__ */ jsxs(DropdownMenuContent, {
		align: "end",
		className: "w-56",
		children: [
			/* @__PURE__ */ jsx(DropdownMenuLabel, { children: "Toggle columns" }),
			/* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
			/* @__PURE__ */ jsx("div", {
				className: "tgx-scrollbar max-h-72 overflow-y-auto",
				children: items.map((item) => /* @__PURE__ */ jsx(DropdownMenuCheckboxItem, {
					checked: item.visible,
					onSelect: (e) => e.preventDefault(),
					onCheckedChange: (checked) => onToggle(item.id, checked === true),
					children: /* @__PURE__ */ jsx("span", {
						className: "truncate",
						children: item.label
					})
				}, item.id))
			})
		]
	})] });
}
//#endregion
//#region src/ui/badge.tsx
const badgeVariants = cva("inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:size-3", {
	variants: { variant: {
		default: "border-transparent bg-primary text-primary-foreground",
		secondary: "border-transparent bg-secondary text-secondary-foreground",
		destructive: "border-transparent bg-destructive text-destructive-foreground",
		outline: "border-border text-foreground"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant, ...props }) {
	return /* @__PURE__ */ jsx("span", {
		"data-slot": "badge",
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
//#endregion
//#region src/core/FilterBadges.tsx
/** Removable active-filter badges + clear-all (spec §10.2). */
function FilterBadges({ items, onClearAll, className }) {
	if (items.length === 0) return null;
	return /* @__PURE__ */ jsxs("div", {
		className: cn("flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5", className),
		"data-tgx-filter-badges": "",
		children: [/* @__PURE__ */ jsx(AnimatePresence, {
			initial: false,
			children: items.map((item) => /* @__PURE__ */ jsx(motion.span, {
				layout: true,
				initial: {
					opacity: 0,
					y: -4
				},
				animate: {
					opacity: 1,
					y: 0
				},
				exit: {
					opacity: 0,
					scale: .9
				},
				transition: { duration: .15 },
				children: /* @__PURE__ */ jsxs(Badge, {
					variant: "secondary",
					className: "gap-1 pr-1",
					children: [/* @__PURE__ */ jsx("span", {
						className: "max-w-56 truncate",
						children: item.label
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": `Clear filter: ${item.label}`,
						className: "rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
						onClick: item.onClear,
						children: /* @__PURE__ */ jsx(XIcon, { className: "size-3" })
					})]
				})
			}, item.key))
		}), items.length > 1 && /* @__PURE__ */ jsx(Button, {
			variant: "ghost",
			size: "sm",
			className: "h-6 px-2 text-xs text-muted-foreground",
			onClick: onClearAll,
			children: "Clear all"
		})]
	});
}
/** Builds a human-readable badge description for a ColumnFilterValue. */
function describeFilterValue(value) {
	const parts = [];
	if (value.text) parts.push(`"${value.text}"`);
	if (value.checkedValues) parts.push(`${value.checkedValues.size} selected`);
	return parts.join(", ");
}
//#endregion
//#region src/ui/button-group.tsx
function ButtonGroup({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "button-group",
		role: "group",
		className: cn("flex w-fit items-stretch [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none", className),
		...props
	});
}
//#endregion
//#region src/ui/popover.tsx
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(PopoverPrimitive.Portal, { children: /* @__PURE__ */ jsx(PopoverPrimitive.Content, {
	ref,
	"data-slot": "popover-content",
	"data-tgx-pop": "",
	align,
	sideOffset,
	className: cn("z-50 flex w-72 flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden", className),
	...props
}) }));
PopoverContent.displayName = "PopoverContent";
//#endregion
//#region src/core/FilterPopover.tsx
const ITEM_HEIGHT_PX = 28;
const LIST_MAX_HEIGHT_PX = ITEM_HEIGHT_PX * 8;
const LIST_OVERSCAN = 5;
function normalize(next, allValues) {
	let checked = next.checkedValues;
	if (checked && checked.size === allValues.length) checked = null;
	if (!next.text && checked === null) return void 0;
	return {
		text: next.text,
		checkedValues: checked
	};
}
/**
* Per-column filter popover: text search + virtualized faceted checklist
* (spec §10.1).
*/
function FilterPopover({ columnLabel, value, getUniqueValues, onChange }) {
	const [open, setOpen] = useState(false);
	const [scrollTop, setScrollTop] = useState(0);
	const text = value?.text ?? "";
	const checkedValues = value?.checkedValues ?? null;
	const isActive = value !== void 0 && (text !== "" || checkedValues !== null);
	const uniqueValues = useMemo(() => open ? getUniqueValues() : [], [open, getUniqueValues]);
	const visibleValues = useMemo(() => {
		if (!text) return uniqueValues;
		const needle = text.toLowerCase();
		return uniqueValues.filter((v) => v.toLowerCase().includes(needle));
	}, [uniqueValues, text]);
	const update = (partial) => {
		onChange(normalize({
			text,
			checkedValues,
			...partial
		}, uniqueValues));
	};
	const isChecked = (v) => checkedValues === null ? true : checkedValues.has(v);
	const toggleValue = (v) => {
		const next = new Set(checkedValues === null ? uniqueValues : checkedValues);
		if (next.has(v)) next.delete(v);
		else next.add(v);
		update({ checkedValues: next });
	};
	const total = visibleValues.length;
	const listHeight = Math.min(total * ITEM_HEIGHT_PX, LIST_MAX_HEIGHT_PX);
	const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT_PX) - LIST_OVERSCAN);
	const end = Math.min(total, Math.ceil((scrollTop + LIST_MAX_HEIGHT_PX) / ITEM_HEIGHT_PX) + LIST_OVERSCAN);
	return /* @__PURE__ */ jsxs(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ jsx(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ jsx(Button, {
				variant: "ghost",
				size: "icon-sm",
				className: cn("size-6 text-muted-foreground hover:text-foreground", isActive && "text-primary hover:text-primary"),
				"aria-label": `Filter ${columnLabel}`,
				onClick: (e) => e.stopPropagation(),
				onDoubleClick: (e) => e.stopPropagation(),
				onKeyDown: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ jsx(ListFilterIcon, {})
			})
		}), /* @__PURE__ */ jsxs(PopoverContent, {
			align: "start",
			className: "w-60 origin-top-left p-3",
			onClick: (e) => e.stopPropagation(),
			onDoubleClick: (e) => e.stopPropagation(),
			onKeyDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "relative",
					children: [/* @__PURE__ */ jsx(Input, {
						autoFocus: true,
						value: text,
						placeholder: `Search ${columnLabel.toLowerCase()}…`,
						className: "h-8 pr-7 text-xs",
						onChange: (e) => update({ text: e.target.value })
					}), text !== "" && /* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Clear search",
						className: "absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground",
						onClick: () => update({ text: "" }),
						children: /* @__PURE__ */ jsx(XIcon, { className: "size-3.5" })
					})]
				}),
				/* @__PURE__ */ jsxs(ButtonGroup, {
					className: "mb-2",
					children: [/* @__PURE__ */ jsx(Button, {
						variant: "outline",
						size: "sm",
						className: "h-7 px-2.5 text-xs",
						onClick: () => update({ checkedValues: null }),
						children: "Select all"
					}), /* @__PURE__ */ jsx(Button, {
						variant: "outline",
						size: "sm",
						className: "h-7 px-2.5 text-xs",
						onClick: () => update({ checkedValues: /* @__PURE__ */ new Set() }),
						children: "Deselect all"
					})]
				}),
				total === 0 ? /* @__PURE__ */ jsx("div", {
					className: "px-1 py-2 text-xs text-muted-foreground",
					children: "No values"
				}) : /* @__PURE__ */ jsx("div", {
					className: "tgx-scrollbar overflow-y-auto",
					style: {
						maxHeight: LIST_MAX_HEIGHT_PX,
						height: listHeight
					},
					onScroll: (e) => setScrollTop(e.currentTarget.scrollTop),
					children: /* @__PURE__ */ jsx("div", {
						className: "relative",
						style: { height: total * ITEM_HEIGHT_PX },
						children: visibleValues.slice(start, end).map((v, i) => {
							return /* @__PURE__ */ jsxs("label", {
								className: "absolute right-0 left-0 flex cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-muted/60",
								style: {
									top: (start + i) * ITEM_HEIGHT_PX,
									height: ITEM_HEIGHT_PX
								},
								children: [/* @__PURE__ */ jsx(Checkbox, {
									checked: isChecked(v),
									onCheckedChange: () => toggleValue(v)
								}), /* @__PURE__ */ jsx("span", {
									className: "truncate",
									children: v === "" ? "(empty)" : v
								})]
							}, v);
						})
					})
				})
			]
		})]
	});
}
//#endregion
//#region src/core/HeaderCell.tsx
/** Below this width the filter icon is hidden (spec §10.3). */
const HIDE_FILTER_BELOW_PX = 56;
/** Below this width the sort icon is hidden (spec §10.3). */
const HIDE_SORT_BELOW_PX = 100;
function HeaderCellInner({ header, width, sorted, sortIndex, sortedCount, columnLabel, filterable, filterValue, getUniqueValues, onFilterChange, canResize, onResize, className }) {
	const column = header.column;
	const canSort = column.getCanSort();
	const dragState = useRef(null);
	const showSortIcon = canSort && width >= HIDE_SORT_BELOW_PX;
	const showFilterIcon = filterable && width >= HIDE_FILTER_BELOW_PX;
	const toggleSort = canSort ? column.getToggleSortingHandler() : void 0;
	return /* @__PURE__ */ jsxs("div", {
		"data-tgx-header": column.id,
		role: canSort ? "button" : void 0,
		tabIndex: canSort ? 0 : void 0,
		"aria-sort": sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : void 0,
		className: cn("relative flex shrink-0 items-center gap-1 overflow-hidden px-3 text-sm font-medium select-none", canSort && "cursor-pointer transition-colors hover:text-foreground", sorted ? "text-foreground" : "text-muted-foreground", className),
		style: {
			width,
			height: 48
		},
		onClick: toggleSort,
		onKeyDown: (e) => {
			if (!canSort) return;
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				toggleSort?.(e);
			}
		},
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "truncate",
				children: header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext())
			}),
			showSortIcon && /* @__PURE__ */ jsxs("span", {
				className: "flex shrink-0 items-center",
				"aria-hidden": true,
				children: [sorted === "asc" ? /* @__PURE__ */ jsx(ArrowUpIcon, { className: "size-3.5" }) : sorted === "desc" ? /* @__PURE__ */ jsx(ArrowDownIcon, { className: "size-3.5" }) : /* @__PURE__ */ jsx(ChevronsUpDownIcon, { className: "size-3.5 opacity-40" }), sorted && sortedCount > 1 && sortIndex >= 0 && /* @__PURE__ */ jsx("span", {
					className: "ml-0.5 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary tabular-nums",
					children: sortIndex + 1
				})]
			}),
			showFilterIcon && /* @__PURE__ */ jsx("span", {
				className: "ml-auto flex shrink-0 items-center",
				children: /* @__PURE__ */ jsx(FilterPopover, {
					columnLabel,
					value: filterValue,
					getUniqueValues: () => getUniqueValues(column),
					onChange: (next) => onFilterChange(column, next)
				})
			}),
			canResize && /* @__PURE__ */ jsx("div", {
				role: "separator",
				"aria-orientation": "vertical",
				"aria-label": `Resize ${columnLabel} column`,
				tabIndex: 0,
				className: "group/resize absolute top-0 right-0 flex h-full w-1.5 cursor-col-resize justify-end outline-none",
				onClick: (e) => e.stopPropagation(),
				onDoubleClick: (e) => e.stopPropagation(),
				onPointerDown: (e) => {
					e.stopPropagation();
					e.preventDefault();
					e.currentTarget.setPointerCapture(e.pointerId);
					dragState.current = {
						startX: e.clientX,
						startWidth: width
					};
				},
				onPointerMove: (e) => {
					const drag = dragState.current;
					if (!drag) return;
					const next = Math.max(48, drag.startWidth + (e.clientX - drag.startX));
					onResize(column.id, next);
				},
				onPointerUp: (e) => {
					dragState.current = null;
					e.currentTarget.releasePointerCapture(e.pointerId);
				},
				onKeyDown: (e) => {
					if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
						e.preventDefault();
						e.stopPropagation();
						const delta = e.key === "ArrowLeft" ? -8 : 8;
						onResize(column.id, Math.max(48, width + delta));
					}
				},
				children: /* @__PURE__ */ jsx("span", {
					"aria-hidden": true,
					className: "h-full w-px bg-border transition-all group-hover/resize:w-[3px] group-hover/resize:bg-primary group-focus-visible/resize:w-[3px] group-focus-visible/resize:bg-primary"
				})
			})
		]
	});
}
const HeaderCell = React.memo(HeaderCellInner);
//#endregion
//#region src/ui/skeleton.tsx
function Skeleton({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "skeleton",
		className: cn("animate-pulse rounded-md bg-muted", className),
		...props
	});
}
//#endregion
//#region src/core/TableSkeleton.tsx
const BODY_WIDTH_CYCLE = [
	"75%",
	"50%",
	"85%",
	"40%",
	"65%"
];
/** Loading skeleton mirroring the grid layout at the real column widths (spec §17). */
function TableSkeleton({ widths, rowCount = 8, className }) {
	const cols = widths.length > 0 ? widths : [
		200,
		200,
		200
	];
	return /* @__PURE__ */ jsxs("div", {
		className: cn("min-w-full", className),
		"data-tgx-skeleton": "",
		"aria-busy": "true",
		children: [/* @__PURE__ */ jsx("div", {
			className: "flex items-center border-b border-border bg-(--tgx-header-bg)",
			style: { height: 48 },
			children: cols.map((w, i) => /* @__PURE__ */ jsx("div", {
				className: "flex shrink-0 items-center px-3",
				style: { width: w },
				children: /* @__PURE__ */ jsx(Skeleton, { className: "h-4 w-3/4" })
			}, i))
		}), Array.from({ length: rowCount }, (_, r) => /* @__PURE__ */ jsx("div", {
			className: "flex items-center border-b border-border",
			style: { height: 56 },
			children: cols.map((w, c) => /* @__PURE__ */ jsx("div", {
				className: "flex shrink-0 items-center px-3",
				style: { width: w },
				children: /* @__PURE__ */ jsx(Skeleton, {
					className: "h-3.5",
					style: { width: BODY_WIDTH_CYCLE[(r + c) % BODY_WIDTH_CYCLE.length] }
				})
			}, c))
		}, r))]
	});
}
//#endregion
//#region src/core/TableCore.tsx
const GROUP_HEADER_HEIGHT_PX = 32;
const FOOTER_HEIGHT_PX = 40;
const ROW_OVERSCAN = 8;
const CHUNK_COLUMNS = 8;
const PINNED_BODY_BG_CLASSES = "bg-card transition-colors group-hover:bg-(--tgx-row-hover-bg) group-data-[selected]:bg-(--tgx-row-selected-bg) group-hover:group-data-[selected]:bg-(--tgx-row-selected-hover-bg)";
function headerLabelOf(columnDef, id, columnLabel) {
	if (columnLabel) return columnLabel(id);
	return typeof columnDef.header === "string" ? columnDef.header : id;
}
function renderBodyCell(cell, width, stateKey, ctx) {
	const columnId = cell.column.id;
	const { editing } = ctx;
	const isEditingCell = editing !== null && editing.columnId === columnId;
	return /* @__PURE__ */ jsx(BodyCell, {
		cell,
		width,
		isEditing: isEditingCell,
		canEdit: ctx.canEditColumn(columnId, cell.column.columnDef.meta),
		singleClickEdit: ctx.singleClickEdit,
		editorsDisabled: ctx.editorsDisabled,
		isSubmitting: ctx.isSubmitting,
		initialEditValue: isEditingCell && editing ? editing.initialValue : "",
		onBeginEdit: ctx.onBeginEdit,
		onCommitEdit: ctx.onCommitEdit,
		onCancelEdit: ctx.onCancelEdit,
		onDirectBooleanSave: ctx.onDirectBooleanSave,
		showExpandControl: columnId === ctx.expandColumnId,
		stateKey,
		className: cn(ctx.bodyCellClassName, ctx.getCellClassName?.(ctx.row.original, columnId))
	}, columnId);
}
function RowCellChunkInner(props) {
	const { row, chunk, left, pinnedCount, expandColumnId, isExpanded } = props;
	const cells = row.getVisibleCells();
	const from = pinnedCount + chunk * CHUNK_COLUMNS;
	const slice = cells.slice(from, from + CHUNK_COLUMNS);
	return /* @__PURE__ */ jsx("div", {
		className: "absolute top-0 bottom-0 flex",
		style: { left },
		children: slice.map((cell) => renderBodyCell(cell, props.widthOf(cell.column.id), cell.column.id === expandColumnId ? isExpanded : void 0, props))
	});
}
const RowCellChunk = React.memo(RowCellChunkInner);
function VirtualRowInner(props) {
	const { row, top, pinnedCount, pinnedWidth, chunkFrom, chunkTo, chunkLeftOf, pinnedWidthOf, expandColumnId, isSelected, isSomeSelected, isExpanded, bodyRowClassName, pinnedPaneX } = props;
	const cells = row.getVisibleCells();
	let expandChunk = -1;
	if (expandColumnId !== null) {
		const idx = cells.findIndex((c) => c.column.id === expandColumnId);
		if (idx >= pinnedCount) expandChunk = Math.floor((idx - pinnedCount) / CHUNK_COLUMNS);
	}
	const chunks = [];
	for (let chunk = Math.max(0, chunkFrom); chunk <= chunkTo; chunk++) chunks.push(/* @__PURE__ */ jsx(RowCellChunk, {
		chunk,
		left: chunkLeftOf(chunk),
		isExpanded: chunk === expandChunk ? isExpanded : false,
		row,
		pinnedCount,
		columnsKey: props.columnsKey,
		widthOf: props.widthOf,
		expandColumnId,
		editing: props.editing,
		editorsDisabled: props.editorsDisabled,
		isSubmitting: props.isSubmitting,
		singleClickEdit: props.singleClickEdit,
		canEditColumn: props.canEditColumn,
		onBeginEdit: props.onBeginEdit,
		onCommitEdit: props.onCommitEdit,
		onCancelEdit: props.onCancelEdit,
		onDirectBooleanSave: props.onDirectBooleanSave,
		getCellClassName: props.getCellClassName,
		bodyCellClassName: props.bodyCellClassName
	}, chunk));
	return /* @__PURE__ */ jsxs("div", {
		"data-tgx-row": row.id,
		"data-selected": isSelected ? "" : void 0,
		className: cn("group absolute top-0 left-0 flex w-full border-b border-border bg-card transition-colors hover:bg-(--tgx-row-hover-bg) data-[selected]:bg-(--tgx-row-selected-bg) hover:data-[selected]:bg-(--tgx-row-selected-hover-bg)", bodyRowClassName),
		style: {
			height: 56,
			transform: `translateY(${top}px)`
		},
		children: [pinnedCount > 0 && /* @__PURE__ */ jsx(motion.div, {
			"data-tgx-pinned": "",
			className: cn("sticky left-0 z-10 flex h-full shrink-0 border-r border-border", PINNED_BODY_BG_CLASSES),
			style: {
				width: pinnedWidth,
				x: pinnedPaneX
			},
			children: cells.slice(0, pinnedCount).map((cell) => renderBodyCell(cell, pinnedWidthOf(cell.column.id), cell.column.id === "__tgx_select__" ? `${isSelected}:${isSomeSelected}` : cell.column.id === expandColumnId ? isExpanded : void 0, props))
		}), chunks]
	});
}
const VirtualRow = React.memo(VirtualRowInner);
/**
* The single rendering engine behind ReadOnlyTable / EditableTable /
* TabbedTable. Owns the split frozen/scrollable pane layout, row + column
* virtualization, scroll sync, hover sync, auto widths, and column resize.
*/
function TableCore(props) {
	const { data, columns, getRowId, toolbar, maxHeight, emptyMessage = "No results found", isLoading, bordered = true, frozenColumns = 0, columnFilters: controlledFilters, onColumnFiltersChange, initialSorting, measure, columnLabel, classNames, enableMultiSort = false, enableRowSelection = false, selectedRowIds, onSelectedRowIdsChange, enableColumnVisibility = false, columnVisibilityStorageKey, enableFooter = false, enableExpanding = false, getSubRows, expanded: controlledExpanded, onExpandedChange, defaultExpanded, editable, editableColumnIds, onSaveEdit, isSubmitting = false, singleClickEdit = false, columnGroups, getCellClassName, controlledVisibility, onControlledVisibilityChange, controlledSorting, onControlledSortingChange, hideBuiltInPicker = false, hideFilterBadges = false, pinnedPaneX } = props;
	const [internalSorting, setInternalSorting] = useState(initialSorting ?? []);
	const sorting = controlledSorting ?? internalSorting;
	const handleSortingChange = useCallback((updater) => {
		if (onControlledSortingChange) {
			onControlledSortingChange(updater);
			return;
		}
		setInternalSorting(updater);
	}, [onControlledSortingChange]);
	const [internalFilters, setInternalFilters] = useState([]);
	const filters = controlledFilters ?? internalFilters;
	const handleFiltersChange = useCallback((updater) => {
		if (onColumnFiltersChange) onColumnFiltersChange(updater);
		if (controlledFilters === void 0) setInternalFilters(updater);
	}, [onColumnFiltersChange, controlledFilters]);
	const [storedVisibility, setStoredVisibility] = useLocalStorageState(columnVisibilityStorageKey, {});
	const visibility = controlledVisibility ?? storedVisibility;
	const handleVisibilityChange = useCallback((updater) => {
		if (onControlledVisibilityChange) {
			onControlledVisibilityChange(updater);
			return;
		}
		setStoredVisibility((prev) => typeof updater === "function" ? updater(prev) : updater);
	}, [onControlledVisibilityChange, setStoredVisibility]);
	const [rowSelection, handleRowSelectionChange] = useRowSelectionBridge(enableRowSelection ? selectedRowIds : void 0, onSelectedRowIdsChange);
	const tableRef = useRef(null);
	const [internalExpanded, setInternalExpanded] = useState(() => {
		if (defaultExpanded === true) return true;
		if (defaultExpanded && typeof defaultExpanded === "object") return defaultExpanded;
		return {};
	});
	const expandedState = controlledExpanded ?? internalExpanded;
	const expandedRef = useRef(expandedState);
	expandedRef.current = expandedState;
	const onExpandedChangeRef = useRef(onExpandedChange);
	onExpandedChangeRef.current = onExpandedChange;
	const handleExpandedChange = useCallback((updater) => {
		const next = typeof updater === "function" ? updater(expandedRef.current) : updater;
		if (controlledExpanded === void 0) setInternalExpanded(next);
		const emit = onExpandedChangeRef.current;
		if (emit) if (next === true) {
			const record = {};
			for (const row of tableRef.current?.getPreExpandedRowModel().flatRows ?? []) if (row.subRows.length > 0) record[row.id] = true;
			emit(record);
		} else emit(next);
	}, [controlledExpanded === void 0]);
	const effectiveColumns = useMemo(() => {
		if (!enableRowSelection) return columns;
		return [{
			id: SELECTION_COLUMN_ID,
			header: ({ table }) => {
				const filteredRows = table.getFilteredRowModel().flatRows;
				const allSelected = filteredRows.length > 0 && filteredRows.every((r) => r.getIsSelected());
				const someSelected = !allSelected && filteredRows.some((r) => r.getIsSelected() || r.getIsSomeSelected());
				return /* @__PURE__ */ jsx(Checkbox, {
					"aria-label": "Select all rows",
					checked: allSelected ? true : someSelected ? "indeterminate" : false,
					disabled: isSubmitting,
					onCheckedChange: (value) => {
						table.setRowSelection((prev) => {
							const next = { ...prev };
							for (const r of filteredRows) if (value === true) next[r.id] = true;
							else delete next[r.id];
							return next;
						});
					}
				});
			},
			cell: ({ row }) => /* @__PURE__ */ jsx(Checkbox, {
				"aria-label": "Select row",
				checked: row.getIsSelected() ? true : row.getIsSomeSelected() ? "indeterminate" : false,
				disabled: !row.getCanSelect() || isSubmitting,
				onClick: (e) => e.stopPropagation(),
				onDoubleClick: (e) => e.stopPropagation(),
				onCheckedChange: (value) => row.toggleSelected(value === true)
			}),
			enableSorting: false,
			enableColumnFilter: false,
			enableHiding: false,
			enableResizing: false
		}, ...columns];
	}, [
		columns,
		enableRowSelection,
		isSubmitting
	]);
	const effectiveSorting = useMemo(() => {
		const ids = new Set(effectiveColumns.map((c) => c.id ?? c.accessorKey).filter((id) => typeof id === "string"));
		return sorting.every((s) => ids.has(s.id)) ? sorting : sorting.filter((s) => ids.has(s.id));
	}, [effectiveColumns, sorting]);
	const getRowIdString = useCallback((row) => String(getRowId(row)), [getRowId]);
	const table = useReactTable({
		data,
		columns: effectiveColumns,
		state: {
			sorting: effectiveSorting,
			columnFilters: filters,
			columnVisibility: visibility,
			rowSelection,
			expanded: enableExpanding ? expandedState : {}
		},
		onSortingChange: handleSortingChange,
		onColumnFiltersChange: handleFiltersChange,
		onColumnVisibilityChange: handleVisibilityChange,
		onRowSelectionChange: handleRowSelectionChange,
		onExpandedChange: handleExpandedChange,
		getRowId: getRowIdString,
		getSubRows: enableExpanding ? getSubRows : void 0,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		filterFromLeafRows: true,
		enableMultiSort,
		isMultiSortEvent: (e) => e.shiftKey,
		enableRowSelection,
		enableSubRowSelection: true,
		autoResetExpanded: false,
		defaultColumn: { filterFn: tgxFilterFn }
	});
	tableRef.current = table;
	const autoWidths = useAutoColumnWidths({
		columns,
		data,
		getSubRows,
		enableExpanding,
		measure
	});
	const [manualWidths, setManualWidths] = useState({});
	/** After the user resizes any pinned (non-selection) column, stop shrinking sibling pinned autos to hold total at 50% — otherwise the pane stays capped until one manual column alone reaches half the viewport. */
	const [pinnedUserSized, setPinnedUserSized] = useState(false);
	const pinnedColumnIdsRef = useRef(/* @__PURE__ */ new Set());
	const widthOf = useCallback((columnId) => {
		if (columnId === "__tgx_select__") return 48;
		return manualWidths[columnId] ?? autoWidths?.get(columnId) ?? 160;
	}, [manualWidths, autoWidths]);
	const scrollRef = useRef(null);
	const [viewportWidth, setViewportWidth] = useState(0);
	useIsomorphicLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			setViewportWidth(el.clientWidth);
		});
		observer.observe(el);
		setViewportWidth(el.clientWidth);
		return () => observer.disconnect();
	}, [isLoading]);
	const visibleLeafColumns = table.getVisibleLeafColumns();
	const visibleLeafColumnsRef = useRef(visibleLeafColumns);
	visibleLeafColumnsRef.current = visibleLeafColumns;
	const pinnedCount = Math.min(visibleLeafColumns.length, (enableRowSelection ? 1 : 0) + Math.max(0, frozenColumns));
	const pinnedColumns = visibleLeafColumns.slice(0, pinnedCount);
	const scrollColumns = visibleLeafColumns.slice(pinnedCount);
	pinnedColumnIdsRef.current = new Set(pinnedColumns.map((c) => c.id));
	const { pinnedWidth, flexScale } = useMemo(() => {
		if (pinnedUserSized) return {
			pinnedWidth: pinnedColumns.reduce((sum, col) => sum + widthOf(col.id), 0),
			flexScale: 1
		};
		const pinnedCap = viewportWidth > 0 ? viewportWidth * FROZEN_PANE_MAX_FRACTION : Infinity;
		let fixedSum = 0;
		let flexRawSum = 0;
		for (const col of pinnedColumns) {
			const id = col.id;
			if (id !== "__tgx_select__" && Object.hasOwn(manualWidths, id)) fixedSum += manualWidths[id] ?? 160;
			else if (id === "__tgx_select__") flexRawSum += 48;
			else flexRawSum += autoWidths?.get(id) ?? 160;
		}
		let flexScale = 1;
		if (viewportWidth > 0 && flexRawSum > 0) if (fixedSum >= pinnedCap) flexScale = 1;
		else {
			const budget = pinnedCap - fixedSum;
			if (flexRawSum > budget) flexScale = budget / flexRawSum;
		}
		return {
			pinnedWidth: fixedSum + flexRawSum * flexScale,
			flexScale
		};
	}, [
		pinnedUserSized,
		pinnedColumns,
		manualWidths,
		autoWidths,
		viewportWidth,
		widthOf
	]);
	const pinnedWidthOf = useCallback((columnId) => {
		if (pinnedUserSized) return widthOf(columnId);
		if (columnId === "__tgx_select__") return 48 * flexScale;
		if (Object.hasOwn(manualWidths, columnId)) return manualWidths[columnId] ?? 160;
		return (autoWidths?.get(columnId) ?? 160) * flexScale;
	}, [
		pinnedUserSized,
		widthOf,
		manualWidths,
		autoWidths,
		flexScale
	]);
	const scrollColumnIdsKey = scrollColumns.map((c) => c.id).join("\0");
	const visibleColumnIdsKey = pinnedColumns.map((c) => c.id).join("\0") + "" + scrollColumnIdsKey;
	const scrollWidths = useMemo(() => scrollColumnIdsKey === "" ? [] : scrollColumnIdsKey.split("\0").map((id) => widthOf(id)), [scrollColumnIdsKey, widthOf]);
	const getScrollLeft = useCallback(() => scrollRef.current?.scrollLeft ?? 0, []);
	const { range: colRange, offsets: colOffsets, totalWidth: scrollTotalWidth, onScroll: onHorizontalScroll } = useColumnVirtualization(scrollWidths, Math.max(0, viewportWidth - pinnedWidth), getScrollLeft);
	const contentWidth = pinnedWidth + scrollTotalWidth;
	const rows = table.getRowModel().rows;
	const headerOffset = 48 + (columnGroups ? GROUP_HEADER_HEIGHT_PX : 0);
	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 56,
		overscan: ROW_OVERSCAN,
		getItemKey: (index) => rows[index]?.id ?? index,
		scrollMargin: headerOffset
	});
	const [editing, setEditing] = useState(null);
	const [savePending, setSavePending] = useState(false);
	const editorsDisabled = savePending || isSubmitting;
	const editableColumnIdsRef = useRef(editableColumnIds);
	editableColumnIdsRef.current = editableColumnIds;
	const onSaveEditRef = useRef(onSaveEdit);
	onSaveEditRef.current = onSaveEdit;
	const savePendingRef = useRef(savePending);
	savePendingRef.current = savePending;
	const isSubmittingRef = useRef(isSubmitting);
	isSubmittingRef.current = isSubmitting;
	const canEditColumn = useCallback((columnId, meta) => {
		if (!editable) return false;
		if (meta?.editable !== true) return false;
		return editableColumnIdsRef.current?.includes(columnId) ?? false;
	}, [editable]);
	const findAdjacentEditable = useCallback((columnId, nav) => {
		const editableCols = visibleLeafColumnsRef.current.filter((col) => col.id !== "__tgx_select__" && canEditColumn(col.id, col.columnDef.meta));
		const index = editableCols.findIndex((col) => col.id === columnId);
		if (index === -1) return null;
		return editableCols[nav === "next" ? index + 1 : index - 1]?.id ?? null;
	}, [canEditColumn]);
	const beginEdit = useCallback((cell) => {
		setEditing({
			rowId: cell.row.id,
			columnId: cell.column.id,
			initialValue: getCellEditValue(cell.row.original, cell.column.id)
		});
	}, []);
	const cancelEdit = useCallback(() => setEditing(null), []);
	const commitEdit = useCallback((row, columnId, value, nav) => {
		(async () => {
			const moveOrClose = () => {
				if (nav) {
					const targetId = findAdjacentEditable(columnId, nav);
					if (targetId) {
						setEditing({
							rowId: row.id,
							columnId: targetId,
							initialValue: getCellEditValue(row.original, targetId)
						});
						return;
					}
				}
				setEditing(null);
			};
			const initial = getCellEditValue(row.original, columnId);
			if (String(value) === initial) {
				moveOrClose();
				return;
			}
			const save = onSaveEditRef.current;
			if (!save) {
				setEditing(null);
				return;
			}
			setSavePending(true);
			let ok = false;
			try {
				ok = await save(row.original, columnId, value);
			} catch {
				ok = false;
			} finally {
				setSavePending(false);
			}
			if (ok) moveOrClose();
			else setEditing({
				rowId: row.id,
				columnId,
				initialValue: initial
			});
		})();
	}, [findAdjacentEditable]);
	const commitEditForCell = useCallback((cell, value, nav) => commitEdit(cell.row, cell.column.id, value, nav), [commitEdit]);
	const directBooleanSave = useCallback((cell, value) => {
		const save = onSaveEditRef.current;
		if (!save || savePendingRef.current || isSubmittingRef.current) return;
		(async () => {
			setSavePending(true);
			try {
				await save(cell.row.original, cell.column.id, value);
			} finally {
				setSavePending(false);
			}
		})();
	}, []);
	useEffect(() => {
		if (!enableExpanding || filters.length === 0) return;
		if (expandedRef.current === true) return;
		const activeFilters = filters.filter((f) => !isEmptyFilterValue(f.value));
		if (activeFilters.length === 0) return;
		const toExpand = {};
		for (const row of table.getFilteredRowModel().flatRows) {
			if (row.subRows.length === 0) continue;
			if (!activeFilters.every((f) => {
				try {
					return matchesFilterValue(row.getValue(f.id), f.value);
				} catch {
					return true;
				}
			}) && !row.getIsExpanded()) toExpand[row.id] = true;
		}
		if (Object.keys(toExpand).length > 0) handleExpandedChange((prev) => prev === true ? true : {
			...prev,
			...toExpand
		});
	}, [
		enableExpanding,
		filters,
		table,
		handleExpandedChange
	]);
	const filteredRowModel = table.getFilteredRowModel();
	const footerValues = useMemo(() => {
		const map = /* @__PURE__ */ new Map();
		if (!enableFooter) return map;
		const leaves = filteredRowModel.flatRows.filter((r) => r.subRows.length === 0);
		for (const col of visibleLeafColumns) {
			const meta = col.columnDef.meta;
			if (!meta?.footerAggregate) continue;
			const computed = computeAggregate(meta.footerAggregate, leaves.map((r) => r.getValue(col.id)));
			if (computed !== null) map.set(col.id, formatAggregate(computed, meta.footerFormat));
		}
		return map;
	}, [
		enableFooter,
		filteredRowModel,
		scrollColumnIdsKey,
		pinnedCount
	]);
	const badgeItems = useMemo(() => {
		if (hideFilterBadges) return [];
		return filters.filter((f) => !isEmptyFilterValue(f.value)).map((f) => {
			const column = table.getColumn(f.id);
			const label = column ? headerLabelOf(column.columnDef, f.id, columnLabel) : f.id;
			return {
				key: f.id,
				label: `${label}: ${describeFilterValue(f.value)}`,
				onClear: () => column?.setFilterValue(void 0)
			};
		});
	}, [
		filters,
		table,
		columnLabel,
		hideFilterBadges
	]);
	const pickerItems = useMemo(() => {
		if (!enableColumnVisibility || hideBuiltInPicker || columnGroups) return [];
		const frozenIds = new Set(table.getAllLeafColumns().filter((c) => c.id !== SELECTION_COLUMN_ID).slice(0, Math.max(0, frozenColumns)).map((c) => c.id));
		return table.getAllLeafColumns().filter((col) => col.id !== "__tgx_select__" && col.getCanHide() && !frozenIds.has(col.id)).map((col) => ({
			id: col.id,
			label: headerLabelOf(col.columnDef, col.id, columnLabel),
			visible: col.getIsVisible()
		}));
	}, [
		enableColumnVisibility,
		hideBuiltInPicker,
		columnGroups,
		table,
		frozenColumns,
		columnLabel,
		visibility
	]);
	const groupSegments = useMemo(() => {
		if (!columnGroups) return null;
		const groupByColumn = /* @__PURE__ */ new Map();
		for (const group of columnGroups) for (const id of group.columnIds) groupByColumn.set(id, group);
		const build = (cols, scaled) => {
			const segments = [];
			for (const col of cols) {
				const group = col.id === "__tgx_select__" ? void 0 : groupByColumn.get(col.id);
				const width = scaled ? pinnedWidthOf(col.id) : widthOf(col.id);
				const last = segments[segments.length - 1];
				const key = group?.id ?? `__ungrouped_${col.id}`;
				if (last && group && last.key === group.id) last.width += width;
				else segments.push({
					key,
					label: group?.label ?? "",
					width
				});
			}
			return segments;
		};
		return {
			pinned: build(pinnedColumns, true),
			scroll: build(scrollColumns, false)
		};
	}, [
		columnGroups,
		scrollColumnIdsKey,
		pinnedCount,
		widthOf,
		pinnedWidthOf
	]);
	const expandColumnId = useMemo(() => {
		if (!enableExpanding) return null;
		return visibleLeafColumns.find((c) => c.id !== "__tgx_select__")?.id ?? null;
	}, [
		enableExpanding,
		scrollColumnIdsKey,
		pinnedCount
	]);
	const headerGroup = table.getHeaderGroups()[0];
	const sortedCount = effectiveSorting.length;
	const getUniqueValuesFor = useCallback((column) => {
		const set = /* @__PURE__ */ new Set();
		for (const key of column.getFacetedUniqueValues().keys()) set.add(String(key ?? ""));
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, []);
	const handleFilterChange = useCallback((column, next) => column.setFilterValue(next), []);
	const handleResize = useCallback((columnId, w) => {
		setManualWidths((prev) => ({
			...prev,
			[columnId]: w
		}));
		if (columnId !== "__tgx_select__" && pinnedColumnIdsRef.current.has(columnId)) setPinnedUserSized(true);
	}, []);
	const renderHeaderCell = (columnIndex, scaled) => {
		const header = headerGroup?.headers[columnIndex];
		if (!header) return null;
		const column = header.column;
		const width = scaled ? pinnedWidthOf(column.id) : widthOf(column.id);
		if (column.id === "__tgx_select__") return /* @__PURE__ */ jsx("div", {
			className: cn("flex shrink-0 items-center justify-center", classNames?.headerCell),
			style: {
				width,
				height: 48
			},
			children: flexRender(column.columnDef.header, header.getContext())
		}, column.id);
		const filterValue = filters.find((f) => f.id === column.id)?.value;
		return /* @__PURE__ */ jsx(HeaderCell, {
			header,
			width,
			sorted: column.getIsSorted(),
			sortIndex: column.getSortIndex(),
			sortedCount,
			columnLabel: headerLabelOf(column.columnDef, column.id, columnLabel),
			filterable: column.columnDef.enableColumnFilter === true,
			filterValue,
			getUniqueValues: getUniqueValuesFor,
			onFilterChange: handleFilterChange,
			canResize: column.getCanResize(),
			onResize: handleResize,
			className: classNames?.headerCell
		}, column.id);
	};
	const renderFooterCell = (columnId, scaled) => {
		const meta = table.getColumn(columnId)?.columnDef.meta;
		const width = scaled ? pinnedWidthOf(columnId) : widthOf(columnId);
		const content = footerValues.get(columnId) ?? meta?.footerLabel ?? "";
		return /* @__PURE__ */ jsx("div", {
			className: cn("flex shrink-0 items-center overflow-hidden px-3 text-sm font-medium", classNames?.footerCell),
			style: {
				width,
				height: FOOTER_HEIGHT_PX
			},
			children: /* @__PURE__ */ jsx("span", {
				className: "truncate",
				children: content
			})
		}, columnId);
	};
	const hasScrollWindow = colRange.end >= colRange.start;
	const chunkFrom = hasScrollWindow ? Math.floor(colRange.start / CHUNK_COLUMNS) : 0;
	const chunkTo = hasScrollWindow ? Math.floor(colRange.end / CHUNK_COLUMNS) : -1;
	const visibleScrollStart = chunkFrom * CHUNK_COLUMNS;
	const visibleScrollEnd = hasScrollWindow ? Math.min(scrollColumns.length - 1, chunkTo * CHUNK_COLUMNS + CHUNK_COLUMNS - 1) : -1;
	const scrollCellsLeft = pinnedWidth + (colOffsets[visibleScrollStart] ?? 0);
	const chunkLeftOf = useCallback((chunk) => pinnedWidth + (colOffsets[chunk * CHUNK_COLUMNS] ?? 0), [pinnedWidth, colOffsets]);
	const showRightEdge = viewportWidth > 0 && contentWidth < viewportWidth;
	const hasToolbarRow = Boolean(toolbar) || pickerItems.length > 0 || enableExpanding && !isLoading;
	const skeletonWidths = useMemo(() => {
		if (!isLoading) return [];
		return visibleLeafColumns.slice(0, 12).map((c) => widthOf(c.id));
	}, [
		isLoading,
		scrollColumnIdsKey,
		pinnedCount,
		widthOf
	]);
	return /* @__PURE__ */ jsxs("div", {
		"data-tgx-table": "",
		className: cn("flex min-h-0 min-w-0 flex-col overflow-hidden bg-card text-card-foreground", bordered && "rounded-md border border-border", !maxHeight && "flex-1", classNames?.root),
		style: maxHeight ? { maxHeight } : void 0,
		children: [
			hasToolbarRow && /* @__PURE__ */ jsxs("div", {
				"data-tgx-toolbar": "",
				className: cn("flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5", classNames?.toolbar),
				children: [toolbar, /* @__PURE__ */ jsxs("div", {
					className: "ml-auto flex shrink-0 items-center gap-2",
					children: [enableExpanding && !isLoading && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs(Button, {
						variant: "outline",
						size: "sm",
						onClick: () => table.toggleAllRowsExpanded(true),
						children: [/* @__PURE__ */ jsx(ChevronsUpDownIcon, { className: "mr-1 size-3.5" }), "Expand all"]
					}), /* @__PURE__ */ jsxs(Button, {
						variant: "outline",
						size: "sm",
						onClick: () => table.toggleAllRowsExpanded(false),
						children: [/* @__PURE__ */ jsx(ChevronsDownUpIcon, { className: "mr-1 size-3.5" }), "Collapse all"]
					})] }), pickerItems.length > 0 && /* @__PURE__ */ jsx(ColumnVisibilityPicker, {
						items: pickerItems,
						onToggle: (id, visible) => table.getColumn(id)?.toggleVisibility(visible)
					})]
				})]
			}),
			!hideFilterBadges && /* @__PURE__ */ jsx(FilterBadges, {
				items: badgeItems,
				onClearAll: () => handleFiltersChange([]),
				className: classNames?.filterBadges
			}),
			/* @__PURE__ */ jsx("div", {
				ref: scrollRef,
				className: "tgx-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain",
				onScroll: onHorizontalScroll,
				children: isLoading ? /* @__PURE__ */ jsx(TableSkeleton, {
					widths: skeletonWidths,
					className: classNames?.skeleton
				}) : /* @__PURE__ */ jsxs("div", {
					className: "relative",
					style: {
						width: contentWidth,
						minWidth: "100%"
					},
					children: [
						/* @__PURE__ */ jsxs("div", {
							"data-tgx-header-block": "",
							className: "sticky top-0 z-20",
							children: [groupSegments && /* @__PURE__ */ jsxs("div", {
								className: "relative flex w-full border-b border-border bg-(--tgx-header-bg)",
								style: { height: GROUP_HEADER_HEIGHT_PX },
								children: [/* @__PURE__ */ jsx(motion.div, {
									"data-tgx-pinned": "",
									className: "sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)",
									style: {
										width: pinnedWidth,
										x: pinnedPaneX
									},
									children: groupSegments.pinned.map((seg) => /* @__PURE__ */ jsx("div", {
										className: cn("flex shrink-0 items-center justify-center truncate border-r border-border/50 px-2 text-xs font-semibold text-muted-foreground last:border-r-0", classNames?.groupHeaderCell),
										style: { width: seg.width },
										children: seg.label
									}, seg.key))
								}), /* @__PURE__ */ jsx("div", {
									className: "flex h-full",
									children: groupSegments.scroll.map((seg) => /* @__PURE__ */ jsx("div", {
										className: cn("flex shrink-0 items-center justify-center truncate border-r border-border/50 px-2 text-xs font-semibold text-muted-foreground last:border-r-0", classNames?.groupHeaderCell),
										style: { width: seg.width },
										children: seg.label
									}, seg.key))
								})]
							}), /* @__PURE__ */ jsxs("div", {
								className: cn("relative flex w-full border-b border-border bg-(--tgx-header-bg)", classNames?.headerRow),
								style: { height: 48 },
								children: [pinnedCount > 0 && /* @__PURE__ */ jsx(motion.div, {
									"data-tgx-pinned": "",
									className: "sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)",
									style: {
										width: pinnedWidth,
										x: pinnedPaneX
									},
									children: pinnedColumns.map((_, i) => renderHeaderCell(i, true))
								}), visibleScrollEnd >= visibleScrollStart && /* @__PURE__ */ jsx("div", {
									className: "absolute top-0 bottom-0 flex",
									style: { left: scrollCellsLeft },
									children: scrollColumns.slice(visibleScrollStart, visibleScrollEnd + 1).map((_, i) => renderHeaderCell(pinnedCount + visibleScrollStart + i, false))
								})]
							})]
						}),
						rows.length === 0 ? /* @__PURE__ */ jsx("div", {
							className: cn("sticky left-0 flex items-center justify-center p-10 text-sm text-muted-foreground", classNames?.empty),
							style: { width: viewportWidth || void 0 },
							children: emptyMessage
						}) : /* @__PURE__ */ jsx("div", {
							style: {
								height: rowVirtualizer.getTotalSize(),
								position: "relative"
							},
							children: rowVirtualizer.getVirtualItems().map((vi) => {
								const row = rows[vi.index];
								if (!row) return null;
								return /* @__PURE__ */ jsx(VirtualRow, {
									row,
									top: vi.start - headerOffset,
									pinnedCount,
									pinnedWidth,
									chunkFrom,
									chunkTo,
									chunkLeftOf,
									columnsKey: visibleColumnIdsKey,
									widthOf,
									pinnedWidthOf,
									expandColumnId,
									editing: editing !== null && editing.rowId === row.id ? editing : null,
									editorsDisabled,
									isSubmitting,
									singleClickEdit,
									isSelected: row.getIsSelected(),
									isSomeSelected: row.getIsSomeSelected(),
									isExpanded: row.getIsExpanded(),
									canEditColumn,
									onBeginEdit: beginEdit,
									onCommitEdit: commitEditForCell,
									onCancelEdit: cancelEdit,
									onDirectBooleanSave: directBooleanSave,
									getCellClassName,
									bodyRowClassName: classNames?.bodyRow,
									bodyCellClassName: classNames?.bodyCell,
									pinnedPaneX
								}, row.id);
							})
						}),
						enableFooter && rows.length > 0 && /* @__PURE__ */ jsxs("div", {
							"data-tgx-footer-row": "",
							className: cn("sticky bottom-0 z-20 flex w-full border-t border-border bg-(--tgx-header-bg)", classNames?.footerRow),
							style: { height: FOOTER_HEIGHT_PX },
							children: [pinnedCount > 0 && /* @__PURE__ */ jsx(motion.div, {
								"data-tgx-pinned": "",
								className: "sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)",
								style: {
									width: pinnedWidth,
									x: pinnedPaneX
								},
								children: pinnedColumns.map((col) => renderFooterCell(col.id, true))
							}), visibleScrollEnd >= visibleScrollStart && /* @__PURE__ */ jsx("div", {
								className: "absolute top-0 bottom-0 flex",
								style: { left: scrollCellsLeft },
								children: scrollColumns.slice(visibleScrollStart, visibleScrollEnd + 1).map((col) => renderFooterCell(col.id, false))
							})]
						}),
						showRightEdge && /* @__PURE__ */ jsx("div", {
							"aria-hidden": true,
							className: "pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-border",
							style: { left: contentWidth - 1 }
						})
					]
				})
			})
		]
	});
}
//#endregion
//#region src/components/ReadOnlyTable.tsx
/** Display-only grid: TableCore with `editable={false}` (spec §4). */
function ReadOnlyTable(props) {
	return /* @__PURE__ */ jsx(TableCore, {
		...props,
		editable: false
	});
}
//#endregion
//#region src/components/EditableTable.tsx
/** Inline-editing grid: TableCore with `editable={true}` (spec §4, §7). */
function EditableTable(props) {
	return /* @__PURE__ */ jsx(TableCore, {
		...props,
		editable: true
	});
}
//#endregion
//#region src/hooks/useSharedTabFilters.ts
function buildAccessors(columns) {
	const map = /* @__PURE__ */ new Map();
	for (const col of columns) {
		const c = col;
		const id = c.id ?? c.accessorKey;
		if (!id) continue;
		if (c.accessorFn) {
			const fn = c.accessorFn;
			map.set(id, (row) => fn(row, 0));
		} else if (c.accessorKey) {
			const key = c.accessorKey;
			map.set(id, (row) => row[key]);
		}
	}
	return map;
}
function rowPasses(row, filters, accessors, getSubRows) {
	if (filters.every((f) => {
		const accessor = accessors.get(f.id);
		if (!accessor) return true;
		return matchesFilterValue(accessor(row), f.value);
	})) return true;
	const subRows = getSubRows?.(row);
	if (!subRows) return false;
	return subRows.some((child) => rowPasses(child, filters, accessors, getSubRows));
}
/**
* Cross-tab shared filtering (spec §18.3): each tab keeps its own
* ColumnFiltersState; displayed rows are the intersection of the row-id sets
* passing each tab's filters, keyed by `idColumn` / getRowId.
*/
function useSharedTabFilters(options) {
	const { data, getRowId, tabs, getSubRows } = options;
	const [filtersByTab, setFiltersByTab] = useState({});
	const setFiltersForTab = useCallback((tabId) => (updater) => {
		setFiltersByTab((prev) => {
			const current = prev[tabId] ?? [];
			const next = typeof updater === "function" ? updater(current) : updater;
			return {
				...prev,
				[tabId]: next
			};
		});
	}, []);
	const passingSets = useMemo(() => {
		const sets = /* @__PURE__ */ new Map();
		for (const tab of tabs) {
			const filters = (filtersByTab[tab.id] ?? []).filter((f) => !isEmptyFilterValue(f.value));
			if (filters.length === 0) continue;
			const accessors = buildAccessors(tab.columns);
			const set = /* @__PURE__ */ new Set();
			for (const row of data) if (rowPasses(row, filters, accessors, getSubRows)) set.add(String(getRowId(row)));
			sets.set(tab.id, set);
		}
		return sets;
	}, [
		tabs,
		filtersByTab,
		data,
		getRowId,
		getSubRows
	]);
	return {
		filtersByTab,
		setFiltersForTab,
		dataForTab: useCallback((tabId) => {
			const otherSets = [];
			for (const [id, set] of passingSets) if (id !== tabId) otherSets.push(set);
			if (otherSets.length === 0) return data;
			return data.filter((row) => {
				const id = String(getRowId(row));
				return otherSets.every((set) => set.has(id));
			});
		}, [
			data,
			getRowId,
			passingSets
		]),
		activeFilters: useMemo(() => {
			const out = [];
			for (const tab of tabs) for (const f of filtersByTab[tab.id] ?? []) if (!isEmptyFilterValue(f.value)) out.push({
				tabId: tab.id,
				columnId: f.id,
				value: f.value
			});
			return out;
		}, [tabs, filtersByTab]),
		clearFilter: useCallback((tabId, columnId) => {
			setFiltersByTab((prev) => ({
				...prev,
				[tabId]: (prev[tabId] ?? []).filter((f) => f.id !== columnId)
			}));
		}, []),
		clearAll: useCallback(() => setFiltersByTab({}), [])
	};
}
//#endregion
//#region src/components/TabbedTable.tsx
const slideTransition = {
	type: "spring",
	stiffness: 320,
	damping: 34
};
const panelVariants = {
	enter: ({ dir, width }) => ({ x: dir > 0 ? width : -width }),
	center: { x: 0 },
	exit: ({ dir, width }) => ({ x: dir > 0 ? -width : width })
};
function TabPanel({ custom, onSettled, children }) {
	const x = useMotionValue(0);
	const pinnedPaneX = useTransform(x, (v) => -v);
	return /* @__PURE__ */ jsx(motion.div, {
		className: "absolute inset-0 flex min-h-0 min-w-0 flex-col",
		style: { x },
		custom,
		variants: panelVariants,
		initial: "enter",
		animate: "center",
		exit: "exit",
		transition: slideTransition,
		onAnimationComplete: (definition) => {
			if (definition === "center") onSettled();
		},
		children: children(pinnedPaneX)
	});
}
/**
* Multiple table views (tabs) over the same rows, with cross-tab filter
* intersection, shared selection, and a folder-tab strip (spec §18).
*/
function TabbedTable(props) {
	const { data, getRowId, tabs, activeTabId: controlledActiveId, defaultTabId, onActiveTabChange, actions, emptyMessage, isLoading, columnVisibilityStorageKeyBase, tabIndicatorLayoutId, measure, classNames, enableMultiSort, enableRowSelection, selectedRowIds, onSelectedRowIdsChange, enableColumnVisibility, enableFooter, enableExpanding, getSubRows, defaultExpanded } = props;
	const autoLayoutId = useId();
	const indicatorLayoutId = tabIndicatorLayoutId ?? `tgx-tab-indicator-${autoLayoutId}`;
	const [internalActiveId, setInternalActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? "");
	const activeId = controlledActiveId ?? internalActiveId;
	const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeId));
	const activeTab = tabs[activeIndex];
	const prevRef = useRef({
		id: activeId,
		index: activeIndex
	});
	const dirRef = useRef(1);
	if (prevRef.current.id !== activeId) {
		dirRef.current = activeIndex >= prevRef.current.index ? 1 : -1;
		prevRef.current = {
			id: activeId,
			index: activeIndex
		};
	}
	const direction = dirRef.current;
	const [isSliding, setIsSliding] = useState(false);
	const [slideTracker, setSlideTracker] = useState(activeId);
	if (slideTracker !== activeId) {
		setSlideTracker(activeId);
		setIsSliding(true);
	}
	const handleSlideSettled = useCallback(() => setIsSliding(false), []);
	const selectTab = (id) => {
		if (id === activeId) return;
		if (controlledActiveId === void 0) setInternalActiveId(id);
		onActiveTabChange?.(id);
	};
	const [internalSelected, setInternalSelected] = useState([]);
	const effectiveSelected = enableRowSelection ? selectedRowIds ?? internalSelected : void 0;
	const handleSelectedChange = useCallback((ids) => {
		setInternalSelected(ids);
		onSelectedRowIdsChange?.(ids);
	}, [onSelectedRowIdsChange]);
	const { filtersByTab, setFiltersForTab, dataForTab, activeFilters, clearFilter, clearAll } = useSharedTabFilters({
		data,
		getRowId,
		tabs,
		getSubRows
	});
	const columnLabelFor = useCallback((tab, columnId) => {
		if (tab.columnLabel) return tab.columnLabel(columnId);
		const col = tab.columns.find((c) => getColumnId(c) === columnId);
		return col && typeof col.header === "string" ? col.header : columnId;
	}, []);
	const badgeItems = activeFilters.map((f) => {
		const tab = tabs.find((t) => t.id === f.tabId);
		const colLabel = tab ? columnLabelFor(tab, f.columnId) : f.columnId;
		return {
			key: `${f.tabId}:${f.columnId}`,
			label: `${tab?.label ?? f.tabId} • ${colLabel}: ${describeFilterValue(f.value)}`,
			onClear: () => clearFilter(f.tabId, f.columnId)
		};
	});
	const [sharedSorting, setSharedSorting] = useState(() => {
		return tabs.find((t) => t.id === (controlledActiveId ?? defaultTabId ?? tabs[0]?.id))?.initialSorting ?? tabs.find((t) => t.initialSorting)?.initialSorting ?? [];
	});
	const handleSortingChange = useCallback((updater) => {
		setSharedSorting((prev) => typeof updater === "function" ? updater(prev) : updater);
	}, []);
	const storageKeyFor = useCallback((tab) => tab.columnVisibilityStorageKey ?? (columnVisibilityStorageKeyBase ? `${columnVisibilityStorageKeyBase}:${tab.id}` : void 0), [columnVisibilityStorageKeyBase]);
	const [visibilityByTab, setVisibilityByTab] = useState(() => {
		const out = {};
		if (typeof window === "undefined") return out;
		for (const tab of tabs) {
			const key = storageKeyFor(tab);
			if (!key) continue;
			try {
				const raw = window.localStorage.getItem(key);
				if (raw) out[tab.id] = JSON.parse(raw);
			} catch {}
		}
		return out;
	});
	const makeVisibilityHandler = useCallback((tab) => (updater) => {
		setVisibilityByTab((prev) => {
			const current = prev[tab.id] ?? {};
			const next = typeof updater === "function" ? updater(current) : updater;
			const key = storageKeyFor(tab);
			if (key && typeof window !== "undefined") try {
				window.localStorage.setItem(key, JSON.stringify(next));
			} catch {}
			return {
				...prev,
				[tab.id]: next
			};
		});
	}, [storageKeyFor]);
	const pickerItems = enableColumnVisibility && activeTab && !(activeTab.editable && activeTab.columnGroups) ? activeTab.columns.map((c) => c).filter((c, index) => {
		if (c.enableHiding === false) return false;
		return index >= (activeTab.frozenColumns ?? 0);
	}).map((c) => {
		const id = getColumnId(c);
		return {
			id,
			label: columnLabelFor(activeTab, id),
			visible: (visibilityByTab[activeTab.id] ?? {})[id] !== false
		};
	}) : [];
	const hasActions = Boolean(actions) || pickerItems.length > 0;
	const panelsRef = useRef(null);
	const [panelWidth, setPanelWidth] = useState(0);
	useIsomorphicLayoutEffect(() => {
		const el = panelsRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => setPanelWidth(el.clientWidth));
		observer.observe(el);
		setPanelWidth(el.clientWidth);
		return () => observer.disconnect();
	}, []);
	const slideCustom = {
		dir: direction,
		width: panelWidth || 1280
	};
	return /* @__PURE__ */ jsxs("div", {
		"data-tgx-tabbed-table": "",
		className: cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card", classNames?.container),
		children: [/* @__PURE__ */ jsxs("div", {
			"data-tgx-tab-strip": "",
			className: cn("flex shrink-0 items-stretch gap-3 border-b border-border bg-muted/40 pr-2", classNames?.tabStrip),
			children: [
				/* @__PURE__ */ jsx("div", {
					className: "flex shrink-0 items-end",
					children: tabs.map((tab) => {
						const isActive = tab.id === activeId;
						return /* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: () => selectTab(tab.id),
							className: cn("relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors", isActive ? cn("border-border bg-card text-foreground", classNames?.activeTab) : cn("border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground", classNames?.inactiveTab), classNames?.tab),
							children: [
								isActive && /* @__PURE__ */ jsx("span", {
									"aria-hidden": true,
									className: "absolute inset-x-0 -bottom-px h-px bg-card"
								}),
								isActive && /* @__PURE__ */ jsx(motion.span, {
									layoutId: indicatorLayoutId,
									className: cn("absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary", classNames?.tabIndicator),
									transition: {
										type: "spring",
										stiffness: 400,
										damping: 30
									}
								}),
								/* @__PURE__ */ jsx("span", {
									className: "relative z-10",
									children: tab.label
								})
							]
						}, tab.id);
					})
				}),
				/* @__PURE__ */ jsx("div", {
					className: "flex min-w-0 flex-1 items-center justify-end self-center overflow-hidden",
					children: /* @__PURE__ */ jsx(FilterBadges, {
						items: badgeItems,
						onClearAll: clearAll,
						className: cn("flex-nowrap border-b-0 p-0", classNames?.filterBadges)
					})
				}),
				hasActions && /* @__PURE__ */ jsxs("div", {
					className: "flex shrink-0 items-center gap-2 self-center",
					children: [actions, pickerItems.length > 0 && activeTab && /* @__PURE__ */ jsx(ColumnVisibilityPicker, {
						items: pickerItems,
						onToggle: (id, visible) => {
							makeVisibilityHandler(activeTab)((prev) => ({
								...prev,
								[id]: visible
							}));
						}
					})]
				})
			]
		}), /* @__PURE__ */ jsx("div", {
			ref: panelsRef,
			className: cn("relative min-h-0 flex-1 overflow-hidden", isSliding && "tgx-sliding", classNames?.panel),
			children: /* @__PURE__ */ jsx(AnimatePresence, {
				initial: false,
				custom: slideCustom,
				children: activeTab && /* @__PURE__ */ jsx(TabPanel, {
					custom: slideCustom,
					onSettled: handleSlideSettled,
					children: (pinnedPaneX) => /* @__PURE__ */ jsx(TableCore, {
						data: dataForTab(activeTab.id),
						columns: activeTab.columns,
						getRowId,
						editable: activeTab.editable === true,
						editableColumnIds: activeTab.editable === true ? activeTab.editableColumnIds : void 0,
						onSaveEdit: activeTab.editable === true ? activeTab.onSaveEdit : void 0,
						singleClickEdit: activeTab.editable === true ? activeTab.singleClickEdit : void 0,
						columnGroups: activeTab.editable === true ? activeTab.columnGroups : void 0,
						getCellClassName: activeTab.editable === true ? activeTab.getCellClassName : void 0,
						isSubmitting: activeTab.editable === true ? activeTab.isSubmitting : void 0,
						bordered: false,
						frozenColumns: activeTab.frozenColumns ?? 0,
						controlledSorting: sharedSorting,
						onControlledSortingChange: handleSortingChange,
						columnLabel: activeTab.columnLabel ?? ((id) => columnLabelFor(activeTab, id)),
						columnFilters: filtersByTab[activeTab.id] ?? [],
						onColumnFiltersChange: setFiltersForTab(activeTab.id),
						controlledVisibility: visibilityByTab[activeTab.id] ?? {},
						onControlledVisibilityChange: makeVisibilityHandler(activeTab),
						hideBuiltInPicker: true,
						hideFilterBadges: true,
						enableMultiSort,
						enableRowSelection,
						selectedRowIds: effectiveSelected,
						onSelectedRowIdsChange: handleSelectedChange,
						enableColumnVisibility: false,
						enableFooter,
						enableExpanding,
						getSubRows,
						defaultExpanded,
						emptyMessage,
						isLoading,
						measure,
						classNames,
						pinnedPaneX
					})
				}, activeTab.id)
			})
		})]
	});
}
//#endregion
//#region src/lib/date.ts
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
* Parses a date-only value without timezone off-by-one errors.
* `"YYYY-MM-DD"` strings are interpreted at midnight UTC. Date instances pass
* through; anything else returns null.
*/
function parseDateSafe(value) {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value !== "string") return null;
	const match = DATE_ONLY_RE.exec(value.trim());
	if (match) {
		const [, y, m, d] = match;
		const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}
/**
* Formats a date-only value as `MM/dd/yyyy` using UTC fields so the displayed
* day never shifts with the local timezone.
*/
function formatDateSafe(value) {
	const date = parseDateSafe(value);
	if (!date) return "";
	return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCFullYear()).padStart(4, "0")}`;
}
//#endregion
//#region src/lib/columns.tsx
/** Text column: stringifies the value, filterable with the default filter. */
function textColumn(id, header, meta) {
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => String(getValue() ?? ""),
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta
	};
}
/** Number column: locale-formatted display. */
function numberColumn(id, header, meta) {
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => {
			const v = getValue();
			if (v === null || v === void 0 || v === "") return "";
			const n = typeof v === "number" ? v : Number(v);
			return Number.isFinite(n) ? n.toLocaleString() : String(v);
		},
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta: {
			inputType: "number",
			...meta
		}
	};
}
/** Boolean column: BodyCell renders the Yes/No checkbox affordance via meta.inputType. */
function booleanColumn(id, header, meta) {
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => String(getValue() ?? ""),
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta: {
			inputType: "boolean",
			...meta
		}
	};
}
/** Select column: displays the option label matching the value. */
function selectColumn(id, header, options, meta) {
	const labelFor = (value) => {
		const str = String(value ?? "");
		return options.find((o) => o.value === str)?.label ?? str;
	};
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => labelFor(getValue()),
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta: {
			inputType: "select",
			selectOptions: options,
			measureText: (row) => labelFor(row[id]),
			...meta
		}
	};
}
/** Date column: timezone-safe MM/dd/yyyy display. */
function dateColumn(id, header, meta) {
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => formatDateSafe(getValue()),
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta: {
			measureText: (row) => formatDateSafe(row[id]),
			...meta
		}
	};
}
/** Badge column: renders the value inside a Badge. */
function badgeColumn(id, header, meta) {
	return {
		id,
		header,
		accessorKey: id,
		cell: ({ getValue }) => {
			const v = getValue();
			if (v === null || v === void 0 || v === "") return null;
			return /* @__PURE__ */ jsx(Badge, {
				variant: "secondary",
				children: String(v)
			});
		},
		enableColumnFilter: true,
		filterFn: tgxFilterFn,
		meta: {
			measureText: (row) => String(row[id] ?? ""),
			...meta
		}
	};
}
//#endregion
export { ABSOLUTE_MIN_COLUMN_WIDTH_PX, EditableTable, FROZEN_PANE_MAX_FRACTION, HEADER_HEIGHT_PX, INDENT_STEP_PX, MAX_COLUMN_WIDTH_PX, MIN_COLUMN_WIDTH_PX, ROW_HEIGHT_PX, ReadOnlyTable, TabbedTable, badgeColumn, booleanColumn, canMeasureText, cn, computeAggregate, dateColumn, formatDateSafe, getCellEditValue, matchesFilterValue, measureTextWidth, numberColumn, parseDateSafe, selectColumn, textColumn, tgxFilterFn };

//# sourceMappingURL=index.js.map