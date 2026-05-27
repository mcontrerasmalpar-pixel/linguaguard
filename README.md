# LinguaGuard

A Reddit moderation tool that detects, translates, and acts on off-language posts and comments. Uses a hybrid 3-layer analysis engine (script heuristics → word frequency → optional Gemini AI) and presents results in a rich 9-section mod review panel built with Devvit Blocks.

## Features

### Language Detection
- **3-layer hybrid engine**: script pattern detection → word-frequency heuristics → optional Gemini 2.0 Flash via REST API
- **Semantic signal generation**: produces human-readable signals like "Spanish greeting detected", "Spanish punctuation (¿)", "Majority Spanish vocabulary (62%)", "Mixed language content" instead of raw word matches
- **Confidence levels**: `high`, `medium`, `low` — with ambiguity classification (`low` / `medium` / `high`)
- **Graceful fallback**: fully functional without a Gemini API key using heuristic detection alone

### Mod Review Panel (9 sections)
- **Risk Header**: color-coded risk level (`LOW` / `MEDIUM` / `HIGH`) based on violation status, confidence, ambiguity, and author history
- **Interpretation Line**: plain-language summary — "Likely Spanish. Violates English-only rule. High confidence."
- **Decision Strip**: AI recommendation with source badge (`🤖 AI · 94%` or `🔍 Heuristic · 71%`) and ambiguity warning
- **Signal Strip**: up to 4 semantic evidence chips explaining why the content was flagged
- **Why This Was Flagged**: dominant card with reason, matched rule, and ambiguity label
- **Decision Trace**: visual pipeline — Detected language → Checked rule → Estimated confidence → Recommended action
- **Author Context**: per-author removal history (last 3 actions), repeat-offender detection at 3+ removals with auto-escalation to `REMOVE`
- **Moderator Review**: pre-action notice showing AI recommendation and override warning for quality tracking
- **Original vs Translation**: side-by-side columns

### Mod Actions
- **Remove** — removes content, adds mod note
- **Approve** — approves content
- **Remove + DM** — removes and sends a templated DM to the author explaining the rule
- **Send to review** — flags for manual review without acting
- **Dismiss** — skips with no action

### Override & Audit Trail
- Detects when a mod's choice differs from the AI recommendation
- Toast on override: "Override recorded — you chose remove instead of AI's approve."
- Mod note format: `[LinguaGuard] REMOVE post | lang: Spanish (es) | confidence: 87% | source: gemini | AI rec: remove | AI confirmed | reason: ...`
- Author history stored in Redis (90-day TTL, last 10 decisions) per subreddit

## Tech Stack

| | |
|---|---|
| Platform | [Devvit](https://developers.reddit.com/) `0.12.24` |
| UI | Devvit Blocks (JSX custom post, `height: "tall"`) |
| AI | [Gemini 2.0 Flash Lite](https://deepmind.google/technologies/gemini/) via direct REST API (optional) |
| Storage | Devvit Redis — review sessions (15-min TTL) + author history (90-day TTL) |
| Language | TypeScript (strict) |

## Project Structure

```
src/
├── main.tsx      # App entry: settings, 9-section Blocks UI, menu items, content analyzer
├── ai.ts         # 3-layer analysis: heuristic detection, semantic signals, Gemini REST
├── redis.ts      # Redis save/load/cleanup (19 keys per session, 15-min TTL)
├── actions.ts    # Mod action execution: approve, remove, DM, override detection, mod notes
├── history.ts    # Per-author decision history: record, load, count removals
└── types.ts      # Shared TypeScript interfaces
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Upload to Devvit

```bash
npx devvit upload
```

### 3. Install on your subreddit

1. Go to [developers.reddit.com/apps/linguaguard](https://developers.reddit.com/apps/linguaguard)
2. Click **Install** and select your subreddit
3. Configure app settings:
   - `allowed_lang` — ISO 639-1 language code (e.g. `en`, `es`, `de`)
   - `allowed_lang_name` — Human-readable name (e.g. `English`)
   - `gemini_api_key` — *(optional)* Google AI Studio key for AI-enhanced analysis

> The app works fully without a Gemini API key. Heuristic detection handles script-based languages (Japanese, Korean, Chinese, Arabic, Russian, Thai, Hindi) and Latin-script languages (Spanish, Portuguese, French, German, Italian).

### 4. Moderate

Right-click any post or comment as a moderator → **"🌐 Translate & Review language"** → open the generated review post.

## How It Works

```
Mod triggers menu item
        ↓
Content extracted (post title + body, or comment body)
        ↓
Layer 1: Script pattern detection (Unicode ranges)
  → high confidence if non-Latin script detected
        ↓ (if not high confidence)
Layer 2: Word-frequency heuristics (5 languages, 50–80 words each)
  → confidence: high / medium / low
        ↓ (if not high confidence)
Layer 3: Gemini 2.0 Flash Lite via REST API (if API key configured)
  → returns detected_lang, translation, recommendation, reason
        ↓
Semantic signals generated from matched patterns
Ambiguity classified (low / medium / high)
Result saved to Redis (19 keys, 15-min TTL)
        ↓
Review post created in subreddit
Mod opens post → 9-section panel loads
        ↓
Mod chooses action → executed via Reddit API
Override logged if mod disagrees with AI
Author history updated in Redis (90-day TTL)
```

## UI Reference

| Section | Content |
|---|---|
| Risk Header | `LOW / MEDIUM / HIGH RISK` color bar + detected lang → required lang badge |
| Interpretation Line | Plain-language verdict with capitalized confidence (High / Moderate / Low) |
| Decision Strip | Recommendation icon + source badge + ambiguity warning |
| Signal Strip | Up to 4 semantic evidence chips |
| Why This Was Flagged | Reason, matched rule, ambiguity label |
| Decision Trace | Detected language → Checked rule → Estimated confidence → Recommended action |
| Author Context | Author username, last 3 decisions, repeat-offender alert |
| Moderator Review | AI recommendation + override notice for quality tracking |
| Original vs Translation | Side-by-side columns |
| Actions | Remove · Approve · Remove + DM · Send to review · Dismiss |

## Risk Level Logic

| Condition | Risk |
|---|---|
| Content does not violate rule | `LOW` |
| Violation + medium confidence, or 1+ prior removals | `MEDIUM` |
| Violation + high confidence + low ambiguity, or 3+ prior removals | `HIGH` |

## Demo Scenarios

| Scenario | Detection | Expected recommendation |
|---|---|---|
| Post clearly in required language | Heuristic / AI | `approve` |
| Post clearly in another language | Heuristic (high confidence) | `remove` |
| Short or ambiguous content | Heuristic (low confidence) | `review` |
| Mixed-language content | Heuristic + AI | `review` |
| Author with 3+ prior removals | Any | Auto-escalated to `remove` |

## Limitations

- No automatic moderation — all actions require moderator confirmation
- Review panel expires after 15 minutes (Redis TTL)
- Heuristic word lists cover Spanish, Portuguese, French, German, Italian; AI covers all languages
- Analysis limited to first 1,500 characters (AI) or full text (heuristic)
- Panel restricted to verified subreddit moderators
