# Tilt Detector

> Know when to log off before you actually tilt.

![Demo placeholder — add a screenshot or GIF here](./docs/demo.gif)

## The insight

League of Legends players who go on loss streaks tend to perform measurably worse as a session continues — CS drops, KDA falls, decision-making suffers. No existing tool surfaces this pattern in real time. **Tilt Detector** analyzes your last 100 games, groups them into play sessions, and tells you when your performance is degrading so you can log off before the spiral gets worse.

This is a portfolio project built for a Riot Games PM internship — the product framing matters as much as the code.

## What it does

1. Enter a summoner name and region (NA, EUW, KR)
2. Fetches the last 100 matches via the Riot Games API
3. Groups games into sessions (games within 2.5 hours = one session)
4. Detects tilt patterns within each session:
   - KDA drops 20%+ from first half to second half
   - CS/min drops 15%+ from first half to second half
   - 3+ consecutive losses in a session
5. Displays a session timeline, stat trend chart, tilt status card, and champion breakdown

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite |
| Backend | Firebase Cloud Functions (TypeScript) |
| Database | Firestore (30-min cache for processed summoner data) |
| Hosting | Firebase Hosting |

No traditional server — everything is serverless. All secrets live in the `.env/` folder (gitignored) and are never hardcoded in source.

## Environment variables

All secrets and config live in the `.env/` folder at the project root:

| File | Purpose |
|------|---------|
| `.env/functions.env` | `RIOT_API_KEY` for Cloud Functions |
| `.env/client.env` | Firebase web app config (`VITE_*` vars) |

Copy the `.example` files to get started:

```bash
cp .env/functions.env.example .env/functions.env
cp .env/client.env.example .env/client.env
```

Then fill in your values. These files are gitignored — never commit them.

## Why the cache?

Fetching 100 matches means 100 sequential Riot API calls (~6 seconds minimum with rate limiting). Firestore caches processed results for 30 minutes, so repeat searches on the same summoner return instantly and avoid hammering the API.

## Getting a Riot API key

1. Go to [developer.riotgames.com](https://developer.riotgames.com/)
2. Sign in with your Riot account
3. Register a product and generate a development API key (expires every 24 hours)
4. For production, apply for a personal/production key

## Setup

### Prerequisites

- Node.js 20+
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

### 1. Clone and install

```bash
cd tilt-detector
npm install --prefix functions
npm install --prefix client
```

### 2. Firebase project

```bash
firebase login
firebase use --add   # select your project, alias "default"
```

Update `.firebaserc` if needed with your project ID.

### 3. Environment files

```bash
cp .env/functions.env.example .env/functions.env
cp .env/client.env.example .env/client.env
```

Edit `.env/functions.env`:
```
RIOT_API_KEY=RGAPI-your-key-here
```

Edit `.env/client.env` with your Firebase web app config from Project Settings → General → Your apps.

**Production deploy** — also set the Riot key as a Firebase secret:
```bash
firebase functions:secrets:set RIOT_API_KEY
```

### 4. Run locally

**Terminal 1 — Firebase emulators (Functions + Firestore):**
```bash
cd functions && npm run serve
```

**Terminal 2 — Vite dev server:**
```bash
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 5. Deploy

```bash
cd client && npm run build
cd .. && firebase deploy
```

## Project structure

```
tilt-detector/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── components/     # SearchBar, TiltCard, SessionTimeline, etc.
│       ├── firebase.ts     # Firebase SDK init
│       └── App.tsx
├── functions/              # Cloud Functions
│   └── src/
│       ├── index.ts        # analyzePlayer callable function
│       ├── riotApi.ts      # Riot API calls
│       ├── sessionLogic.ts # Session grouping + tilt detection
│       └── types.ts
├── firebase.json
└── .firebaserc
```

## License

MIT — portfolio project, not affiliated with Riot Games.
