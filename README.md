# Tilt Detector

> Know when to log off before you actually tilt.

Tilt Detector is a React/Vite frontend demo for League of Legends players. It shows a session-aware tilt verdict, a win/loss timeline, and KDA plus CS/min trend diagnostics.

This version is intentionally frontend-only. It does not use Firebase or a backend service.

## What It Does

1. Enter a Riot ID or summoner-style name.
2. Pick a region.
3. Use the autocomplete dropdown to fill a `Name#Tag` style Riot ID.
4. Generate a local tilt analysis demo.
5. Show a verdict, session timeline, trend chart, and action recommendation.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React + Vite |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Backend | None |

## Setup

```bash
cd tilt-detector
npm install
npm install --prefix client
```

## Run Locally

```bash
npm run dev
```

Open the Vite URL shown in your terminal, usually:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

The production build is written to `client/dist`.

## Project Structure

```text
tilt-detector/
├── client/
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       └── lib/
│           ├── tilt.ts
│           └── tilt-mock.ts
└── package.json
```

## Note

This project is not endorsed by Riot Games. The current app uses local demo data; do not put a Riot API key in frontend code.
