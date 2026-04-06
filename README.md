# local-agent-brain

`local-agent-brain` helps you build a private, local knowledge workspace on your own computer.

The core idea is simple:
- you drop source material into a vault
- the app classifies each source before extracting from it
- it stages wiki pages for review
- you promote good pages into a maintained `wiki/`
- you can ask questions against that wiki and save strong answers back into it

This is not just “upload files and ask questions again.” It is a local workflow for building a maintained knowledge base.

## What V1 Now Does

V1 can:
- create a local vault
- ingest files, folders, or URLs
- classify sources before extraction
- stage wiki pages in `staging/wiki/`
- promote reviewed pages into `wiki/`
- add TLDRs and a `Counter-Arguments and Data Gaps` section to generated wiki pages
- answer grounded questions from local files
- save a good query answer back into `wiki/query-results/`
- lint the wiki for contradictions, stale pages, and orphan pages

V1 still does not do:
- background watch mode
- live connectors
- daily briefs
- tool execution
- cloud model routing

## One Important Rule

Do not mix your personal notes with agent-generated wiki content.

The safest setup is:
- one vault for your own thinking and notes
- one vault for agent-generated wiki pages

Inside this project, the agent-owned layer is `wiki/`.

## What You Need

Before you start, install:
- Node.js 20 or newer
- `sqlite3` available in your terminal

This repository does not need a separate `npm install` step right now because V1 has no external runtime dependencies.

## Privacy And Safety First

V1 is local-only by default:
- it does not call a cloud model
- it does not sync to a remote service
- it does not send your notes anywhere on its own

That said, if you ingest a file, the file is copied into your vault, indexed in `.brain/index.db`, and may be summarized into staged wiki pages.

Important:
- do not use this as a password manager
- do not ingest bank logins, private keys, seed phrases, or similar secrets into a general-purpose vault
- keep your actual vault outside this public Git repository

`brain ingest` now blocks obviously sensitive material by default. If you intentionally maintain a separate local-only sensitive vault, you can override that with `--allow-sensitive`.

## Easiest Way To Try It

Stay in the root of the repository and run these commands one by one:

```bash
npm run brain -- init ./my-brain --profile research
npm run brain -- doctor --vault ./my-brain
npm run brain -- ingest ./tests/fixtures/meeting-notes.md --vault ./my-brain
npm run brain -- compile --vault ./my-brain
npm run brain -- promote <candidate-id> --vault ./my-brain
npm run brain -- query "What is local-agent-brain?" --vault ./my-brain --save
npm run brain -- lint --vault ./my-brain
```

## What Those Commands Do

1. Create a new vault in `./my-brain`
2. Check that the vault structure is valid
3. Copy a sample source into the vault
4. Create staged wiki pages in `staging/wiki/`
5. Promote one staged page into `wiki/`
6. Ask a question and save the answer back into `wiki/query-results/`
7. Check the wiki for contradictions, stale pages, and orphan pages

## Where To Look After Running It

Open these folders or files:
- `my-brain/views/index.md`
- `my-brain/views/wiki.md`
- `my-brain/staging/wiki/`
- `my-brain/wiki/`
- `my-brain/wiki/query-results/`

That is the current “wiki” experience in V1. There is no separate web UI yet. The vault files are the product surface.

## Using Apple Notes

You do not need Obsidian.

If you use Apple Notes:
1. Open a note in Apple Notes.
2. Export it as a PDF, or copy the note into a `.txt` or `.md` file.
3. Save that file somewhere outside this repository, for example in `~/Documents/exports/`.
4. Ingest it into your vault:

```bash
npm run brain -- ingest ~/Documents/exports/my-note.pdf --vault ./my-brain
```

If you want to bring in several notes at once, export them into one folder and ingest the folder path instead.

## How Promotion Works

After `brain compile`, open `my-brain/staging/wiki/`.

Each candidate file:
- has frontmatter describing where it came from
- starts with a TLDR
- includes source classification
- includes `Counter-Arguments and Data Gaps`

Pick the candidate ID from the file name, then run:

```bash
npm run brain -- promote <candidate-id> --vault ./my-brain
```

That writes the reviewed page into `my-brain/wiki/`.

## Save Good Answers Back Into The Wiki

If a question produces a useful answer, save it:

```bash
npm run brain -- query "What is local-agent-brain?" --vault ./my-brain --save
```

That creates a `query-result` page in `my-brain/wiki/query-results/`.

## Commands

- `brain init <path> --profile research|creator|operator`
- `brain doctor --vault <path>`
- `brain ingest <file-or-folder-or-url> --vault <path>`
- `brain ingest <file-or-folder-or-url> --vault <path> --allow-sensitive`
- `brain compile [scope] --vault <path>`
- `brain promote <candidate-id> --vault <path>`
- `brain query "<question>" --vault <path>`
- `brain query "<question>" --vault <path> --save`
- `brain lint --vault <path>`
- `brain health-check --vault <path>`
- `brain decision new [question] --vault <path>`

## Notes

- `brain query` in V1 is retrieval-based. It does not call a cloud model.
- `.brain/` is rebuildable runtime state, not the source of truth.
- The maintained agent-owned knowledge layer is `wiki/`.
- The evidence layer is still `sources/` and `guides/`.
