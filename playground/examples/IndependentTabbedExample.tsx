import { useMemo, useState } from 'react'
import {
  badgeColumn,
  dateColumn,
  independentTable,
  IndependentTabbedTable,
  numberColumn,
  selectColumn,
  textColumn,
  type IndependentTab,
} from 'tablegx'
import { DEPARTMENT_OPTIONS, makePeople, type Person } from '../data'
import { Section } from '../ui'

// Each tab below is a COMPLETELY separate table with its own row shape —
// nothing (sorting, filtering, selection, visibility) crosses between them.

type Invoice = {
  id: string
  number: string
  client: string
  amount: number
  status: string
  due: string
}

type Server = {
  id: string
  host: string
  region: string
  cpu: number
  uptimeDays: number
}

const INVOICE_STATUS = [
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
]

function makeInvoices(): Invoice[] {
  const clients = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli']
  const statuses = ['paid', 'pending', 'overdue']
  return Array.from({ length: 80 }, (_, i) => ({
    id: `inv-${i + 1}`,
    number: `INV-${2025}-${String(i + 1).padStart(4, '0')}`,
    client: clients[i % clients.length]!,
    amount: 500 + ((i * 977) % 12000),
    status: statuses[i % statuses.length]!,
    due: new Date(2025, 0, 1 + ((i * 11) % 360)).toISOString().slice(0, 10),
  }))
}

function makeServers(): Server[] {
  const regions = ['us-east', 'us-west', 'eu-central', 'ap-south']
  return Array.from({ length: 60 }, (_, i) => ({
    id: `srv-${i + 1}`,
    host: `node-${String(i + 1).padStart(3, '0')}.tgx.internal`,
    region: regions[i % regions.length]!,
    cpu: (i * 7) % 100,
    uptimeDays: (i * 13) % 400,
  }))
}

export function IndependentTabbedExample() {
  const [people] = useState<Person[]>(() => makePeople(120))
  const [invoices, setInvoices] = useState<Invoice[]>(() => makeInvoices())
  const [servers] = useState<Server[]>(() => makeServers())

  const tabs = useMemo<IndependentTab[]>(
    () => [
      independentTable<Person>({
        id: 'people',
        label: 'People',
        data: people,
        getRowId: (r) => r.id,
        columns: [
          textColumn('name', 'Name'),
          badgeColumn('role', 'Role'),
          selectColumn('department', 'Department', DEPARTMENT_OPTIONS),
        ],
        frozenColumns: 1,
        initialSorting: [{ id: 'name', desc: false }],
        enableRowSelection: true,
        enableColumnVisibility: true,
        columnVisibilityStorageKey: 'tgx-indep-people',
      }),
      independentTable<Invoice>({
        id: 'invoices',
        label: 'Invoices',
        data: invoices,
        getRowId: (r) => r.id,
        columns: [
          textColumn('number', 'Invoice #'),
          textColumn('client', 'Client'),
          numberColumn('amount', 'Amount', {
            editable: true,
            footerAggregate: 'sum',
            footerLabel: 'Total ',
            footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
          }),
          selectColumn('status', 'Status', INVOICE_STATUS),
          dateColumn('due', 'Due date'),
        ],
        frozenColumns: 1,
        enableFooter: true,
        enableColumnVisibility: true,
        columnVisibilityStorageKey: 'tgx-indep-invoices',
        // This tab is independently editable — edits never touch the others.
        editable: true,
        editableColumnIds: ['amount'],
        onSaveEdit: async (row, columnId, value) => {
          setInvoices((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, [columnId]: value } : r)),
          )
          return true
        },
      }),
      independentTable<Server>({
        id: 'servers',
        label: 'Servers',
        data: servers,
        getRowId: (r) => r.id,
        columns: [
          textColumn('host', 'Host'),
          selectColumn('region', 'Region', [
            { label: 'us-east', value: 'us-east' },
            { label: 'us-west', value: 'us-west' },
            { label: 'eu-central', value: 'eu-central' },
            { label: 'ap-south', value: 'ap-south' },
          ]),
          numberColumn('cpu', 'CPU %'),
          numberColumn('uptimeDays', 'Uptime (days)'),
        ],
        enableColumnVisibility: true,
        columnVisibilityStorageKey: 'tgx-indep-servers',
      }),
    ],
    [people, invoices, servers],
  )

  return (
    <Section
      title="IndependentTabbedTable"
      description="Three completely separate tables sharing only the tab strip and slide animation. Each tab has its own data and row shape — sorting, filtering, selection, and column visibility are independent and persist when switching tabs. The Invoices tab is independently editable."
    >
      <div className="flex h-[460px] flex-col">
        <IndependentTabbedTable tabs={tabs} defaultTabId="people" enableColumnJump />
      </div>
    </Section>
  )
}
