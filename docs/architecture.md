# Architecture

V1 is a file-first knowledge kernel with a maintained wiki layer.

The durable system of record is the vault:
- `sources/` for captured evidence
- `guides/` for curated references
- `staging/wiki/` for reviewable generated wiki candidates
- `wiki/` for promoted agent-generated knowledge pages
- `decisions/` for decision records
- `.brain/` for rebuildable runtime state only

The compile flow is:
1. ingest raw sources
2. classify each source before extraction
3. write staged wiki candidates with TLDRs and counter-arguments
4. promote reviewed candidates into `wiki/`
5. query the local index
6. optionally save strong query answers back into `wiki/query-results/`

The runtime rebuilds `.brain/index.db` from vault files. Queries use that local index plus provenance-aware result formatting.

V1 intentionally avoids background daemons, live connectors, and tool execution.
