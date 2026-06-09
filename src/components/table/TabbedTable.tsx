import { useState, useCallback, useMemo, createContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import type { TabbedTableProps, TabbedTableTab, NumberFormatConfig, TableColumnMeta } from './types';
import { ReadOnlyTable } from './ReadOnlyTable';
import { EditableTable } from './EditableTable';
import { TabFilterWorker } from './TabFilterWorker';

export const TabActionsContext = createContext<HTMLDivElement | null>(null);

export function TabbedTable<TRow extends Record<string, unknown>>(props: TabbedTableProps<TRow>) {
  const [activeTabId, setActiveTabId] = useState<string>(
    props.activeTabId ?? props.defaultTabId ?? props.tabs[0]?.id
  );
  
  const [actionsContainer, setActionsContainer] = useState<HTMLDivElement | null>(null);
  
  // Controlled vs uncontrolled tab state
  const currentTabId = props.activeTabId !== undefined ? props.activeTabId : activeTabId;
  const currentTabIndex = props.tabs.findIndex(t => t.id === currentTabId);
  const activeTab = props.tabs[currentTabIndex] || props.tabs[0];

  const handleTabChange = (id: string) => {
    setActiveTabId(id);
    props.onActiveTabChange?.(id);
  };

  // We need to maintain direction state for framer-motion slide animation
  const [direction, setDirection] = useState(0);

  const setTab = (id: string) => {
    const newIdx = props.tabs.findIndex(t => t.id === id);
    setDirection(newIdx > currentTabIndex ? 1 : -1);
    handleTabChange(id);
  };

  // Cross-Tab Filtering
  const [tabFilters, setTabFilters] = useState<Record<string, ColumnFiltersState>>({});
  const [filteredIdsByTab, setFilteredIdsByTab] = useState<Record<string, Set<string>>>({});

  // Number Formatting Controls State
  const [internalNumberFormatConfig, setInternalNumberFormatConfig] = useState<NumberFormatConfig>({
    decimalPlaces: 2,
    thousandSeparator: true,
    negativeFormat: 'parentheses',
    negativeInRed: true,
    ...props.defaultNumberFormatConfig
  });

  const activeNumberFormatConfig = props.numberFormatConfig !== undefined 
    ? props.numberFormatConfig 
    : internalNumberFormatConfig;

  const handleNumberFormatConfigChange = useCallback((next: NumberFormatConfig) => {
    setInternalNumberFormatConfig(next);
    props.onNumberFormatConfigChange?.(next);
  }, [props.onNumberFormatConfigChange]);

  const hasNumericColumns = useMemo(() => {
    return props.tabs.some(tab => 
      tab.columns.some(col => {
        const meta = col.meta as TableColumnMeta<TRow> | undefined;
        return !!meta?.numberFormat;
      })
    );
  }, [props.tabs]);

  const hideDecimalsControl = useMemo(() => {
    const allNumericCols: any[] = [];
    const seenColIds = new Set<string>();

    props.tabs.forEach(tab => {
      tab.columns.forEach(col => {
        const id = col.id || (col as any).accessorKey;
        if (!id || seenColIds.has(id)) return;
        const meta = col.meta as TableColumnMeta<TRow> | undefined;
        if (meta?.numberFormat) {
          seenColIds.add(id);
          allNumericCols.push(col);
        }
      });
    });

    if (allNumericCols.length === 0) return false;

    return allNumericCols.every(col => {
      const meta = col.meta as TableColumnMeta<TRow> | undefined;
      return meta?.numberFormat?.isInteger === true || meta?.numberFormat?.decimalPlaces === 0;
    });
  }, [props.tabs]);

  const handleFilteredIdsChange = useCallback((tabId: string, ids: Set<string>) => {
    setFilteredIdsByTab((prev) => {
      // Quick shallow equality to avoid unneeded renders
      if (prev[tabId] && prev[tabId].size === ids.size) {
        let same = true;
        for (const id of ids) {
          if (!prev[tabId].has(id)) { same = false; break; }
        }
        if (same) return prev;
      }
      return { ...prev, [tabId]: ids };
    });
  }, []);

  const handleColumnFiltersChange = useCallback((updater: Updater<ColumnFiltersState>) => {
    setTabFilters(prev => {
      const current = prev[currentTabId] || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [currentTabId]: next };
    });
  }, [currentTabId]);

  const intersectedIds = useMemo(() => {
    let result: Set<string> | null = null;
    for (const tab of props.tabs) {
      const ids = filteredIdsByTab[tab.id];
      if (!ids) continue; // Not ready yet
      if (result === null) {
        result = new Set(ids);
      } else {
        const currentResult: Set<string> = result;
        const intersected = Array.from(currentResult).filter((id: string) => ids.has(id));
        result = new Set(intersected);
      }
    }
    return result;
  }, [filteredIdsByTab, props.tabs]);

  const displayData = useMemo(() => {
    if (!intersectedIds) return props.data;
    return props.data.filter((row) => intersectedIds.has(String(props.getRowId(row))));
  }, [props.data, intersectedIds, props.getRowId]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 1
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? '100%' : '-100%',
      opacity: 1
    })
  };

  const staticVariants = {
    enter: { x: 0 },
    center: { zIndex: 1, x: 0 },
    exit: { zIndex: 0, x: 0.01, transition: { duration: 0.25 } }
  };

  const getStorageKey = (tab: TabbedTableTab<TRow>) => {
    if (tab.columnVisibilityStorageKey) return tab.columnVisibilityStorageKey;
    const base = props.columnVisibilityStorageKeyBase || props.columnVisibilityStorageKey;
    if (base) return `${base}:${tab.id}`;
    return undefined;
  };

  const renderTabContent = (tab: TabbedTableTab<TRow>) => {
    if (tab.editable) {
      return (
        <EditableTable
          {...props}
          data={displayData}
          fullData={props.data}
          columns={tab.columns}
          frozenColumns={tab.frozenColumns}
          editableColumnIds={tab.editableColumnIds}
          onSaveEdit={tab.onSaveEdit}
          singleClickEdit={tab.singleClickEdit}
          getCellClassName={tab.getCellClassName}
          isSubmitting={tab.isSubmitting}
          initialSorting={tab.initialSorting}
          bordered={false}
          animateScrollOnly={props.animateScrollOnly}
          tabTransitionDirection={direction}
          classNames={props.classNames}
          columnFilters={tabFilters[tab.id] || []}
          onColumnFiltersChange={handleColumnFiltersChange}
          columnVisibilityStorageKey={getStorageKey(tab)}
          numberFormatConfig={activeNumberFormatConfig}
          onNumberFormatConfigChange={handleNumberFormatConfigChange}
          enableNumberFormatConfig={props.enableNumberFormatConfig && hasNumericColumns}
          hideDecimalsControl={hideDecimalsControl}
        />
      );
    } else {
      return (
        <ReadOnlyTable
          {...props}
          data={displayData}
          fullData={props.data}
          columns={tab.columns}
          frozenColumns={tab.frozenColumns}
          initialSorting={tab.initialSorting}
          bordered={false}
          animateScrollOnly={props.animateScrollOnly}
          tabTransitionDirection={direction}
          classNames={props.classNames}
          columnFilters={tabFilters[tab.id] || []}
          onColumnFiltersChange={handleColumnFiltersChange}
          columnVisibilityStorageKey={getStorageKey(tab)}
          numberFormatConfig={activeNumberFormatConfig}
          onNumberFormatConfigChange={handleNumberFormatConfigChange}
          enableNumberFormatConfig={props.enableNumberFormatConfig && hasNumericColumns}
          hideDecimalsControl={hideDecimalsControl}
        />
      );
    }
  };

  return (
    <TabActionsContext.Provider value={actionsContainer}>
      <div className={twMerge("flex flex-col h-full border border-table-border dark:border-gray-700 rounded-md overflow-hidden bg-table-bg dark:bg-gray-900", props.classNames?.container)}>
      
      {/* Hidden Headless Tab Filter Workers */}
      {props.tabs.map(tab => (
        <TabFilterWorker
          key={tab.id}
          tabId={tab.id}
          data={props.data}
          columns={tab.columns}
          getRowId={props.getRowId}
          columnFilters={tabFilters[tab.id] || []}
          onFilteredIdsChange={handleFilteredIdsChange}
        />
      ))}

      {/* Tab Strip */}
      <div className={twMerge("shrink-0 flex items-stretch justify-between gap-3 border-b border-table-border dark:border-gray-700 bg-table-header-bg dark:bg-gray-800/40 pr-2", props.classNames?.tabStrip)}>
        <div className="flex items-end overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {props.tabs.map((tab) => {
            const isActive = tab.id === currentTabId;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={twMerge(
                  "relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive 
                    ? props.classNames?.tabButtonActive || 'border-table-border dark:border-gray-700 bg-table-bg dark:bg-[#2b303b] text-table-text dark:text-gray-100' 
                    : props.classNames?.tabButton || 'border-transparent bg-transparent text-table-text-muted dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 hover:text-table-text dark:hover:text-gray-200'
                )}
              >
                {isActive && (
                  <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-table-bg dark:bg-[#2b303b]" />
                )}
                {isActive && (
                  <motion.span
                    layoutId="ts-tabbed-table-indicator"
                    className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-table-accent dark:bg-blue-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 p-2">
          {props.actions}
          <div ref={setActionsContainer} className="flex items-center gap-2" />
        </div>
      </div>

      {/* Tab Content Area */}
      <div className={twMerge("relative flex-1 overflow-hidden", props.classNames?.tabContentArea)}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={currentTabId}
            custom={direction}
            variants={props.animateScrollOnly ? staticVariants : slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.25 }}
            className="absolute inset-0"
          >
             {renderTabContent(activeTab)}
          </motion.div>
        </AnimatePresence>
      </div>
      </div>
    </TabActionsContext.Provider>
  );
}
