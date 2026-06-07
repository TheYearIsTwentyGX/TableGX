import { useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel } from '@tanstack/react-table';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';

export type TabFilterWorkerProps<TRow> = {
  tabId: string;
  data: TRow[];
  columns: ColumnDef<TRow>[];
  columnFilters: ColumnFiltersState;
  getRowId: (row: TRow) => string | number;
  onFilteredIdsChange: (tabId: string, ids: Set<string>) => void;
};

export function TabFilterWorker<TRow extends Record<string, unknown>>({
  tabId,
  data,
  columns,
  columnFilters,
  getRowId,
  onFilteredIdsChange,
}: TabFilterWorkerProps<TRow>) {
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => String(getRowId(row)),
    state: { columnFilters },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const filteredRows = table.getFilteredRowModel().rows;

  useEffect(() => {
    const ids = new Set(filteredRows.map((r) => r.id));
    onFilteredIdsChange(tabId, ids);
  }, [filteredRows, tabId, onFilteredIdsChange]);

  return null;
}
