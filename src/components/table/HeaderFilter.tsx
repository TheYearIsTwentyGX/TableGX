import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Column } from '@tanstack/react-table';
import { Filter, Search, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type HeaderFilterProps<TRow> = {
  column: Column<TRow, unknown>;
  popoverClassName?: string;
  fullData?: TRow[];
};

export function HeaderFilter<TRow>({ column, popoverClassName, fullData }: HeaderFilterProps<TRow>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  
  // Local state for the deferred filter application
  const [stagedFilterValue, setStagedFilterValue] = useState<any[]>([]);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const uniqueValues = useMemo(() => {
    if (!fullData) {
      return Array.from(column.getFacetedUniqueValues().keys()).map(v => String(v)).sort();
    }
    const accessorKey = (column.columnDef as any).accessorKey;
    const key = column.id || accessorKey;
    if (!key) return [];

    const values = new Set<string>();
    const addValuesRecursive = (items: any[]) => {
      items.forEach((item) => {
        const val = item[key];
        if (val !== undefined && val !== null) {
          values.add(String(val));
        }
        if (item.children && Array.isArray(item.children)) {
          addValuesRecursive(item.children);
        }
      });
    };
    addValuesRecursive(fullData);
    return Array.from(values).sort();
  }, [column, fullData]);

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

  const isDarkMode = buttonRef.current 
    ? (!!buttonRef.current.closest('.dark') || document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'))
    : (typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark')));

  const isBrutalist = popoverClassName?.includes('rounded-none') || popoverClassName?.includes('font-mono');
  const isGlass = popoverClassName?.includes('backdrop-blur') || popoverClassName?.includes('bg-white/70');

  // Classes for the search container div
  const searchContainerClass = isBrutalist
    ? "p-2 border-b-4 border-black dark:border-[#00ff00] relative"
    : isGlass
      ? "p-2 border-b border-white/20 dark:border-white/20 relative"
      : "p-2 border-b border-table-border dark:border-gray-700 relative";

  // Classes for the search input
  const searchInputClass = isBrutalist
    ? "w-full pl-8 pr-8 py-1.5 border-4 border-black dark:border-[#00ff00] rounded-none bg-white dark:bg-black text-black dark:text-[#00ff00] placeholder-black/50 dark:placeholder-[#00ff00]/50 font-mono focus:outline-none focus:bg-[#ffeb3b]/20 dark:focus:bg-[#1a1a1a]"
    : isGlass
      ? "w-full pl-8 pr-8 py-1.5 border border-white/30 dark:border-white/20 rounded-lg bg-white/20 dark:bg-black/35 text-gray-900 dark:text-white placeholder-gray-500/70 dark:placeholder-white/40 focus:outline-none focus:border-white/60 dark:focus:border-cyan-500/50 dark:focus:ring-1 dark:focus:ring-cyan-500/50"
      : "w-full pl-8 pr-8 py-1.5 border border-table-border dark:border-gray-600 rounded bg-table-bg dark:bg-gray-900 text-table-text dark:text-gray-200 focus:outline-none focus:border-table-accent dark:focus:border-blue-500";

  // Search and Close icon color
  const iconClass = isBrutalist
    ? "text-black dark:text-[#00ff00]"
    : isGlass
      ? "text-gray-600 dark:text-white/60"
      : "text-table-text-muted dark:text-gray-400";

  // Checklist scroll area
  const checklistContainerClass = isBrutalist
    ? "max-h-60 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar bg-[#ffeb3b]/10 dark:bg-[#1a1a1a]/30"
    : "max-h-60 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar";

  // Checklist labels (rows)
  const checklistRowClass = isBrutalist
    ? "flex items-center gap-2 px-2 py-1 hover:bg-black hover:text-[#00e5ff] dark:hover:bg-[#00ff00] dark:hover:text-black cursor-pointer rounded-none text-black dark:text-[#00ff00] font-mono transition-colors"
    : isGlass
      ? "flex items-center gap-2 px-2 py-1 hover:bg-white/35 dark:hover:bg-white/15 cursor-pointer rounded-md text-gray-900 dark:text-gray-100 transition-colors"
      : "flex items-center gap-2 px-2 py-1 hover:bg-table-row-hover dark:hover:bg-gray-700 cursor-pointer rounded text-table-text dark:text-gray-200";

  // Checkbox input classes
  const checkboxClass = isBrutalist
    ? "w-4 h-4 rounded-none border-2 border-black dark:border-[#00ff00] text-black dark:text-[#00ff00] focus:ring-0 cursor-pointer accent-black dark:accent-[#00ff00]"
    : isGlass
      ? "rounded border-white/40 dark:border-white/20 text-fuchsia-600 dark:text-cyan-500 focus:ring-fuchsia-500 dark:focus:ring-cyan-500 cursor-pointer"
      : "rounded border-table-border dark:border-gray-600 text-table-accent dark:text-blue-500 focus:ring-table-accent dark:focus:ring-blue-500 cursor-pointer";

  // Footer actions container
  const footerContainerClass = isBrutalist
    ? "p-2 border-t-4 border-black dark:border-[#00ff00] flex justify-end gap-2 bg-[#ffeb3b]/20 dark:bg-black rounded-none"
    : isGlass
      ? "p-2 border-t border-white/20 dark:border-white/20 flex justify-end gap-2 bg-white/20 dark:bg-black/20 backdrop-blur-md rounded-b-xl"
      : "p-2 border-t border-table-border dark:border-gray-700 flex justify-end gap-2 bg-table-header-bg dark:bg-gray-800 rounded-b-lg";

  // Clear button class
  const clearButtonClass = isBrutalist
    ? "px-3 py-1 border-2 border-black dark:border-[#00ff00] bg-white dark:bg-black text-black dark:text-[#00ff00] hover:bg-black hover:text-white dark:hover:bg-[#00ff00] dark:hover:text-black font-black uppercase text-xs transition-colors rounded-none"
    : isGlass
      ? "px-3 py-1 text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors text-xs font-medium"
      : "px-3 py-1 text-table-text-muted dark:text-gray-400 hover:text-table-text dark:hover:text-gray-200 rounded transition-colors text-xs font-medium";

  // Apply button class
  const applyButtonClass = isBrutalist
    ? "px-3 py-1 border-2 border-black dark:border-[#00ff00] bg-[#00e5ff] dark:bg-[#00ff00] text-black font-black uppercase hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-xs transition-colors rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
    : isGlass
      ? "px-3 py-1 bg-gradient-to-r from-fuchsia-600 to-violet-600 dark:from-cyan-600 dark:to-blue-600 text-white hover:brightness-110 shadow-[0_0_10px_rgba(219,39,119,0.2)] dark:shadow-[0_0_10px_rgba(6,182,212,0.2)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all text-xs font-medium"
      : "px-3 py-1 bg-table-accent dark:bg-blue-600 text-white hover:bg-table-accent-hover dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-xs font-medium";

  return (
    <div className="relative inline-flex items-center">
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
          className={twMerge(
            isDarkMode ? "dark" : "",
            isGlass
              ? "header-filter-popover fixed w-64 shadow-lg z-[100] flex flex-col font-normal text-sm"
              : isBrutalist
                ? "header-filter-popover fixed w-64 z-[100] flex flex-col font-normal text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,255,0,1)]"
                : "header-filter-popover fixed w-64 bg-table-bg dark:bg-gray-800 border border-table-border dark:border-gray-700 rounded-lg shadow-lg z-[100] flex flex-col font-normal text-sm",
            popoverClassName
          )}
          style={{ top: coords.top, left: coords.left }}
          onClick={e => e.stopPropagation()} // Prevent table sorting/interactions
        >
          {/* Search Input */}
          <div className={searchContainerClass}>
            <Search size={14} className={twMerge("absolute left-4 top-1/2 -translate-y-1/2", iconClass)} />
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              className={searchInputClass}
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
                className={twMerge("absolute right-4 top-1/2 -translate-y-1/2 hover:scale-110 transition-transform", iconClass)}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Checklist */}
          <div className={checklistContainerClass}>
            {!searchText && (
              <label className={checklistRowClass}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className={checkboxClass}
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
                  <label key={idx} className={checklistRowClass}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleValue(val)}
                      className={checkboxClass}
                    />
                    <span className="truncate" title={String(val)}>{String(val)}</span>
                  </label>
                );
              })
            )}
          </div>
          
          {/* Footer Actions */}
          <div className={footerContainerClass}>
            <button
              onClick={clearFilter}
              className={clearButtonClass}
            >
              Clear
            </button>
            <button
              onClick={applyFilter}
              disabled={stagedFilterValue.length === 0}
              className={applyButtonClass}
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
