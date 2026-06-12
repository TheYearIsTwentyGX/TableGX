---
name: TanStack number-column sort direction
description: Why a number/date column's first sort click reports "descending", not "ascending"
---

# Number/date columns sort descending-first

In this library's tables (TanStack Table under the hood), the **first** sort click on a
numeric or date column produces `aria-sort="descending"`, while text columns go
`ascending` first. This is TanStack's `sortDescFirst` default (true for number-typed
columns).

**Why:** cost a test failure — an assertion expected `ascending` after one click on a
`numberColumn`, but got `descending`.

**How to apply:** when writing tests or docs that assert sort state after a single
header click, expect `descending` for `numberColumn`/`dateColumn` and `ascending` for
`textColumn`/`badgeColumn`/`selectColumn`. Click twice to flip.
