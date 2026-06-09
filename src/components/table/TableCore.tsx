import { useRef, useState, useEffect, useLayoutEffect, useMemo, useContext } from 'react';
import { twMerge } from 'tailwind-merge';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flexRender } from '@tanstack/react-table';
import type { Table, Column } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, Columns3 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { TabActionsContext } from './TabbedTable';
import { BodyCell } from './BodyCell';
import { HeaderFilter } from './HeaderFilter';
import { ROW_HEIGHT_PX, HEADER_HEIGHT_PX } from './constants';
import type { TableClassNames, TableColumnMeta, NumberFormatConfig } from './types';
import { formatNumber } from './utils/formatters';

export type TableCoreProps<TRow> = {
  table: Table<TRow>;
  columnWidths: Record<string, number>;
  editable?: boolean;
  editableColumnIds?: string[];
  onSaveEdit?: (row: TRow, columnId: string, value: string | number | boolean) => Promise<boolean>;
  singleClickEdit?: boolean;
  isSubmitting?: boolean;
  getCellClassName?: (row: TRow, columnId: string) => string | undefined;
  isLoading?: boolean;
  emptyMessage?: string;
  bordered?: boolean;
  frozenColumns?: number;
  maxHeight?: string;
  animateScrollOnly?: boolean;
  tabTransitionDirection?: number;
  classNames?: TableClassNames;
  fullData?: TRow[];
  enableFooter?: boolean;
  enableColumnVisibility?: boolean;
  columnVisibilityStorageKey?: string;
  toolbar?: React.ReactNode;
  enableRowSelection?: boolean;
  numberFormatConfig?: NumberFormatConfig;
  onNumberFormatConfigChange?: (config: NumberFormatConfig) => void;
  enableNumberFormatConfig?: boolean;
  hideDecimalsControl?: boolean;
};

// Persists the native scrollbar visibility across tab unmounts to prevent visual flashing during animations
let globalScrollbarVisible = false;

