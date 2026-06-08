import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { twMerge } from 'tailwind-merge';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flexRender } from '@tanstack/react-table';
import type { Table, Column } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { BodyCell } from './BodyCell';
import { HeaderFilter } from './HeaderFilter';
import { ROW_HEIGHT_PX, HEADER_HEIGHT_PX } from './constants';
import type { TableClassNames, TableColumnMeta } from './types';
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

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const pinnedCols = visibleLeafColumns.slice(0, frozenColumns);
  const scrollCols = visibleLeafColumns.slice(frozenColumns);

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
        const formatted = formatNumber(result, meta.numberFormat);
        if (meta.numberFormat.negativeInRed && result < 0) {
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

    return (
      <div 
        className={twMerge(`w-full h-full flex items-center pl-3 pr-1 ${canSort ? 'cursor-pointer hover:bg-table-row-hover transition-colors' : ''}`, classNames?.headerCell)}
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
      >
        <div className="flex-1 flex items-center min-w-0 pr-2">
          <span className="truncate">{flexRender(col.columnDef.header, header.getContext())}</span>
          {isSorted === 'asc' ? <ArrowUp size={14} className="ml-1 text-table-accent flex-shrink-0" /> : 
           isSorted === 'desc' ? <ArrowDown size={14} className="ml-1 text-table-accent flex-shrink-0" /> : null}
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
          {frozenColumns > 0 && (
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
                    <div key={col.id} className="relative font-semibold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700 last:border-r-0" style={{ width: getColWidth(col) }}>
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
                    <div key={col.id} className="relative font-semibold text-xs text-table-text dark:text-gray-200 border-r border-table-border dark:border-gray-700" style={{ width: getColWidth(col), flexShrink: 0 }}>
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
                              cell={cells[frozenColumns + scrollIndex]}
                              editable={editable}
                              isSubmitting={isSubmitting}
                              editingState={editingState}
                              onEnterEdit={handleEnterEdit}
                              onSaveEdit={handleSaveEdit}
                              onCancelEdit={() => setEditingState(null)}
                              singleClickEdit={singleClickEdit}
                              className={getCellClassName?.(row.original, col.id)}
                              isDisclosureColumn={frozenColumns === 0 && scrollIndex === 0}
                              depth={row.depth}
                              isExpanded={row.getIsExpanded()}
                              onToggleExpand={row.getToggleExpandedHandler()}
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
