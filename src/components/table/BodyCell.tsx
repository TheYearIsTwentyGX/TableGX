import React, { useState, useLayoutEffect } from 'react';
import { flexRender } from '@tanstack/react-table';
import type { Cell } from '@tanstack/react-table';
import type { TableColumnMeta } from './types';
import { ChevronRight } from 'lucide-react';
import { INDENT_STEP_PX } from './constants';

type BodyCellProps<TRow> = {
  cell: Cell<TRow, unknown>;
  editable: boolean;
  isSubmitting?: boolean;
  editingState: { rowId: string | number; columnId: string; initialValue: string } | null;
  onEnterEdit: (rowId: string | number, columnId: string, initialValue: string) => void;
  onSaveEdit: (row: TRow, columnId: string, value: string | number | boolean) => Promise<boolean>;
  onCancelEdit: () => void;
  singleClickEdit?: boolean;
  className?: string;
  isDisclosureColumn?: boolean;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
};

function BodyCellInner<TRow extends Record<string, unknown>>({
  cell,
  editable,
  isSubmitting,
  editingState,
  onEnterEdit,
  onSaveEdit,
  onCancelEdit,
  singleClickEdit,
  className = '',
  isDisclosureColumn,
  depth = 0,
  isExpanded,
  onToggleExpand
}: BodyCellProps<TRow>) {
  const meta = cell.column.columnDef.meta as TableColumnMeta<TRow> | undefined;
  const isEditing = editingState?.rowId === cell.row.id && editingState?.columnId === cell.column.id;
  
  const [editValue, setEditValue] = useState<string | number | boolean>('');
  
  useLayoutEffect(() => {
    if (isEditing) {
      const val = cell.getValue();
      setEditValue(val as any ?? '');
    }
  }, [isEditing, cell]);

  const handleDoubleClick = () => {
    if (!editable || !meta?.editable || isSubmitting) return;
    if (!singleClickEdit && meta?.inputType !== 'boolean') {
      onEnterEdit(cell.row.id, cell.column.id, String(cell.getValue() ?? ''));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // If it's single click edit mode, and it doesn't already have an interactive control (boolean)
    if (!editable || !meta?.editable || isSubmitting || isEditing) return;
    if (singleClickEdit && meta?.inputType !== 'boolean') {
      onEnterEdit(cell.row.id, cell.column.id, String(cell.getValue() ?? ''));
    }
  };

  const commitEdit = async (val: string | number | boolean) => {
    if (isSubmitting) return;
    const success = await onSaveEdit(cell.row.original, cell.column.id, val);
    if (success) {
      onCancelEdit();
    }
  };

  const renderEditor = () => {
    const inputType = meta?.inputType || 'text';
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEdit(editValue);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(editValue).then(() => {
           // Tab navigation logic is complex, we'd need to emit to TableCore.
           // Leaving basic commit here.
        });
      }
    };

    if (inputType === 'text') {
      return (
        <textarea
          className="w-full h-full p-1 border border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none text-sm"
          value={editValue as string}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commitEdit(editValue)}
          autoFocus
          disabled={isSubmitting}
        />
      );
    }
    if (inputType === 'number') {
      return (
        <input
          type="number"
          className="w-full h-full p-1 border border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          value={editValue as number}
          onChange={e => setEditValue(Number(e.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={() => commitEdit(editValue)}
          autoFocus
          disabled={isSubmitting}
        />
      );
    }
    if (inputType === 'select' && meta?.selectOptions) {
      return (
        <select
          className="w-full h-full p-1 border border-blue-500 dark:border-blue-400 focus:outline-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          value={editValue as string}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commitEdit(editValue)}
          autoFocus
          disabled={isSubmitting}
        >
          {meta.selectOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (isEditing && meta?.inputType !== 'boolean') {
      return renderEditor();
    }
    
    const value = cell.getValue();

    if (meta?.inputType === 'boolean') {
      const isChecked = !!value;
      return (
        <input 
          type="checkbox" 
          checked={isChecked}
          onChange={(e) => {
            if (editable && meta?.editable && !isSubmitting) {
              // Direct save
              onSaveEdit(cell.row.original, cell.column.id, e.target.checked);
            }
          }}
          disabled={(!editable || !meta?.editable) || isSubmitting}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
        />
      );
    }

    return flexRender(cell.column.columnDef.cell, cell.getContext());
  };

  const isEditableCell = editable && meta?.editable && meta?.inputType !== 'boolean';

  return (
    <div
      className={`relative h-full flex items-center px-3 border-b border-gray-200 dark:border-gray-700 overflow-hidden text-sm ${className}`}
      style={{
        paddingLeft: isDisclosureColumn ? `${(depth * INDENT_STEP_PX) + 12}px` : undefined
      }}
    >
      {!isEditing && isEditableCell && (
        <div 
          className="absolute inset-0 z-10 cursor-cell"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      )}
      {isDisclosureColumn && cell.row.getCanExpand() && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
          className="mr-2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-transform duration-200 relative z-20"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
        >
          <ChevronRight size={16} />
        </button>
      )}
      
      <div className="flex-1 truncate relative z-0">
        {renderContent()}
      </div>

      {meta?.actions && !isEditing && (
        <div className="flex items-center gap-1 ml-2 relative z-20">
          {meta.actions.map(action => {
            if (action.isHidden?.(cell.row.original)) return null;
            const disabled = action.isDisabled?.(cell.row.original) || isSubmitting;
            
            return (
              <button
                key={action.id}
                title={action.tooltip || action.ariaLabel}
                disabled={disabled}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  if (action.confirm) {
                    if (!window.confirm(action.confirm.title + (action.confirm.description ? '\n' + action.confirm.description : ''))) return;
                  }
                  await action.onClick(cell.row.original, e);
                }}
                className={`p-1 rounded flex items-center justify-center
                  ${action.variant === 'destructive' ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {action.icon || <span className="text-xs px-1">{action.label}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const BodyCell = React.memo(BodyCellInner, (prev, next) => {
  return (
    prev.cell.id === next.cell.id &&
    prev.cell.getValue() === next.cell.getValue() &&
    prev.editable === next.editable &&
    prev.isSubmitting === next.isSubmitting &&
    prev.editingState?.rowId === next.editingState?.rowId &&
    prev.editingState?.columnId === next.editingState?.columnId &&
    prev.isExpanded === next.isExpanded &&
    prev.depth === next.depth &&
    prev.className === next.className
  );
}) as typeof BodyCellInner;
