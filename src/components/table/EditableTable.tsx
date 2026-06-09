import type { EditableTableProps } from './types';
import { useTableEngine } from './hooks/useTableEngine';
import { TableCore } from './TableCore';

export function EditableTable<TRow extends Record<string, unknown>>({
  getCellClassName,
  bordered = true,
  animateScrollOnly,
  tabTransitionDirection,
  classNames,
  ...props
}: EditableTableProps<TRow>) {
  const { table, columnWidths } = useTableEngine(props);

  return (
    <div className="flex flex-col h-full">
      <TableCore
        table={table}
        columnWidths={columnWidths}
        editable={true}
        editableColumnIds={props.editableColumnIds}
        onSaveEdit={props.onSaveEdit}
        singleClickEdit={props.singleClickEdit}
        isSubmitting={props.isSubmitting}
        getCellClassName={getCellClassName}
        isLoading={props.isLoading}
        emptyMessage={props.emptyMessage}
        bordered={bordered}
        frozenColumns={props.frozenColumns}
        maxHeight={props.maxHeight}
        animateScrollOnly={animateScrollOnly}
        tabTransitionDirection={tabTransitionDirection}
        classNames={classNames}
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
