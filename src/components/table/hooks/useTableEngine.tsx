import { useMemo, useState, useEffect } from 'react';
import type {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
  ExpandedState,
  VisibilityState,
  Updater
} from '@tanstack/react-table';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  getFacetedUniqueValues
} from '@tanstack/react-table';
import type { MeasureTextFn, TableColumnMeta } from '../types';
import { MIN_COLUMN_WIDTH_PX, ABSOLUTE_MIN_COLUMN_WIDTH_PX } from '../constants';
import { defaultMeasureText } from '../utils/measureText';


export type TableEngineProps<TRow> = {
  data: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string | number;
  initialSorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  enableMultiSort?: boolean;
  enableRowSelection?: boolean;
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
  enableExpanding?: boolean;
  getSubRows?: (row: TRow) => TRow[] | undefined;
  expanded?: ExpandedState;
  onExpandedChange?: (next: ExpandedState) => void;
  defaultExpanded?: boolean | Record<string, boolean>;
  measure?: MeasureTextFn;
  columnVisibilityStorageKey?: string;
};

export function useTableEngine<TRow extends Record<string, unknown>>({
  data,
  columns,
  getRowId,
  initialSorting,
  columnFilters,
  onColumnFiltersChange,
  enableMultiSort,
  enableRowSelection,
  selectedRowIds,
  onSelectedRowIdsChange,
  enableExpanding,
  getSubRows,
  expanded: controlledExpanded,
  onExpandedChange,
  defaultExpanded,
  measure = defaultMeasureText,
  columnVisibilityStorageKey
}: TableEngineProps<TRow>) {

  const [sorting, setSorting] = useState<SortingState>(initialSorting || []);
  const [internalFilters, setInternalFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [internalExpanded, setInternalExpanded] = useState<ExpandedState>(
    defaultExpanded === true ? true : (typeof defaultExpanded === 'object' ? defaultExpanded : {})
  );
  
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (columnVisibilityStorageKey) {
      try {
        const stored = localStorage.getItem(columnVisibilityStorageKey);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.error('Failed to parse column visibility from localStorage', e);
      }
    }
    return {};
  });

  useEffect(() => {
    if (columnVisibilityStorageKey) {
      localStorage.setItem(columnVisibilityStorageKey, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility, columnVisibilityStorageKey]);

  const filters = columnFilters !== undefined ? columnFilters : internalFilters;
  const setFilters = onColumnFiltersChange || setInternalFilters;

  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const setExpanded = (updater: Updater<ExpandedState>) => {
    if (typeof updater === 'function') {
      const next = updater(expanded);
      setInternalExpanded(next);
      onExpandedChange?.(next);
    } else {
      setInternalExpanded(updater);
      onExpandedChange?.(updater);
    }
  };

  // Sync controlled selection
  useEffect(() => {
    if (selectedRowIds) {
      const rs: RowSelectionState = {};
      selectedRowIds.forEach(id => { rs[id] = true; });
      setRowSelection(rs);
    }
  }, [selectedRowIds]);

  const finalColumns = useMemo(() => {
    if (!enableRowSelection) return columns;

    const selectColumn: ColumnDef<TRow> = {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center w-full h-full">
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate' as any)}
            ref={(input) => {
              if (input) {
                input.indeterminate = table.getIsSomePageRowsSelected();
              }
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="w-4 h-4 text-table-accent dark:text-blue-500 rounded border-table-border dark:border-gray-600 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer"
            aria-label="Select all rows"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-full h-full">
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            ref={(input) => {
              if (input) {
                input.indeterminate = row.getIsSomeSelected();
              }
            }}
            onChange={row.getToggleSelectedHandler()}
            className="w-4 h-4 text-table-accent dark:text-blue-500 rounded border-table-border dark:border-gray-600 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer"
            aria-label="Select row"
          />
        </div>
      ),
      meta: {
        fixedMeasureWidth: 48,
      } as any,
    };

    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    getRowId: (row) => String(getRowId(row)),
    state: {
      sorting,
      columnFilters: filters,
      rowSelection,
      expanded,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onSelectedRowIdsChange) {
        onSelectedRowIdsChange(Object.keys(next).filter(k => next[k]));
      }
    },
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableMultiSort,
    isMultiSortEvent: (e: any) => e.shiftKey,
    enableRowSelection,
    getSubRows: enableExpanding ? getSubRows : undefined,
    enableExpanding,
    manualPagination: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: {
      filterFn: (row, columnId, filterValue) => {
        if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
        const val = row.getValue(columnId);
        return filterValue.includes(String(val ?? ''));
      }
    }
  });

  // Pre-calculate column widths
  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    table.getVisibleLeafColumns().forEach(col => {
      const meta = col.columnDef.meta as TableColumnMeta<TRow> | undefined;
      
      if (meta?.fixedMeasureWidth) {
        widths[col.id] = meta.fixedMeasureWidth;
        return;
      }
      
      // Measure header precisely:
      // - font: semibold 12px (matches Tailwind text-xs font-semibold)
      // - sort icons: ~18px
      // - filter button: ~34px
      // - cell padding: ~16px
      // total extra padding needed: ~68px
      let maxW = measure(String(col.columnDef.header || ''), '600 12px Inter, sans-serif') + 68;
      maxW = Math.max(maxW, ABSOLUTE_MIN_COLUMN_WIDTH_PX);

      // Sample a large set of rows for width, using the core unpaginated/unfiltered model
      // so that applying filters doesn't cause columns to shrink unexpectedly.
      // Capped at 5000 to prevent main-thread blocking on absurdly massive datasets.
      const rows = table.getCoreRowModel().rows.slice(0, 5000);
      for (const row of rows) {
        let text = '';
        if (meta?.measureText) {
          text = meta.measureText(row.original as TRow);
        } else {
          text = String(row.getValue(col.id) ?? '');
        }
        let w = measure(text) + 24; // padding
        if (w > maxW) maxW = w;
      }

      if (meta?.maxColumnWidth && maxW > meta.maxColumnWidth) {
        maxW = meta.maxColumnWidth;
      }

      widths[col.id] = Math.max(maxW, MIN_COLUMN_WIDTH_PX);
    });
    return widths;
  }, [data, columns, measure]);

  return {
    table,
    columnWidths
  };
}
