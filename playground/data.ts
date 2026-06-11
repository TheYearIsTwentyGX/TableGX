export type Person = {
  id: string
  name: string
  email: string
  role: string
  department: string
  status: string
  salary: number
  startDate: string
  active: boolean
  manager?: string
}

const firstNames = [
  'Ava', 'Liam', 'Mia', 'Noah', 'Emma', 'Ethan', 'Olivia', 'Lucas', 'Sophia', 'Mason',
  'Isabella', 'Logan', 'Amelia', 'James', 'Harper', 'Aiden', 'Evelyn', 'Jack', 'Abigail', 'Leo',
]
const lastNames = [
  'Carter', 'Reyes', 'Nguyen', 'Patel', 'Khan', 'Silva', 'Brooks', 'Foster', 'Hayes', 'Morgan',
  'Wells', 'Bauer', 'Cruz', 'Ito', 'Larsen', 'Mehta', 'Okafor', 'Park', 'Russo', 'Vega',
]
const roles = ['Engineer', 'Designer', 'Manager', 'Analyst', 'Recruiter']
const departments = ['Platform', 'Growth', 'Design', 'Finance', 'People']
const statuses = ['active', 'onLeave', 'archived']

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!
}

export const ROLE_OPTIONS = roles.map((r) => ({ label: r, value: r }))
export const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'On leave', value: 'onLeave' },
  { label: 'Archived', value: 'archived' },
]
export const DEPARTMENT_OPTIONS = departments.map((d) => ({ label: d, value: d }))

export function makePeople(count: number): Person[] {
  const out: Person[] = []
  for (let i = 0; i < count; i++) {
    const name = `${pick(firstNames, i)} ${pick(lastNames, i * 13 + Math.floor(i / 20) * 7 + 3)}`
    const dayOffset = (i * 37) % 1400
    const date = new Date(2021, 0, 1 + dayOffset)
    out.push({
      id: `p-${i + 1}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      role: pick(roles, i),
      department: pick(departments, i * 3),
      status: pick(statuses, i * 2),
      salary: 60000 + ((i * 4337) % 90000),
      startDate: date.toISOString().slice(0, 10),
      active: i % 3 !== 0,
      manager: i % 5 === 0 ? undefined : `${pick(firstNames, i + 4)} ${pick(lastNames, i + 9)}`,
    })
  }
  return out
}

export const people = makePeople(200)
