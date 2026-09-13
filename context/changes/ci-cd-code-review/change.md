---
change_id: ci-cd-code-review
title: CI/CD AI code review pipeline for pull requests
status: implemented
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Pipeline do code review na odznakę 10xChampion: niezależna paczka z Cursor SDK (lokalny runtime), structured JSON parsowany Zodem, composite action + workflow na PR do main, komentarz i etykiety z pętli agenta, evale promptfoo na 2–3 modelach. Bramka doradcza — człowiek ma ostatnie słowo.