export function TableCore<TRow extends Record<string, unknown>>({
  table,
  columnWidths,
  editable = false,
  editableColumnIds = [],
  onSaveEdit,
  singleClickEdit,
  isSubmitting,
  getCellClassName,
  isLoading,
  emptyMessage = 'No results found',
  bordered = true,
  frozenColumns = 0,
  maxHeight = '100%',
  animateScrollOnly,
  tabTransitionDirection = 0,
  classNames,
  fullData,
  enableFooter = false,
  enableColumnVisibility = false,
  toolbar,
  numberFormatConfig,
  onNumberFormatConfigChange,
  enableNumberFormatConfig = false,
  hideDecimalsControl = false,
}: TableCoreProps<TRow>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(!!animateScrollOnly);
  const [forcedScrollbarState] = useState(globalScrollbarVisible);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  useEffect(() => {
    // Safety fallback: if AnimatePresence skips the initial animation or it finishes early
    const t = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    // Keep global scrollbar cache perfectly synced while at rest
    if (!isAnimating && containerRef.current) {
      globalScrollbarVisible = containerRef.current.scrollWidth > containerRef.current.clientWidth;
    }
  });
  
  const [editingState, setEditingState] = useState<{rowId: string | number; columnId: string; initialValue: string} | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1000);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { rows } = table.getRowModel();

  const columnSizing = table.getState().columnSizing;
  const getColWidth = (col: any) => {
    return columnSizing[col.id] ?? columnWidths[col.id] ?? 150;
  };

  const isSelectInjected = table.getAllLeafColumns()[0]?.id === 'select';
  const actualFrozenColumns = isSelectInjected ? frozenColumns + 1 : frozenColumns;

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const pinnedCols = visibleLeafColumns.slice(0, actualFrozenColumns);
  const scrollCols = visibleLeafColumns.slice(actualFrozenColumns);

  const pinnedWidth = pinnedCols.reduce((sum, col) => sum + getColWidth(col), 0);
  
  const scrollColOffsets = useMemo(() => {
    let current = 0;
    return scrollCols.map((col, index) => {
      const w = getColWidth(col);
      const obj = { start: current, end: current + w, width: w, col, scrollIndex: index };
      current += w;
      return obj;
    });
  }, [scrollCols, columnSizing, columnWidths]);

  const scrollWidth = scrollColOffsets.length > 0 ? scrollColOffsets[scrollColOffsets.length - 1].end : 0;

  const OVERSCAN_PX = 400;
  const visibleScrollCols = useMemo(() => {
    return scrollColOffsets.filter(c => 
      c.end > scrollLeft - OVERSCAN_PX && c.start < scrollLeft + containerWidth + OVERSCAN_PX
    );
  }, [scrollColOffsets, scrollLeft, containerWidth]);

  const leftPadding = visibleScrollCols.length > 0 ? visibleScrollCols[0].start : 0;
  const rightPadding = visibleScrollCols.length > 0 ? scrollWidth - visibleScrollCols[visibleScrollCols.length - 1].end : scrollWidth;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const getFooterValue = (col: Column<TRow, unknown>): React.ReactNode => {
    const meta = col.columnDef.meta as TableColumnMeta<TRow> | undefined;
    if (!meta) return '';

    if (meta.footerLabel !== undefined) {
      return meta.footerLabel;
    }

    const aggregate = meta.footerAggregate;
    if (!aggregate) return '';

    const leafRows = rows.filter(r => !r.subRows || r.subRows.length === 0);
    const values = leafRows.map(r => r.getValue(col.id));

    let result: number | string = '';

    if (aggregate === 'count') {
      result = values.filter(v => v !== undefined && v !== null && v !== '').length;
    } else {
      const numValues = values
        .map(v => typeof v === 'string' ? parseFloat(v) : Number(v))
        .filter(v => !isNaN(v) && typeof v === 'number');

      if (numValues.length > 0) {
        if (aggregate === 'sum') {
          result = numValues.reduce((sum, v) => sum + v, 0);
        } else if (aggregate === 'avg') {
          result = numValues.reduce((sum, v) => sum + v, 0) / numValues.length;
        } else if (aggregate === 'min') {
          result = Math.min(...numValues);
        } else if (aggregate === 'max') {
          result = Math.max(...numValues);
        }
      }
    }

    if (result === '') return '';

    if (typeof result === 'number') {
      if (meta.footerFormat) {
        return meta.footerFormat(result);
      }
      if (meta.numberFormat) {
        let activeFormat = meta.numberFormat;
        if (numberFormatConfig) {
          const merged = { ...numberFormatConfig };
          if (meta.numberFormat.isInteger || meta.numberFormat.decimalPlaces === 0) {
            merged.decimalPlaces = 0;
          }
          activeFormat = { ...meta.numberFormat, ...merged };
        }
        const formatted = formatNumber(result, activeFormat);
        if (activeFormat.negativeInRed && result < 0) {
          return <span className="text-red-600 dark:text-red-400 font-medium">{formatted}</span>;
        }
        return formatted;
      }
      return result.toLocaleString();
    }
    return String(result);
  };

  const handleEnterEdit = (rowId: string | number, columnId: string, initialValue: string) => {
    if (editableColumnIds.includes(columnId)) {
      setEditingState({ rowId, columnId, initialValue });
    }
  };

  const handleSaveEdit = async (row: TRow, columnId: string, value: string | number | boolean) => {
    if (onSaveEdit) {
      return await onSaveEdit(row, columnId, value);
    }
    return true;
  };

  const renderHeaderContent = (col: Column<TRow, unknown>, header: any) => {
    if (!header) return null;
    const canSort = col.getCanSort();
    const isSorted = col.getIsSorted();
    const canFilter = col.getCanFilter();

    const sorting = table.getState().sorting || [];
    const sortIndex = sorting.findIndex(s => s.id === col.id);
    const showPriorityBadge = sorting.length > 1 && sortIndex > -1;

    return (
      <div 
        className={twMerge(`w-full h-full flex items-center pl-3 pr-1 ${canSort ? 'cursor-pointer hover:bg-table-row-hover transition-colors' : ''}`, classNames?.headerCell)}
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
      >
        <div className="flex-1 flex items-center min-w-0 pr-2">
          <span className="truncate">{flexRender(col.columnDef.header, header.getContext())}</span>
          {isSorted === 'asc' ? <ArrowUp size={14} className="ml-1 text-table-accent flex-shrink-0" /> : 
           isSorted === 'desc' ? <ArrowDown size={14} className="ml-1 text-table-accent flex-shrink-0" /> : null}
          {showPriorityBadge && (
            <span className="ml-1 px-1 py-0.5 text-[9px] font-bold leading-none bg-table-accent/15 text-table-accent dark:bg-blue-400/20 dark:text-blue-300 rounded-full flex-shrink-0">
              {sortIndex + 1}
            </span>
          )}
        </div>
        
        {canFilter && (
          <div className="flex-shrink-0 mr-3 z-10">
            <HeaderFilter column={col} fullData={fullData} popoverClassName={classNames?.filterPopover} />
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={twMerge(`w-full overflow-hidden flex flex-col ${bordered ? 'border border-table-border rounded-md' : ''}`, classNames?.container)} style={{ maxHeight }}>
        <div className="animate-pulse flex space-x-4 p-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-table-row-hover rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-table-row-hover rounded"></div>
              <div className="h-4 bg-table-row-hover rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const scrollPaneVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 1 }),
    center: { zIndex: 1, x: 0, opacity: 1 },
    exit: (direction: number) => ({ zIndex: 0, x: direction < 0 ? '100%' : '-100%', opacity: 1 })
  };

  const overflowClass = isAnimating 
    ? (forcedScrollbarState ? 'overflow-x-scroll overflow-y-auto' : 'overflow-x-hidden overflow-y-auto')
    : 'overflow-auto';

  const tabActionsContainer = useContext(TabActionsContext);

  const isBrutalist = classNames?.container?.includes('rounded-none') || classNames?.container?.includes('font-mono');
  const isGlass = classNames?.container?.includes('backdrop-blur') || classNames?.container?.includes('bg-white/70');

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isPickerOpen) return;
    const clickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
          pickerButtonRef.current && !pickerButtonRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [isPickerOpen]);

  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const formatRef = useRef<HTMLDivElement>(null);
  const formatButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isFormatOpen) return;
    const clickOutside = (e: MouseEvent) => {
      if (formatRef.current && !formatRef.current.contains(e.target as Node) &&
          formatButtonRef.current && !formatButtonRef.current.contains(e.target as Node)) {
        setIsFormatOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [isFormatOpen]);

  // Public API Popover Classes
  const visPopoverClassName = classNames?.columnVisibilityPopover || classNames?.filterPopover;
  const isVisBrutalist = visPopoverClassName
    ? (visPopoverClassName.includes('rounded-none') || visPopoverClassName.includes('font-mono'))
    : isBrutalist;
  const isVisGlass = visPopoverClassName
    ? (visPopoverClassName.includes('backdrop-blur') || visPopoverClassName.includes('bg-white/70'))
    : isGlass;

  const fmtPopoverClassName = classNames?.numberFormatPopover || classNames?.filterPopover;
  const isFmtBrutalist = fmtPopoverClassName
    ? (fmtPopoverClassName.includes('rounded-none') || fmtPopoverClassName.includes('font-mono'))
    : isBrutalist;
  const isFmtGlass = fmtPopoverClassName
    ? (fmtPopoverClassName.includes('backdrop-blur') || fmtPopoverClassName.includes('bg-white/70'))
    : isGlass;

  const renderNumberFormatConfigPicker = () => {
    const formatButtonClass = isBrutalist
      ? "w-8 h-8 border-4 border-black dark:border-[#00ff00] bg-[#ffff00] dark:bg-[#00ff00] text-black font-black font-mono text-sm cursor-pointer flex items-center justify-center rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
      : isGlass
        ? "w-8 h-8 bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/15 rounded-lg text-white hover:bg-white/30 dark:hover:bg-white/20 shadow-sm text-sm cursor-pointer flex items-center justify-center"
        : "w-8 h-8 text-xs font-bold border border-table-border dark:border-gray-700 rounded-md bg-table-bg dark:bg-gray-950 text-table-text dark:text-gray-200 hover:bg-table-row-hover dark:hover:bg-gray-800 transition-colors flex items-center justify-center cursor-pointer";

    const dropdownClass = twMerge(
      isFmtGlass
        ? "absolute right-0 mt-1 w-72 shadow-lg z-50 p-4 flex flex-col gap-3 text-xs font-sans text-gray-900 dark:text-gray-100"
        : isFmtBrutalist
          ? "absolute right-0 mt-1 w-72 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,255,0,1)] z-50 p-4 flex flex-col gap-3 text-xs font-mono"
          : "absolute right-0 mt-1 w-72 bg-table-bg dark:bg-gray-900 border border-table-border dark:border-gray-800 rounded-md shadow-lg z-50 p-4 flex flex-col gap-3 text-xs text-table-text dark:text-gray-200 font-sans",
      fmtPopoverClassName
    );

    const selectClass = isFmtBrutalist
      ? "px-2 py-1 rounded-none border-2 border-black dark:border-[#00ff00] bg-white dark:bg-black text-black dark:text-[#00ff00] focus:ring-0 cursor-pointer"
      : isFmtGlass
        ? "px-2 py-1 rounded bg-white/20 dark:bg-white/[0.08] border border-white/30 dark:border-white/20 text-gray-900 dark:text-white focus:ring-fuchsia-500 dark:focus:ring-cyan-500 cursor-pointer focus:border-white/60 dark:focus:border-cyan-500/50"
        : "px-2 py-1 rounded border border-table-border dark:border-gray-600 bg-table-bg dark:bg-gray-950 text-table-text dark:text-gray-200 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer";

    const optionClass = isFmtGlass
      ? "bg-white dark:bg-[#121026] text-gray-950 dark:text-gray-100"
      : "bg-white dark:bg-gray-900 text-gray-950 dark:text-gray-100";

    const checkboxClass = isFmtBrutalist
      ? "w-4 h-4 rounded-none border-2 border-black dark:border-[#00ff00] text-black dark:text-[#00ff00] focus:ring-0 cursor-pointer accent-black dark:accent-[#00ff00]"
      : isFmtGlass
        ? "rounded border-white/40 dark:border-white/20 text-fuchsia-600 dark:text-cyan-500 focus:ring-fuchsia-500 dark:focus:ring-cyan-500 cursor-pointer"
        : "rounded border-table-border dark:border-gray-600 text-table-accent dark:text-blue-500 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer";

    return (
      <div className="relative">
        <button
          ref={formatButtonRef}
          onClick={() => setIsFormatOpen(!isFormatOpen)}
          className={formatButtonClass}
          title="Number Formatting"
          aria-label="Number Formatting"
        >
          <span className="font-bold text-sm leading-none">#</span>
        </button>
        {isFormatOpen && (
          <div ref={formatRef} className={dropdownClass}>
            {!hideDecimalsControl && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Decimal Places:</span>
                <select
                  value={numberFormatConfig?.decimalPlaces ?? 2}
                  onChange={e => onNumberFormatConfigChange?.({
                    ...numberFormatConfig,
                    decimalPlaces: Number(e.target.value)
                  })}
                  className={selectClass}
                >
                  {[0, 1, 2, 3, 4].map(d => (
                    <option key={d} value={d} className={optionClass}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center justify-between gap-2 cursor-pointer font-semibold select-none">
              <span>Thousand Separator:</span>
              <input
                type="checkbox"
                checked={numberFormatConfig?.thousandSeparator ?? true}
                onChange={e => onNumberFormatConfigChange?.({
                  ...numberFormatConfig,
                  thousandSeparator: e.target.checked
                })}
                className={checkboxClass}
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Negatives:</span>
              <select
                value={numberFormatConfig?.negativeFormat ?? 'minus'}
                onChange={e => onNumberFormatConfigChange?.({
                  ...numberFormatConfig,
                  negativeFormat: e.target.value as any
                })}
                className={selectClass}
              >
                <option value="minus" className={optionClass}>Minus (-123.00)</option>
                <option value="parentheses" className={optionClass}>Parens (123.00)</option>
              </select>
            </div>
            <label className="flex items-center justify-between gap-2 cursor-pointer font-semibold select-none">
              <span>Negatives in Red:</span>
              <input
                type="checkbox"
                checked={numberFormatConfig?.negativeInRed ?? false}
                onChange={e => onNumberFormatConfigChange?.({
                  ...numberFormatConfig,
                  negativeInRed: e.target.checked
                })}
                className={checkboxClass}
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  const renderVisibilityPicker = () => {
    const pickerButtonClass = isBrutalist
      ? "w-8 h-8 border-4 border-black dark:border-[#00ff00] bg-[#00e5ff] dark:bg-[#00ff00] text-black font-black uppercase rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-mono text-sm cursor-pointer flex items-center justify-center"
      : isGlass
        ? "w-8 h-8 bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/15 rounded-lg text-white hover:bg-white/30 dark:hover:bg-white/20 shadow-sm text-sm cursor-pointer flex items-center justify-center"
        : "w-8 h-8 text-xs font-semibold border border-table-border dark:border-gray-700 rounded-md bg-table-bg dark:bg-gray-950 text-table-text dark:text-gray-200 hover:bg-table-row-hover dark:hover:bg-gray-800 transition-colors flex items-center justify-center cursor-pointer";

    const dropdownClass = twMerge(
      isVisGlass
        ? "absolute right-0 mt-1 w-48 shadow-lg z-50 p-2 flex flex-col gap-1 text-xs font-sans text-gray-900 dark:text-gray-100"
        : isVisBrutalist
          ? "absolute right-0 mt-1 w-48 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,255,0,1)] z-50 p-2 flex flex-col gap-1 text-xs font-mono"
          : "absolute right-0 mt-1 w-48 bg-table-bg dark:bg-gray-900 border border-table-border dark:border-gray-800 rounded-md shadow-lg z-50 p-2 flex flex-col gap-1 text-xs text-table-text dark:text-gray-200 font-sans",
      visPopoverClassName
    );

    const itemHoverClass = isVisBrutalist
      ? "hover:bg-black hover:text-[#00e5ff] dark:hover:bg-[#00ff00] dark:hover:text-black rounded-none text-black dark:text-[#00ff00]"
      : isVisGlass
        ? "hover:bg-white/35 dark:hover:bg-white/15 rounded-md text-gray-900 dark:text-gray-100"
        : "hover:bg-table-row-hover dark:hover:bg-gray-800 rounded text-table-text dark:text-gray-200";

    const checkboxClass = isVisBrutalist
      ? "w-4 h-4 rounded-none border-2 border-black dark:border-[#00ff00] text-black dark:text-[#00ff00] focus:ring-0 cursor-pointer accent-black dark:accent-[#00ff00]"
      : isVisGlass
        ? "rounded border-white/40 dark:border-white/20 text-fuchsia-600 dark:text-cyan-500 focus:ring-fuchsia-500 dark:focus:ring-cyan-500 cursor-pointer"
        : "rounded border-table-border dark:border-gray-600 text-table-accent dark:text-blue-500 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer";

    const hideableColumns = table.getAllLeafColumns().filter((col) => {
      if (col.id === 'select' || !col.getCanHide()) return false;
      const allLeaf = table.getAllLeafColumns();
      const actualIdx = allLeaf.indexOf(col);
      if (actualIdx < (actualFrozenColumns ?? 0)) return false;
      return true;
    });

    if (hideableColumns.length === 0) return null;

    return (
      <div className="relative">
        <button
          ref={pickerButtonRef}
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          className={pickerButtonClass}
          title="Column Visibility"
          aria-label="Column Visibility"
        >
          <Columns3 size={14} />
        </button>
        {isPickerOpen && (
          <div ref={pickerRef} className={dropdownClass}>
            {hideableColumns.map(col => {
              const isVisible = col.getIsVisible();
              return (
                <label key={col.id} className={twMerge("flex items-center gap-2 px-2 py-1 cursor-pointer font-medium", itemHoverClass)}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => col.toggleVisibility(!isVisible)}
                    className={checkboxClass}
                  />
                  <span>{String(col.columnDef.header || col.id)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className={twMerge(`flex flex-col overflow-hidden w-full h-full relative ${bordered ? 'border border-table-border dark:border-gray-700 rounded-md bg-table-bg dark:bg-gray-900' : ''}`, bordered ? classNames?.container : undefined)} 
      style={{ maxHeight }}
      onMouseMove={(e) => {
        if (!containerRef.current) return;
        containerRef.current.style.setProperty('--cursor-x', `${e.clientX}px`);
        containerRef.current.style.setProperty('--cursor-y', `${e.clientY}px`);
      }}
    >
      {/* Table Toolbar */}
      {tabActionsContainer ? (
        createPortal(
          <>
            {toolbar}
            {enableNumberFormatConfig && renderNumberFormatConfigPicker()}
            {enableColumnVisibility && renderVisibilityPicker()}
          </>,
          tabActionsContainer
        )
      ) : (
        (enableColumnVisibility || enableNumberFormatConfig || toolbar) && (
          <div className={twMerge(
            "flex items-center justify-between p-2 flex-shrink-0",
            isBrutalist
              ? "border-b-4 border-black dark:border-[#00ff00] bg-white dark:bg-black text-black dark:text-[#00ff00] font-mono"
              : isGlass
                ? "border-b border-white/20 dark:border-white/10 bg-white/10 dark:bg-white/5 backdrop-blur-md text-white"
                : "border-b border-table-border dark:border-gray-700 bg-table-header-bg dark:bg-gray-800 text-table-text dark:text-gray-200"
          )}>
            <div>{toolbar}</div>
            <div className="flex items-center gap-2">
              {enableNumberFormatConfig && renderNumberFormatConfigPicker()}
              {enableColumnVisibility && renderVisibilityPicker()}
            </div>
          </div>
        )
      )}

      <div 
        ref={containerRef}
        onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)}
        className={twMerge(`flex-1 relative custom-scrollbar ${overflowClass} [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full`, classNames?.scrollContainer)}
        style={{ minHeight: 0 }}
      >
        <div 
          className="flex min-w-full"
          style={{ 
            width: pinnedWidth + scrollWidth, 
            minHeight: totalHeight + HEADER_HEIGHT_PX + (enableFooter ? ROW_HEIGHT_PX : 0) 
          }}
        >
          {/* Pinned Pane */}
          {actualFrozenColumns > 0 && (
            <div 
              className={twMerge(
                "sticky left-0 z-20 border-r border-table-border dark:border-gray-700",
                classNames?.injectedBgClass ? "bg-transparent" : "bg-table-bg dark:bg-gray-900",
                classNames?.pinnedDivider
              )}
              style={{ width: pinnedWidth, maxWidth: '50%' }}
            >
              {/* Opaque Background Injector */}
              {classNames?.injectedBgClass && (
                <div 
                  className={twMerge("absolute inset-0 pointer-events-none rounded-l-md", classNames.injectedBgClass)}
                  style={{ zIndex: -2 }} 
                />
              )}
              {/* Glass Overlay for Pinned Pane */}
              {classNames?.pinnedDivider && (
                <div 
                  className={twMerge("absolute inset-0 pointer-events-none rounded-l-md", classNames.pinnedDivider.match(/(?:[a-zA-Z0-9-:]*?)(?:bg-|backdrop-)\S+/g)?.join(' '))}
                  style={{ zIndex: -1 }} 
                />
              )}
              {/* Header */}
              <div className={twMerge("sticky top-0 z-30 bg-table-header-bg dark:bg-gray-800 border-b border-table-border dark:border-gray-700 flex", classNames?.headerRow)} style={{ height: HEADER_HEIGHT_PX }}>
                {pinnedCols.map(col => {
                  const header = table.getHeaderGroups()[0].headers.find(h => h.column.id === col.id);
                  return (
                    <div key={col.id} className="relative font-semibold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700 last:border-r-0 select-none" style={{ width: getColWidth(col) }}>
                      {renderHeaderContent(col, header)}
                      {col.getCanResize() && header && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={e => e.stopPropagation()}
                          className="absolute right-0 top-0 h-full w-4 cursor-col-resize z-10 select-none touch-none group"
                          role="separator"
                        >
                          <div className={`absolute right-0 w-[2px] h-full transition-colors ${
                            header.column.getIsResizing() 
                              ? 'bg-table-accent dark:bg-blue-500' 
                              : 'bg-transparent group-hover:bg-table-accent/50 dark:group-hover:bg-blue-500/50'
                          }`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Body */}
              <div style={{ height: totalHeight, position: 'relative' }}>
                {virtualRows.map(vRow => {
                  const row = rows[vRow.index];
                  const cells = row.getVisibleCells();
                  return (
                    <div 
                      key={row.id}
                      onMouseEnter={() => setHoveredRowId(row.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      data-hovered={hoveredRowId === row.id}
                      className={twMerge("absolute top-0 left-0 w-full flex hover:bg-table-row-hover dark:hover:bg-gray-800 data-[hovered=true]:bg-table-row-hover dark:data-[hovered=true]:bg-gray-800 transition-colors text-table-text dark:text-gray-300", classNames?.bodyRow)}
                      style={{ height: ROW_HEIGHT_PX, transform: `translateY(${vRow.start}px)` }}
                    >
                      {pinnedCols.map((col, idx) => {
                        const isLastPinnedCol = idx === pinnedCols.length - 1;
                        return (
                          <div 
                            key={col.id} 
                            style={{ width: getColWidth(col) }} 
                            className={twMerge(
                              "h-full", 
                              (bordered && !isLastPinnedCol) ? "border-r border-table-border dark:border-gray-700" : "",
                              classNames?.bodyCell
                            )}
                          >
                            <BodyCell
                              cell={cells[idx]}
                              editable={editable}
                              isSubmitting={isSubmitting}
                              editingState={editingState}
                              onEnterEdit={handleEnterEdit}
                              onSaveEdit={handleSaveEdit}
                              onCancelEdit={() => setEditingState(null)}
                              singleClickEdit={singleClickEdit}
                              className={getCellClassName?.(row.original, col.id)}
                              isDisclosureColumn={idx === 0}
                              depth={row.depth}
                              isExpanded={row.getIsExpanded()}
                              onToggleExpand={row.getToggleExpandedHandler()}
                              classNames={classNames}
                              numberFormatConfig={numberFormatConfig}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              {enableFooter && (
                <div 
                  className={twMerge(
                    "sticky bottom-0 z-30 bg-table-header-bg dark:bg-gray-800 border-t border-table-border dark:border-gray-700 flex", 
                    classNames?.headerRow ? classNames.headerRow.replace(/border-b/g, 'border-t') : ''
                  )} 
                  style={{ height: ROW_HEIGHT_PX }}
                >
                  {pinnedCols.map((col) => (
                    <div 
                      key={col.id} 
                      className={twMerge(
                        "relative font-bold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700 last:border-r-0 flex items-center px-3 truncate",
                        classNames?.headerCell
                      )} 
                      style={{ width: getColWidth(col) }}
                    >
                      {getFooterValue(col)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scroll Pane Wrapper */}
          <div className="flex-1 relative">
            {/* Opaque Background Injector for Scroll Pane */}
            {classNames?.injectedBgClass && (
              <div 
                className={twMerge("absolute inset-0 pointer-events-none rounded-r-md", classNames.injectedBgClass)}
                style={{ zIndex: 0 }} 
              />
            )}
            {/* Glass Overlay for Scroll Pane */}
            {classNames?.container && (
              <div 
                className={twMerge("absolute inset-0 pointer-events-none rounded-r-md", classNames.container.match(/(?:[a-zA-Z0-9-:]*?)(?:bg-|backdrop-)\S+/g)?.join(' '))}
                style={{ zIndex: 0 }} 
              />
            )}

            {/* Scroll Pane Content (sliding) */}
            <motion.div 
              className="flex-1 relative z-10 flex flex-col"
              custom={tabTransitionDirection}
              variants={animateScrollOnly ? scrollPaneVariants : undefined}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'tween', ease: 'easeInOut', duration: 0.25 }}
              style={{ width: scrollWidth }}
            >
            {/* Header */}
            {visibleScrollCols.length > 0 && (
              <div className={twMerge("sticky top-0 z-10 bg-table-header-bg dark:bg-gray-800 border-b border-table-border dark:border-gray-700 flex", classNames?.headerRow)} style={{ height: HEADER_HEIGHT_PX, width: scrollWidth }}>
                {leftPadding > 0 && <div style={{ width: leftPadding, flexShrink: 0 }} />}
                {visibleScrollCols.map(({ col }) => {
                  const header = table.getHeaderGroups()[0].headers.find(h => h.column.id === col.id);
                  return (
                    <div key={col.id} className="relative font-semibold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700 select-none" style={{ width: getColWidth(col), flexShrink: 0 }}>
                      {renderHeaderContent(col, header)}
                      {col.getCanResize() && header && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={e => e.stopPropagation()}
                          className="absolute right-0 top-0 h-full w-4 cursor-col-resize z-10 select-none touch-none group"
                          role="separator"
                        >
                          <div className={`absolute right-0 w-[2px] h-full transition-colors ${
                            header.column.getIsResizing() 
                              ? 'bg-table-accent dark:bg-blue-500' 
                              : 'bg-transparent group-hover:bg-table-accent/50 dark:group-hover:bg-blue-500/50'
                          }`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Body */}
            {rows.length === 0 ? (
              <div className="p-8 text-center text-table-text-muted dark:text-gray-500">{emptyMessage}</div>
            ) : (
              <div style={{ height: totalHeight, position: 'relative', width: scrollWidth }}>
                {virtualRows.map(vRow => {
                  const row = rows[vRow.index];
                  const cells = row.getVisibleCells();
                  return (
                    <div 
                      key={row.id}
                      onMouseEnter={() => setHoveredRowId(row.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      data-hovered={hoveredRowId === row.id}
                      className={twMerge("absolute top-0 left-0 flex hover:bg-table-row-hover dark:hover:bg-gray-800 data-[hovered=true]:bg-table-row-hover dark:data-[hovered=true]:bg-gray-800 transition-colors text-table-text dark:text-gray-300", classNames?.bodyRow)}
                      style={{ height: ROW_HEIGHT_PX, transform: `translateY(${vRow.start}px)`, width: scrollWidth }}
                    >
                      {leftPadding > 0 && <div style={{ width: leftPadding, flexShrink: 0 }} />}
                      {visibleScrollCols.map(({ col, scrollIndex }) => {
                        const isLastScrollCol = col.id === scrollCols[scrollCols.length - 1]?.id;
                        return (
                          <div 
                            key={col.id} 
                            style={{ width: getColWidth(col), flexShrink: 0 }} 
                            className={twMerge(
                              "h-full", 
                              (bordered || isLastScrollCol) ? "border-r border-table-border dark:border-gray-700" : "",
                              classNames?.bodyCell
                            )}
                          >
                            <BodyCell
                              cell={cells[actualFrozenColumns + scrollIndex]}
                              editable={editable}
                              isSubmitting={isSubmitting}
                              editingState={editingState}
                              onEnterEdit={handleEnterEdit}
                              onSaveEdit={handleSaveEdit}
                              onCancelEdit={() => setEditingState(null)}
                              singleClickEdit={singleClickEdit}
                              className={getCellClassName?.(row.original, col.id)}
                              isDisclosureColumn={actualFrozenColumns === 0 && scrollIndex === 0}
                              depth={row.depth}
                              isExpanded={row.getIsExpanded()}
                              onToggleExpand={row.getToggleExpandedHandler()}
                              classNames={classNames}
                              numberFormatConfig={numberFormatConfig}
                            />
                          </div>
                        );
                      })}
                      {rightPadding > 0 && <div style={{ width: rightPadding, flexShrink: 0 }} />}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            {enableFooter && rows.length > 0 && visibleScrollCols.length > 0 && (
              <div 
                className={twMerge(
                  "sticky bottom-0 z-30 bg-table-header-bg dark:bg-gray-800 border-t border-table-border dark:border-gray-700 flex", 
                  classNames?.headerRow ? classNames.headerRow.replace(/border-b/g, 'border-t') : ''
                )} 
                style={{ height: ROW_HEIGHT_PX, width: scrollWidth }}
              >
                {leftPadding > 0 && <div style={{ width: leftPadding, flexShrink: 0 }} />}
                {visibleScrollCols.map(({ col }) => {
                  return (
                    <div 
                      key={col.id} 
                      className={twMerge(
                        "relative font-bold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700 flex items-center px-3 truncate",
                        classNames?.headerCell
                      )} 
                      style={{ width: getColWidth(col), flexShrink: 0 }}
                    >
                      {getFooterValue(col)}
                    </div>
                  );
                })}
                {rightPadding > 0 && <div style={{ width: rightPadding, flexShrink: 0 }} />}
              </div>
            )}
          </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
