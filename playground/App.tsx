import { useEffect, useState, type ReactNode } from 'react'
import { EditableExample } from './examples/EditableExample'
import { IndependentTabbedExample } from './examples/IndependentTabbedExample'
import { ReadOnlyExample } from './examples/ReadOnlyExample'
import { TabbedExample } from './examples/TabbedExample'

type Page = {
  path: string
  label: string
  render: () => ReactNode
}

const pages: Page[] = [
  { path: '/read-only', label: 'ReadOnlyTable', render: () => <ReadOnlyExample /> },
  { path: '/editable', label: 'EditableTable', render: () => <EditableExample /> },
  { path: '/tabbed', label: 'TabbedTable', render: () => <TabbedExample /> },
  {
    path: '/independent-tabbed',
    label: 'IndependentTabbedTable',
    render: () => <IndependentTabbedExample />,
  },
]

const DEFAULT_PATH = pages[0]!.path

function useHashRoute() {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || DEFAULT_PATH)
  useEffect(() => {
    const onHash = () => setPath(window.location.hash.slice(1) || DEFAULT_PATH)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return path
}

function useDarkMode() {
  const [dark, setDark] = useState(true)
  // The library resolves its design tokens from `:where(.dark)`, and Radix
  // overlays portal to <body> — so the class must live on the document root,
  // not a nested wrapper, or those surfaces stay light.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return [dark, setDark] as const
}

export function App() {
  const path = useHashRoute()
  const [dark, setDark] = useDarkMode()
  const active = pages.find((p) => p.path === path) ?? pages[0]!

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">tablegx playground</h1>
            <p className="text-sm text-muted-foreground">
              Live examples wired to the library source.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {pages.map((page) => {
            const isActive = page.path === active.path
            return (
              <a
                key={page.path}
                href={`#${page.path}`}
                className={
                  isActive
                    ? 'relative -mb-px border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground'
                    : 'relative -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
                }
              >
                {page.label}
              </a>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">{active.render()}</main>
    </div>
  )
}
