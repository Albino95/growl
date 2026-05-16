# Explore ranking — how it works

Implementation: `frontend/src/utils/exploreAlgorithm.ts`  
UI that loads data and calls it: `frontend/src/screens/Explore/ExploreScreen.tsx`  
Automated checks: `frontend/src/utils/exploreAlgorithm.test.ts` (run `npm test` in `frontend/`)

## Goal

Mix **feed posts** and **marketplace products** into one discovery stream that feels personalized but cheap to compute on-device.

## Score formula (posts)

For each post:

```
score = categoryMatch
      + recencyBoost * 0.6
      + min(40, (likes + comments) * 1.2)
      + jitter(id) * 8
```

- **categoryMatch** — Your onboarding paths like `art:violin` are expanded to `{ art, art:violin }`. We reward exact subcategory matches most, parent category matches less, and add a small fuzzy overlap between category strings.
- **recencyBoost** — `max(0, 48 - ageHours)` so fresh items from ~the last two days surface higher.
- **Engagement** — Likes + comments add signal but are capped so one viral thread cannot explode past everything else.
- **jitter** — Deterministic pseudo-random tie-break from the item id (stable across re-renders).

## Score formula (products)

Same category machinery, smaller recency multiplier, small bonus if `stock > 0`, lower jitter weight.

## Sorting

Sort all candidate rows by **score descending**. No MMR / diversity pass yet (that is the next architectural step when duplicates annoy people).

## Tests

Vitest covers cohort expansion, category preference vs mismatch, recency ordering, jitter stability, and end-to-end ordering with a frozen clock.

## Next upgrades (when you outgrow v1)

1. Friend / cohort boost using `GET /social/friends`.
2. Session memory: down-rank items already opened from Explore.
3. MMR or per-author caps for fairness.
4. Server-side “explore” endpoint if payloads get large (pagination + indices).
