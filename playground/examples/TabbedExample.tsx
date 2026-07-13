import { useMemo, useState } from 'react'
import {
  badgeColumn,
  CellOverflowList,
  customColumn,
  dateColumn,
  numberColumn,
  selectColumn,
  TabbedTable,
  textColumn,
  type ColumnDef,
  type TabbedTableTab,
} from 'tablegx'
import {
  DEPARTMENT_OPTIONS,
  makePeople,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  type Person,
} from '../data'
import { Pill, Section, Select, Toggle } from '../ui'

type RecordCountChoice = 'off' | 'top' | 'bottom'

// --- Completely serious, business-critical extra fields ---
type FunPerson = Person & {
  coffeeOrder: string
  snackBudget: number
  vibeScore: number
  spiritAnimal: string
  deskPlant: string
  karaokeSong: string
  slackEmoji: string
  petName: string
  favoriteFont: string
  standupExcuse: string
  chaosLevel: number
  // Extra Overview columns purely to make that tab wide enough to require
  // horizontal scrolling — handy for exercising the column-jump scroll.
  deskToyCount: number
  mondayMood: string
  slackStatus: string
  timezone: string
  wfhDaysPerWeek: number
  onboardingBuddy: string
  favoriteMeetingRoom: string
  printerRage: number
  lastVacation: string
  secretTalent: string
}

const COFFEE = [
  'Oat flat white',
  'Cold brew, no ice',
  'Triple espresso',
  'Matcha latte',
  'Drip, black',
  'Caramel macchiato',
  'Decaf (coward)',
  'Chai oat latte',
]
const SPIRIT_ANIMALS = [
  'Otter',
  'Raccoon',
  'Capybara',
  'Axolotl',
  'Corgi',
  'Peregrine falcon',
  'Sloth',
  'Narwhal',
]
const DESK_PLANTS = [
  'Succulent',
  'Pothos',
  'Snake plant',
  'Cactus',
  'Fern',
  'Monstera',
  'Plastic one',
  'Basil (dying)',
]
const KARAOKE = [
  'Mr. Brightside',
  'Bohemian Rhapsody',
  'Wonderwall',
  "Don't Stop Believin'",
  'Africa',
  'Shake It Off',
  'Sweet Caroline',
  'Take On Me',
]
const SLACK_EMOJI = ['🚀', '🔥', '👀', '🧠', '🐢', '🌮', '☕', '🦝']
const PET_NAMES = [
  'Sir Barksalot',
  'Noodle',
  'Pixel',
  'Waffles',
  'Mr. Whiskers',
  'Biscuit',
  'Gandalf',
  'Taco',
]
const FONTS = [
  'Comic Sans (ironically)',
  'Helvetica',
  'Inter',
  'Papyrus (fired)',
  'Times New Roman',
  'Monaco',
  'Wingdings',
  'Arial',
]
const EXCUSES = [
  'Blocked on coffee',
  'In a meeting about meetings',
  'Mercury is in retrograde',
  'Waiting on CI',
  'Cat sat on the keyboard',
  'Works on my machine',
  'Refactoring vibes',
  'Just one more PR',
]
const MOODS = ['Optimistic', 'Caffeinated', 'In denial', 'Ready', 'Still asleep', 'Feral']
const SLACK_STATUSES = [
  'Heads down 🎧',
  'brb snacks',
  'In a meeting',
  'Vibing',
  'Deep in the weeds',
  'Out sick',
]
const TIMEZONES = ['PST', 'MST', 'CST', 'EST', 'GMT', 'CET', 'JST', 'AEST']
const BUDDIES = [
  'Priya',
  'Marcus',
  'Yuki',
  'Fatima',
  'Diego',
  'Ingrid',
  'Kwame',
  'Soo-ah',
]
const MEETING_ROOMS = ['The Fishbowl', 'Narnia', 'Bat Cave', 'The Aquarium', 'Basecamp']
const SECRET_TALENTS = [
  'Can solve a Rubik’s cube blindfolded',
  'Competitive yo-yoer',
  'Makes killer sourdough',
  'Speedcubes CSS selectors',
  'Whistles the Star Wars theme',
  'Undefeated at foosball',
]

