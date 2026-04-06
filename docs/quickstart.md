# Quickstart

Stay in the root of the repository and run:

```bash
npm run brain -- init ./my-brain --profile research
npm run brain -- doctor --vault ./my-brain
npm run brain -- ingest ./tests/fixtures/meeting-notes.md --vault ./my-brain
npm run brain -- compile --vault ./my-brain
npm run brain -- health-check --vault ./my-brain
npm run brain -- query "What is local-agent-brain?" --vault ./my-brain
```

To promote a candidate:

1. Open `my-brain/staging/memory/`
2. Copy the candidate ID from the file name
3. Run:

```bash
npm run brain -- promote <candidate-id> --vault ./my-brain
```
