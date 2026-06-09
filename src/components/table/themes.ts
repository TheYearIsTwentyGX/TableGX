import type { TableClassNames } from './types';

export const LIQUID_GLASS_THEME: TableClassNames = {
  container: 'bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-2xl rounded-3xl overflow-hidden relative isolate before:absolute before:inset-0 before:backdrop-blur-xl before:-z-10',
  headerRow: 'bg-white/30 dark:bg-white/10 backdrop-blur-md border-b border-white/30 dark:border-white/10',
  headerCell: 'text-gray-800 dark:text-gray-200 border-white/20 dark:border-white/5 font-bold uppercase tracking-wider !text-[10px]',
  bodyRow: 'transition-all duration-300 ease-out border-b border-white/10 dark:border-white/5 last:border-none hover:bg-white/20 dark:hover:bg-white/5 hover:bg-[image:radial-gradient(400px_circle_at_var(--cursor-x,50%)_var(--cursor-y,50%),rgba(255,255,255,0.15),transparent_40%)] dark:hover:bg-[image:radial-gradient(400px_circle_at_var(--cursor-x,50%)_var(--cursor-y,50%),rgba(255,255,255,0.08),transparent_40%)] hover:bg-fixed',
  bodyCell: 'text-gray-900 dark:text-gray-100',
  pinnedDivider: 'border-r border-white/30 dark:border-white/10 bg-white/40 dark:bg-white/5 backdrop-blur-xl',
  injectedBgClass: 'bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-500 dark:from-gray-900 dark:via-indigo-950 dark:to-black bg-fixed',
  tabStrip: 'bg-white/20 dark:bg-white/5 border-b border-white/30 dark:border-white/10 px-4 pt-3',
  tabButton: 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-white/50 dark:hover:border-white/20 rounded-t-lg',
  tabButtonActive: 'border-white dark:border-white/20 bg-white/40 dark:bg-white/15 text-gray-900 dark:text-white rounded-t-lg shadow-[0_-4px_12px_rgba(0,0,0,0.05)]',
  filterPopover: 'bg-white/70 dark:bg-white/10 backdrop-blur-md border border-white/50 dark:border-white/20 shadow-2xl dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] rounded-xl',
  scrollContainer: '[&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-black/20 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-corner]:bg-transparent'
};

export const BRUTALIST_THEME: TableClassNames = {
  container: 'bg-[#ffeb3b] dark:bg-[#1a1a1a] border-4 border-black dark:border-[#00ff00] rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(0,255,0,1)]',
  headerRow: 'bg-[#ff9800] dark:bg-[#1a1a1a] border-b-4 border-black dark:border-[#00ff00]',
  headerCell: 'text-black dark:text-[#00ff00] font-black uppercase tracking-tighter border-r-4 border-black dark:border-[#00ff00] last:border-r-0',
  bodyRow: 'border-b-4 border-black dark:border-[#00ff00] hover:bg-black dark:hover:bg-[#00ff00] data-[hovered=true]:bg-black dark:data-[hovered=true]:bg-[#00ff00] hover:text-[#00ff00] dark:hover:text-black data-[hovered=true]:text-[#00ff00] dark:data-[hovered=true]:text-black transition-none',
  bodyCell: 'font-mono uppercase text-black dark:text-[#00ff00]',
  pinnedDivider: 'border-r-4 border-black dark:border-[#00ff00] bg-[#ffeb3b] dark:bg-[#1a1a1a]',
  tabStrip: 'bg-[#e91e63] dark:bg-[#1a1a1a] border-b-4 border-black dark:border-[#00ff00] px-0 pt-0 flex gap-1',
  tabButton: 'border-4 border-black dark:border-[#00ff00] border-b-0 bg-white dark:bg-black text-black dark:text-[#00ff00] font-black uppercase hover:bg-black dark:hover:bg-[#00ff00] hover:text-white dark:hover:text-black',
  tabButtonActive: 'border-4 border-black dark:border-[#00ff00] border-b-0 bg-[#00e5ff] dark:bg-[#00ff00] text-black dark:text-black font-black uppercase shadow-[4px_0px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_0px_0px_0px_rgba(0,255,0,1)]',
  filterPopover: 'bg-white dark:bg-black border-4 border-black dark:border-[#00ff00] rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(0,255,0,1)] font-mono text-black dark:text-[#00ff00]',
  scrollContainer: '[&::-webkit-scrollbar]:w-4 [&::-webkit-scrollbar]:h-4 [&::-webkit-scrollbar-track]:bg-[#ffeb3b] dark:[&::-webkit-scrollbar-track]:bg-[#1a1a1a] [&::-webkit-scrollbar-thumb]:bg-black dark:[&::-webkit-scrollbar-thumb]:bg-[#00ff00] [&::-webkit-scrollbar-thumb]:rounded-none [&::-webkit-scrollbar-track]:border-l-4 [&::-webkit-scrollbar-track]:border-black dark:[&::-webkit-scrollbar-track]:border-[#00ff00] [&::-webkit-scrollbar-corner]:bg-black dark:[&::-webkit-scrollbar-corner]:bg-[#00ff00]'
};

export const LTCDATA_PLUS_THEME: TableClassNames = {
  container: 'bg-white dark:bg-[#272b36] border border-slate-200 dark:border-[#3a4150] rounded-md shadow-sm overflow-hidden',
  headerRow: 'bg-slate-50 dark:bg-[#2b303b] border-b border-slate-200 dark:border-[#3a4150]',
  headerCell: 'text-slate-600 dark:text-gray-300 font-bold text-[11px] uppercase tracking-wider border-r border-slate-200 dark:border-[#3a4150] last:border-r-0',
  bodyRow: 'border-b border-slate-200 dark:border-[#3a4150] hover:bg-slate-50 dark:hover:bg-[#323846] data-[hovered=true]:bg-slate-50 dark:data-[hovered=true]:bg-[#323846] transition-colors duration-150',
  bodyCell: 'text-sm text-slate-700 dark:text-gray-300',
  pinnedDivider: 'border-r border-slate-200 dark:border-[#3a4150] bg-white dark:bg-[#272b36]',
  tabStrip: 'bg-transparent border-b border-slate-200 dark:border-[#3a4150]',
  tabButton: 'border-transparent bg-transparent text-slate-500 dark:text-gray-400 hover:bg-slate-100/50 dark:hover:bg-[#323846]/50 hover:text-slate-700 dark:hover:text-gray-200',
  tabButtonActive: 'border-slate-200 dark:border-[#3a4150] bg-white dark:bg-[#2b303b] text-slate-900 dark:text-white',
  filterPopover: 'bg-white dark:bg-[#2b303b] border border-slate-200 dark:border-[#3a4150] rounded-md shadow-lg',
  scrollContainer: '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-[#4b5563] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-[#6b7280]'
};
