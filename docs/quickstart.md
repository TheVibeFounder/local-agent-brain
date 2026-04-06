# Quickstart

Before you start:
- install Node.js 20 or newer
- make sure `sqlite3` works in your terminal
- keep your vault outside this repository

Stay in the root of the repository and run:

```bash
npm run brain -- init ./my-brain --profile research
npm run brain -- doctor --vault ./my-brain
npm run brain -- ingest ./tests/fixtures/meeting-notes.md --vault ./my-brain
npm run brain -- compile --vault ./my-brain
npm run brain -- promote <candidate-id> --vault ./my-brain
npm run brain -- query "What is local-agent-brain?" --vault ./my-brain --save
npm run brain -- lint --vault ./my-brain
```

To promote a candidate:

1. Open `my-brain/staging/wiki/`
2. Copy the candidate ID from the file name
3. Run:

```bash
npm run brain -- promote <candidate-id> --vault ./my-brain
```

After that, open:
- `my-brain/views/index.md`
- `my-brain/views/wiki.md`
- `my-brain/wiki/`

If you use Apple Notes instead of Obsidian:

1. Export a note from Apple Notes as a PDF, or copy it into a `.txt` or `.md` file.
2. Save the export somewhere outside the repo, for example `~/Documents/exports/`.
3. Ingest it:

```bash
npm run brain -- ingest ~/Documents/exports/my-note.pdf --vault ./my-brain
```

Sensitive-material warning:
- `brain ingest` blocks obvious secrets by default
- do not use this vault for passwords, bank credentials, private keys, or seed phrases
- only use `--allow-sensitive` if you intentionally run a separate local-only sensitive vault
