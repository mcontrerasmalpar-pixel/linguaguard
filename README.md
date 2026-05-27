# LinguaGuard

A Reddit moderation tool that detects, translates, and acts on off-language posts and comments using Gemini AI.

## Features

- **Language detection**: Automatically identifies the language of any post or comment
- **Translation**: Translates content into the subreddit's required language (up to 80 words)
- **AI recommendation**: Gemini suggests `approve`, `remove`, or `review` with a one-sentence reason
- **Custom post UI**: Analysis results rendered as a rich Devvit Blocks panel — no modal forms
- **Mod actions**: Approve, remove, remove + DM author, review, or skip — all from a single panel
- **Rich mod notes**: Logs detected language, recommendation, and reason on removal
- **Configurable**: Set the required language code and name in app settings
- **Mod-only access**: Panel is restricted to verified moderators of the subreddit

## Tech Stack

- [Devvit](https://developers.reddit.com/) — Reddit's platform for building and deploying apps
- [@devvit/public-api `0.13.0`](https://www.npmjs.com/package/@devvit/public-api) — Blocks UI, custom posts, Redis, menu items, native AI
- [Gemini 2.0 Flash](https://deepmind.google/technologies/gemini/) — Language detection, translation, and moderation recommendations via Devvit native AI
- [TypeScript](https://www.typescriptlang.org/) — Type-safe development

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start playtesting

```bash
npm run dev
```

### 3. Upload to Devvit

```bash
npm run upload
```

### 4. Install on your subreddit

1. Go to [developers.reddit.com/apps/linguaguard](https://developers.reddit.com/apps/linguaguard)
2. Click **Install** and select your subreddit
3. Open the app settings panel and configure:
   - `allowed_lang` — ISO 639-1 language code (e.g. `en`, `es`, `de`)
   - `allowed_lang_name` — Human-readable name (e.g. `English`)

> No API key required — Gemini is accessed via Devvit's native AI integration.

## Project Structure

```
src/
├── main.ts       # App entry point: settings, Blocks UI, menu items
├── ai.ts         # Gemini analysis logic + JSON extraction + fallback
├── redis.ts      # Redis save/load/cleanup helpers (TTL: 15 min)
├── actions.ts    # Mod action execution (approve, remove, DM, review)
└── types.ts      # Shared TypeScript interfaces
```

## Commands

- `npm run dev` — Start playtest session with live reload
- `npm run upload` — Upload a new version to the Devvit app directory
- `npm run typecheck` — Run TypeScript type checking

## How It Works

1. A moderator right-clicks a post or comment and selects **"🌐 Translate & Review language"**
2. LinguaGuard sends the content to Gemini 2.0 Flash, which returns language, translation, summary, and a recommendation
3. A **custom post** is created in the subreddit with a full Devvit Blocks review panel
4. The mod sees: language badge, violation status, analysis card, translation, summary, AI reason, and 5 action buttons
5. The mod chooses an action; LinguaGuard executes it, shows a success toast, and cleans up Redis

## UI Overview

| Section | Description |
|---|---|
| Header bar | Teal background, 🌐 LinguaGuard title + language badge (e.g. `ES → EN`) |
| Rule status | Required language + ⚠️ Violation / ✅ Compliant badge |
| Analysis card | Detected language name + AI recommendation badge |
| Translation | Gemini translation of the content |
| Summary | One-sentence summary |
| Reason | AI explanation for the recommendation |
| Action buttons | Remove / Approve / Remove + DM / Review / Skip |

## Demo Scenarios

| Scenario | Expected recommendation |
|---|---|
| Post in required language | `approve` |
| Post clearly in another language | `remove` |
| Mixed-language or ambiguous content | `review` |

## Community Impact

LinguaGuard is designed for multilingual and language-specific communities on Reddit that enforce language rules in their rules, such as:

- **r/france** — French-only community with frequent off-language posts from non-native speakers
- **r/de** — German-language subreddit where moderators manually review hundreds of posts per week
- **r/chile** — Spanish-speaking community that receives English posts from international users

Moderators in these subreddits currently read, translate, and act on off-language content manually. LinguaGuard reduces that workflow from 3–5 minutes per item to under 30 seconds, with a consistent, AI-assisted decision and a full mod note on every action.

## Limitations

- No automatic moderation — all actions require moderator confirmation
- Analysis limited to first 1500 characters of content
- Review panel expires after 15 minutes (Redis TTL)
- Restricted to verified moderators of the subreddit

## Deployment

1. Run `npm run typecheck` to verify no type errors
2. Run `npm run upload` to publish to the Devvit app directory
3. Install the app on your subreddit from [developers.reddit.com/apps/linguaguard](https://developers.reddit.com/apps/linguaguard)
4. Configure `allowed_lang` and `allowed_lang_name` in App Settings
5. Test by right-clicking any post or comment as a moderator
