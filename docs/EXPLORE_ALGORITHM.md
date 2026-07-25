# Explore ranking — how it works

Implementation: `frontend/src/utils/ranking/`  
UI: `frontend/src/screens/Explore/ExploreScreen.tsx` (single scroll, multi-section)  
Tests: `frontend/src/utils/exploreAlgorithm.test.ts`

## Explore screen sections (top to bottom)

1. **Stories to meet** — horizontal story rings from `rankDiscoverPeople`
2. **Shop picks for you** — top 4 from `rankMarketplaceProducts`
3. **Posts for you** — 2-column grid from `rankExploreRows` (posts only)
4. **People to follow** — ranked people cards + Add Friend
5. **Reels & clips** — vertical list from `rankDiscoverReelPosts`

## Score formula (posts)

```
score = categoryMatch + recencyBoost*0.65 + engagementBoost + friendSignals + jitter*8
```

Shared primitives live in `ranking/scores.ts`. Products in Explore use `productScoreMultiplier` (default 0.45) so the feed stays post-first.

## Home feed (For You)

`GET /feed/feed?mode=foryou` returns:

```json
{ "following": [...], "suggested": [...] }
```

Each post includes `relevance_score` and `feed_section`. Cold-start fills `suggested` to at least 5 items when the user has onboarding categories.

## Marketplace ranking

`rankMarketplaceProducts` uses category paths, recency, stock, journal tag overlap (when available), and purchase affinity.

## Tests

Run `npm test` in `frontend/` (requires vitest config compatible with your Node version).
