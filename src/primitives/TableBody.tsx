import { useTableStore } from './store'

/**
 * Renders the active tab's table body with no slide animation. Use this for a
 * plain (no-tab) composition — leaving out `TableTabStrip`/`TablePanels` keeps
 * the framer-motion tab animation code out of the bundle entirely.
 */
export function TableBody() {
  const { activeTab, getBodyArgs } = useTableStore()
  if (!activeTab) return null
  return <>{activeTab.render(getBodyArgs())}</>
}
