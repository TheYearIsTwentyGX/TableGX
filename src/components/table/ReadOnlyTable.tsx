import type { ReadOnlyTableProps } from './types';
import { useTableEngine } from './hooks/useTableEngine';
import { TableCore } from './TableCore';

export function ReadOnlyTable<TRow extends Record<string, unknown>>(props: ReadOnlyTableProps<TRow>) {
  const { table, columnWidths } = useTableEngine(props);

  return (
    <div className="flex flex-col h-full">
      <TableCore
        table={table}
        columnWidths={columnWidths}
        editable={false}
        isLoading={props.isLoading}
        emptyMessage={props.emptyMessage}
        bordered={props.bordered}
        frozenColumns={props.frozenColumns}
        maxHeight={props.maxHeight}
        animateScrollOnly={props.animateScrollOnly}
        tabTransitionDirection={props.tabTransitionDirection}
        classNames={props.classNames}
        fullData={props.fullData}
        enableFooter={props.enableFooter}
        enableColumnVisibility={props.enableColumnVisibility}
        columnVisibilityStorageKey={props.columnVisibilityStorageKey}
        toolbar={props.toolbar}
        enableRowSelection={props.enableRowSelection}
        numberFormatConfig={props.numberFormatConfig}
        onNumberFormatConfigChange={props.onNumberFormatConfigChange}
        enableNumberFormatConfig={props.enableNumberFormatConfig}
        hideDecimalsControl={props.hideDecimalsControl}
      />
    </div>
  );
}
