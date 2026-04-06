# local-agent-brain

`local-agent-brain` is a local-first agent brain kernel for technical users.

V1 in this repository implements:
- vault initialization and validation
- local ingest into durable `sources/`
- compilation into durable `staging/`
- explicit promotion into `memory/`
- retrieval-based query with provenance
- decision record creation
- SQLite-backed local indexing in `.brain/index.db`

V1 deliberately does not ship daemon/watch mode, live connectors, or tool execution.

## Quickstart

```bash
npm run brain -- init ./demo-vault --profile research
cd demo-vault
npm --prefix .. run brain -- ingest ../tests/fixtures/meeting-notes.md
npm --prefix .. run brain -- compile
npm --prefix .. run brain -- query "What is local-agent-brain?"
```

## Commands

- `brain init <path> --profile research|creator|operator`
- `brain doctor`
- `brain ingest <file-or-folder-or-url>`
- `brain compile [scope]`
- `brain query "<question>"`
- `brain health-check`
- `brain promote <candidate-id>`
- `brain decision new [question]`

## Repository Layout

```text
docs/                 Product and architecture docs
packages/             Core, CLI, and future packages
template/vault/       Canonical vault scaffold
tests/                V1 workflow tests
```

## Notes

- The CLI is dependency-light and uses the system `sqlite3` binary for indexing.
- `brain query` in V1 is retrieval-based. It does not require a cloud model.
- `brain.config.yaml` is emitted as JSON-compatible YAML so it remains human-readable and easy to parse without extra runtime dependencies.
