# Quickstart

```bash
npm run brain -- init ./demo-vault --profile research
cd demo-vault
npm --prefix .. run brain -- ingest ../tests/fixtures/meeting-notes.md
npm --prefix .. run brain -- compile
npm --prefix .. run brain -- health-check
npm --prefix .. run brain -- query "What is local-agent-brain?"
```

Promotion flow:

```bash
npm --prefix .. run brain -- compile
npm --prefix .. run brain -- promote <candidate-id>
```
