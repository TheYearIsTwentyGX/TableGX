import type { ReadOnlyTableProps } from './types';
import { useTableEngine } from './hooks/useTableEngine';
import { TableCore } from './TableCore';

export function ReadOnlyTable<TRow extends Record<string, unknown>>(props: ReadOnlyTableProps<TRow>) {
  const { table, columnWidths } = useTableEngine(props);

  return (
    <div className="flex flex-col h-full">
      {props.toolbar && <div className="mb-4">{props.toolbar}</div>}
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
      />
    </div>
  );
}
