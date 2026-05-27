# Privacy Policy — LinguaGuard

**Last updated: May 2026**

## Overview

LinguaGuard is a Reddit moderation tool built on the Devvit platform. This policy describes what data the app accesses, how it is used, and how long it is retained.

## Data Accessed

LinguaGuard accesses the following data during a moderation session:

- **Post and comment content** — the text of the item being reviewed, used solely for language detection and translation
- **Author username** — stored to track moderation history per user within a subreddit
- **Moderator identity** — used to verify that the user triggering the panel is a subreddit moderator

## Data Storage

LinguaGuard uses Devvit's built-in Redis storage to temporarily hold review session data:

- **Review sessions**: stored for a maximum of **15 minutes** per session, then automatically deleted
- **Moderation history**: per-author decision logs are stored for up to **90 days** per subreddit, then automatically deleted

All data is stored within Devvit's infrastructure and is scoped to the specific subreddit where the app is installed.

## External Services

If a Gemini API key is configured by the subreddit administrator, post and comment text (up to 1,500 characters) is sent to the **Google Gemini API** for language analysis. This is optional — the app functions fully without it using local heuristic detection.

Refer to [Google's Privacy Policy](https://policies.google.com/privacy) for how Google handles data sent to its APIs.

## Data Sharing

LinguaGuard does not sell, share, or transmit any user data to third parties beyond the optional Gemini API call described above.

## Data Deletion

Session data is deleted automatically after 15 minutes. Author history data is deleted automatically after 90 days. No data persists beyond those windows.

## Contact

For questions or concerns, open an issue at [github.com/mcontrerasmalpar-pixel/linguaguard](https://github.com/mcontrerasmalpar-pixel/linguaguard).
