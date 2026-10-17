# Interview Prep PWA

A responsive, offline-capable interview preparation app built as a static PWA.

## Features

- Technology cards with dynamic question counts
- Live, case-insensitive technology catalog search
- One-question-at-a-time practice flow
- Responsive and accessible UI
- Search, bookmark, weak-mode, and random practice
- Separate English and Marathi answer cards, each with language-specific Read Aloud controls, plus an English Practice Mode
- Collapsible speech settings with automatic language-matched voices, speech speed, single-question playback, and inclusive question ranges
- Sequential playback from the current question or across the full question bank, with pause, resume, stop, replay, and navigation controls
- LocalStorage persistence and resume flow
- Installable PWA and offline caching

## Run locally

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.
