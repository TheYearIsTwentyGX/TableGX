import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { twMerge } from 'tailwind-merge';
import type { ColumnFiltersState, Updater } from '@tanstack/react-table';
import type { TabbedTableProps, TabbedTableTab } from './types';
import { ReadOnlyTable } from './ReadOnlyTable';
import { EditableTable } from './EditableTable';
import { TabFilterWorker } from './TabFilterWorker';

export function TabbedTable<TRow extends Record<string, unknown>>(props: TabbedTableProps<TRow>) {
  const [activeTabId, setActiveTabId] = useState<string>(
    props.activeTabId ?? props.defaultTabId ?? props.tabs[0]?.id
  );
  
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
        />
      );
    }
  };

  return (
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
      <div className={twMerge("flex items-center justify-between border-b border-table-border dark:border-gray-700 bg-table-header-bg dark:bg-gray-800 px-2 pt-2", props.classNames?.tabStrip)}>
        <div className="flex space-x-2 overflow-x-auto">
          {props.tabs.map((tab) => {
            const isActive = tab.id === currentTabId;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={twMerge(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors relative",
                  isActive 
                    ? props.classNames?.tabButtonActive || 'border-table-accent dark:border-blue-500 text-table-accent dark:text-blue-400' 
                    : props.classNames?.tabButton || 'border-transparent text-table-text-muted dark:text-gray-400 hover:text-table-text dark:hover:text-gray-200 hover:border-table-border dark:hover:border-gray-600'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {props.actions && <div className="p-2">{props.actions}</div>}
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
  );
}
