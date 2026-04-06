# Architecture

V1 is a file-first knowledge kernel.

The durable system of record is the vault:
- `sources/` for captured evidence
- `memory/` for promoted durable knowledge
- `decisions/` for decision records
- `staging/` for durable review candidates
- `.brain/` for rebuildable runtime state only

The runtime rebuilds `.brain/index.db` from vault files. Queries use that local index plus provenance-aware result formatting.

V1 intentionally avoids background daemons, live connectors, and tool execution.
