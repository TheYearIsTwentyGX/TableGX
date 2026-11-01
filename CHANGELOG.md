# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [3.7.1] — 2026-09-25

### Fixed

- A sorted grid (`initialSorting` or a user sort) that first rendered with empty
  `data` while its query loaded flashed every row with the "just added"
  highlight (`data-tgx-just-added`) when the data arrived. Rows that arrive
  while nothing has been shown yet are now treated as the baseline order.
  Rows added to a grid that already has rows still flash. Consumers that
  worked around this by remounting the table (e.g. a `key` that changes when
  loading finishes) can remove the workaround.
