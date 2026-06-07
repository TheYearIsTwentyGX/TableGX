import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Column } from '@tanstack/react-table';
import { Filter, Search, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type HeaderFilterProps<TRow> = {
  column: Column<TRow, unknown>;
  className?: string;
};

export function HeaderFilter<TRow>({ column, className }: HeaderFilterProps<TRow>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  
  // Local state for the deferred filter application
  const [stagedFilterValue, setStagedFilterValue] = useState<any[]>([]);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const uniqueValues = useMemo(() => {
    return Array.from(column.getFacetedUniqueValues().keys()).map(v => String(v)).sort();
  }, [column]);

  // Sync staged state when opening
  useEffect(() => {
    if (isOpen) {
      const active = column.getFilterValue() as any[];
      // If no filter is active, initialize with all unique values selected
      setStagedFilterValue(active ? active : uniqueValues);
      setSearchText('');
    }
  }, [isOpen, column, uniqueValues]);

  // Close popover when clicking outside or scrolling the table
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e: MouseEvent) => {
      // Don't close if clicking the toggle button
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      // Don't close if clicking inside the popover
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) return;
      
      setIsOpen(false);
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // Ignore scroll events originating from inside the popover (like the checklist)
      if (target.closest?.('.header-filter-popover')) return;
      
      // Close popover if the table or window scrolls
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('scroll', handleScroll, { capture: true });
    
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen]);

  const activeFilterValue = (column.getFilterValue() ?? []) as any[];

  const filteredUniqueValues = useMemo(() => {
    if (!searchText) return uniqueValues;
    const lowerSearch = searchText.toLowerCase();
    return uniqueValues.filter(v => String(v).toLowerCase().includes(lowerSearch));
  }, [uniqueValues, searchText]);

  const toggleValue = (val: any) => {
    setStagedFilterValue(prev => {
      const newFilter = [...prev];
      const idx = newFilter.indexOf(val);
      if (idx > -1) {
        newFilter.splice(idx, 1);
      } else {
        newFilter.push(val);
      }
      return newFilter;
    });
  };

  const toggleAll = () => {
    if (stagedFilterValue.length === uniqueValues.length) {
      setStagedFilterValue([]); // Select none
    } else {
      setStagedFilterValue(uniqueValues); // Select all
    }
  };

  const applyFilter = () => {
    if (stagedFilterValue.length === uniqueValues.length) {
      // Selecting all is logically equivalent to having no filter active
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue(stagedFilterValue);
    }
    setIsOpen(false);
  };

  const clearFilter = () => {
    column.setFilterValue(undefined);
    setIsOpen(false);
  };

  const isAllSelected = stagedFilterValue.length === uniqueValues.length;

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverWidth = 256; // 16rem (w-64)
      
      // Try to align to the right of the button first
      let left = rect.right - popoverWidth;
      
      // Prevent clipping on the left edge of the screen (e.g. if the column is far left)
      if (left < 10) left = 10;
      
      // Prevent clipping on the right edge of the screen
      if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
      }
      
      setCoords({ top: rect.bottom + 4, left });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div className={twMerge("relative inline-flex items-center", className)}>
      <button
        ref={buttonRef}
        onClick={handleToggleOpen}
        className={twMerge(
          "p-1 rounded transition-colors",
          activeFilterValue.length > 0 ? 'text-table-accent dark:text-blue-400 bg-table-accent/10 dark:bg-blue-400/10' : 'text-table-text-muted dark:text-gray-400 hover:bg-table-row-hover dark:hover:bg-gray-700 hover:text-table-text dark:hover:text-gray-200'
        )}
        title="Filter column"
      >
        <Filter size={14} />
      </button>

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          className="header-filter-popover fixed w-64 bg-table-bg dark:bg-gray-800 border border-table-border dark:border-gray-700 rounded-lg shadow-lg z-[100] flex flex-col font-normal text-sm"
          style={{ top: coords.top, left: coords.left }}
          onClick={e => e.stopPropagation()} // Prevent table sorting/interactions
        >
          {/* Search Input */}
          <div className="p-2 border-b border-table-border dark:border-gray-700 relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-table-text-muted dark:text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              className="w-full pl-8 pr-8 py-1.5 border border-table-border dark:border-gray-600 rounded bg-table-bg dark:bg-gray-900 text-table-text dark:text-gray-200 focus:outline-none focus:border-table-accent dark:focus:border-blue-500"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFilter();
                }
              }}
            />
            {searchText && (
              <button 
                onClick={() => setSearchText('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-table-text-muted dark:text-gray-400 hover:text-table-text dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Checklist */}
          <div className="max-h-60 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
            {!searchText && (
              <label className="flex items-center gap-2 px-2 py-1 hover:bg-table-row-hover dark:hover:bg-gray-700 cursor-pointer rounded text-table-text dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-table-border dark:border-gray-600 text-table-accent dark:text-blue-500 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer"
                />
                <span className="font-semibold">(Select All)</span>
              </label>
            )}
            
            {filteredUniqueValues.length === 0 ? (
              <div className="text-center text-table-text-muted dark:text-gray-500 py-2">No matches</div>
            ) : (
              filteredUniqueValues.map((val, idx) => {
                const isChecked = stagedFilterValue.includes(val);
                return (
                  <label key={idx} className="flex items-center gap-2 px-2 py-1 hover:bg-table-row-hover dark:hover:bg-gray-700 cursor-pointer rounded text-table-text dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleValue(val)}
                      className="rounded border-table-border dark:border-gray-600 text-table-accent dark:text-blue-500 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="truncate" title={String(val)}>{String(val)}</span>
                  </label>
                );
              })
            )}
          </div>
          
          {/* Footer Actions */}
          <div className="p-2 border-t border-table-border dark:border-gray-700 flex justify-end gap-2 bg-table-header-bg dark:bg-gray-800 rounded-b-lg">
            <button
              onClick={clearFilter}
              className="px-3 py-1 text-table-text-muted dark:text-gray-400 hover:text-table-text dark:hover:text-gray-200 rounded transition-colors text-xs font-medium"
            >
              Clear
            </button>
            <button
              onClick={applyFilter}
              disabled={stagedFilterValue.length === 0}
              className="px-3 py-1 bg-table-accent dark:bg-blue-600 text-white hover:bg-table-accent-hover dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-xs font-medium"
            >
              Apply
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
