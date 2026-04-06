# local-agent-brain

`local-agent-brain` helps you build a private, local knowledge workspace on your own computer.

You can drop in notes, transcripts, drafts, or documents, and the app will:
- save them into a structured vault
- create reviewable summaries in `staging/`
- let you promote good summaries into long-term `memory/`
- answer questions from your local files with provenance

V1 is intentionally simple:
- no account required
- no cloud required
- no background daemon
- no live app connectors yet

## Who This Is For

This version is best for people who want:
- a private second brain that lives in files
- a system they can inspect and back up themselves
- a local workflow for research, notes, and structured memory

If you want something that runs in the background, syncs live with apps, or takes actions for you, those are later versions.

## What You Need

Before you start, install:
- Node.js 20 or newer
- `sqlite3` available in your terminal

This repository does not need a separate `npm install` step right now because V1 has no external runtime dependencies.

## Easiest Way To Try It

After downloading or cloning the repo, stay in the repo folder and copy-paste these commands one by one:

```bash
npm run brain -- init ./my-brain --profile research
npm run brain -- doctor --vault ./my-brain
npm run brain -- ingest ./tests/fixtures/meeting-notes.md --vault ./my-brain
npm run brain -- compile --vault ./my-brain
npm run brain -- query "What is local-agent-brain?" --vault ./my-brain
```

What those commands do:
1. Create a new vault in `./my-brain`
2. Check that the vault structure is valid
3. Copy a sample note into the vault
4. Create durable review candidates in `staging/`
5. Answer a question using the local index

## What You Will See

After the quickstart:
- your source file will be inside `my-brain/sources/`
- a candidate summary will be inside `my-brain/staging/memory/`
- a local index will exist at `my-brain/.brain/index.db`
- the query command will print an answer plus the files it used

## Promote A Candidate Into Memory

Open `my-brain/staging/memory/` and look for the candidate file name. It will start with an ID.

Then run:

```bash
npm run brain -- promote <candidate-id> --vault ./my-brain
```

That moves the reviewed result into `my-brain/memory/syntheses/`.

## Make A Decision Record

```bash
npm run brain -- decision new "Should I keep this workflow local-first?" --vault ./my-brain
```

This creates a decision file in `my-brain/decisions/`.

## Commands

V1 commands:
- `brain init <path> --profile research|creator|operator`
- `brain doctor --vault <path>`
- `brain ingest <file-or-folder-or-url> --vault <path>`
- `brain compile [scope] --vault <path>`
- `brain query "<question>" --vault <path>`
- `brain health-check --vault <path>`
- `brain promote <candidate-id> --vault <path>`
- `brain decision new [question] --vault <path>`

## What V1 Does Not Do Yet

Not in V1:
- background watch mode
- live connectors
- daily briefs
- tool execution
- cloud model routing

## Repository Layout

```text
docs/                 Product and architecture docs
packages/             Core and CLI code
template/vault/       The vault structure created by `brain init`
tests/                V1 workflow tests
```

## Notes

- `brain query` in V1 is retrieval-based. It does not call a cloud model.
- `.brain/` is rebuildable runtime state, not the source of truth.
- The source of truth is the vault itself: `sources/`, `memory/`, `decisions/`, `staging/`, and the other top-level folders.