function at<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length]!
}

function daysAgoIso(days: number): string {
  const d = new Date(2024, 0, 1)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function makeFunPeople(count: number): FunPerson[] {
  return makePeople(count).map((p, i) => ({
    ...p,
    coffeeOrder: at(COFFEE, i),
    snackBudget: 15 + ((i * 7) % 85),
    vibeScore: (i * 17) % 101,
    spiritAnimal: at(SPIRIT_ANIMALS, i * 3),
    deskPlant: at(DESK_PLANTS, i * 5),
    karaokeSong: at(KARAOKE, i * 2),
    slackEmoji: at(SLACK_EMOJI, i),
    petName: at(PET_NAMES, i * 4),
    favoriteFont: at(FONTS, i * 6),
    standupExcuse: at(EXCUSES, i * 9),
    chaosLevel: 1 + ((i * 3) % 11),
    deskToyCount: (i * 2) % 9,
    mondayMood: at(MOODS, i * 5),
    slackStatus: at(SLACK_STATUSES, i * 7),
    timezone: at(TIMEZONES, i),
    wfhDaysPerWeek: i % 6,
    onboardingBuddy: at(BUDDIES, i * 3),
    favoriteMeetingRoom: at(MEETING_ROOMS, i * 2),
    printerRage: 1 + ((i * 4) % 10),
    lastVacation: daysAgoIso((i * 13) % 400),
    secretTalent: at(SECRET_TALENTS, i * 8),
  }))
}

export function TabbedExample() {
  const [rows, setRows] = useState<FunPerson[]>(() => makeFunPeople(120))
  const [selectable, setSelectable] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [recordCount, setRecordCount] = useState<RecordCountChoice>('top')

  const overviewColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      badgeColumn('role', 'Role'),
      // Custom overflow cell — the same renderCell + CellOverflowList primitive
      // works unchanged on TabbedTable via the shared BodyCell.
      customColumn<FunPerson>(
        'skills',
        'Skills',
        ({ value }) => (
          <CellOverflowList>
            {((value as string[]) ?? []).map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </CellOverflowList>
        ),
        {
          measureText: (row) => ((row.skills as string[]) ?? []).join('  '),
          maxColumnWidth: 240,
        },
      ),
      selectColumn('status', 'Status', STATUS_OPTIONS),
      dateColumn('startDate', 'Start date'),
      // Extra columns purely to make Overview wide enough to require
      // horizontal scrolling — handy for testing the column-jump scroll.
      numberColumn('deskToyCount', 'Desk toys'),
      badgeColumn('mondayMood', 'Monday mood'),
      textColumn('slackStatus', 'Slack status'),
      textColumn('timezone', 'Timezone'),
      numberColumn('wfhDaysPerWeek', 'WFH days/week'),
      textColumn('onboardingBuddy', 'Onboarding buddy'),
      textColumn('favoriteMeetingRoom', 'Favorite meeting room'),
      numberColumn('printerRage', 'Printer rage (1-10)'),
      dateColumn('lastVacation', 'Last vacation'),
      textColumn('secretTalent', 'Secret talent'),
    ],
    [],
  )

  const compensationColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      numberColumn('salary', 'Salary', {
        editable: true,
        footerAggregate: 'avg',
        footerLabel: 'Avg ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
      selectColumn('department', 'Department', [
        { label: 'Platform', value: 'Platform' },
        { label: 'Growth', value: 'Growth' },
        { label: 'Design', value: 'Design' },
        { label: 'Finance', value: 'Finance' },
        { label: 'People', value: 'People' },
      ]),
    ],
    [],
  )

  const contactColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('email', 'Email'),
      selectColumn('role', 'Role', ROLE_OPTIONS),
    ],
    [],
  )

  const coffeeColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('coffeeOrder', 'Coffee order'),
      numberColumn('snackBudget', 'Weekly snack budget', {
        footerAggregate: 'sum',
        footerLabel: 'Total ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
    ],
    [],
  )

  const vibesColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      numberColumn('vibeScore', 'Vibe score', {
        footerAggregate: 'avg',
        footerLabel: 'Avg ',
        footerFormat: (v) => `${Math.round(v)} / 100`,
      }),
      badgeColumn('spiritAnimal', 'Spirit animal'),
      textColumn('deskPlant', 'Desk plant'),
    ],
    [],
  )

  const karaokeColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('karaokeSong', 'Karaoke go-to'),
      textColumn('slackEmoji', 'Status emoji'),
    ],
    [],
  )

  const petsColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('petName', 'Pet name'),
      badgeColumn('department', 'Department'),
    ],
    [],
  )

  const orgColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('manager', 'Reports to'),
      selectColumn('department', 'Department', DEPARTMENT_OPTIONS),
    ],
    [],
  )

  const fontColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      badgeColumn('favoriteFont', 'Favorite font'),
    ],
    [],
  )

  const excuseColumns = useMemo<ColumnDef<FunPerson, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('standupExcuse', 'Standup excuse'),
      numberColumn('chaosLevel', 'Chaos level', {
        footerAggregate: 'max',
        footerLabel: 'Peak ',
        footerFormat: (v) => `${Math.round(v)} / 11`,
      }),
    ],
    [],
  )

  const tabs = useMemo<TabbedTableTab<FunPerson>[]>(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        columns: overviewColumns,
        frozenColumns: 1,
        initialSorting: [{ id: 'name', desc: false }],
      },
      {
        id: 'compensation',
        label: 'Compensation',
        columns: compensationColumns,
        frozenColumns: 1,
        editable: true,
        editableColumnIds: ['salary'],
        onSaveEdit: async (row, columnId, value) => {
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, [columnId]: value } : r)),
          )
          return true
        },
      },
      { id: 'contact', label: 'Contact', columns: contactColumns },
      { id: 'coffee', label: 'Coffee & Snacks', columns: coffeeColumns },
      { id: 'vibes', label: 'Vibes & Spirit Animals', columns: vibesColumns },
      { id: 'karaoke', label: 'Karaoke Lineup', columns: karaokeColumns },
      { id: 'pets', label: 'Pets of the Office', columns: petsColumns },
      { id: 'org', label: 'Org Chart', columns: orgColumns },
      { id: 'fonts', label: 'Font Crimes', columns: fontColumns },
      { id: 'excuses', label: 'Standup Excuses', columns: excuseColumns },
    ],
    [
      overviewColumns,
      compensationColumns,
      contactColumns,
      coffeeColumns,
      vibesColumns,
      karaokeColumns,
      petsColumns,
      orgColumns,
      fontColumns,
      excuseColumns,
    ],
  )

  return (
    <Section
      title="TabbedTable"
      description="Multiple views over one dataset with shared selection, cross-tab filter intersection, fully-shared sorting (sorting by any column — even one only one tab shows, like Salary or Email — reorders the rows on every tab), and a sliding tab strip. There are more tabs than fit, so the strip scrolls horizontally (wheel / trackpad / keyboard) while the filter badges and action buttons keep their place. The Compensation tab is inline-editable."
      controls={
        <>
          <Select<RecordCountChoice>
            label="Record count"
            value={recordCount}
            onChange={setRecordCount}
            options={[
              { label: 'Off', value: 'off' },
              { label: 'Top (toolbar)', value: 'top' },
              { label: 'Bottom (status bar)', value: 'bottom' },
            ]}
          />
          <Toggle label="Row selection" checked={selectable} onChange={setSelectable} />
          {selectable && (
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          )}
        </>
      }
    >
      <div className="flex h-[460px] flex-col">
        <TabbedTable<FunPerson>
          data={rows}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          enableFooter
          enableColumnVisibility
          enableMultiSort
          enableSortHierarchy
          enableRecordCount={recordCount !== 'off'}
          recordCountPosition={recordCount === 'off' ? undefined : recordCount}
          enableRowSelection={selectable}
          selectedRowIds={selected}
          onSelectedRowIdsChange={setSelected}
          enableTabColumnPreview
          enableColumnJump
        />
      </div>
    </Section>
  )
}
