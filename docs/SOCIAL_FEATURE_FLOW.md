# Social Feature Flow Guide

This guide explains the main social flows (friends, moderation, stories, feed/explore) and where to navigate in code quickly.

## Core backend entry points

- `backend/src/routes/friends.ts`
  - Friend graph helpers (`ensureBidirectionalFriend`, `areFriends`, `getFriendUserIds`)
  - Cohort sync (`syncCategoryCohortFriends`, `syncCohortFriendsRoute`)
  - Moderation APIs (`blockUser`, `unblockUser`, `muteUser`, `unmuteUser`, `reportUser`)
- `backend/src/routes/feed.ts`
  - Timeline fetch and ranking (`getFeed`)
  - Feed item write operations (`createPost`, `toggleLike`)
  - Profile feed retrieval (`getUserPosts`)
- `backend/src/routes/stories.ts`
  - Story ring list (`getStories`)
  - Per-profile story list (`getUserStories`)
  - Story lifecycle (`createStory`, `viewStory`, `deleteStory`)

## Frontend API clients

- `frontend/src/services/api/friends.ts`
  - Thin wrappers around social endpoints
  - Safe defaults for status/list fetches to keep UI resilient
- `frontend/src/services/api/stories.ts`
  - Story list/create/view wrappers
  - Supports `mode=explore` path for discovery surfaces

## Profile surfaces

- `frontend/src/screens/Profile/ProfileScreen.tsx`
  - Own profile orchestration (`loadProfileContent`)
  - Category update and cohort re-sync (`handleUpdateCategories`)
  - Story viewer bridge (`openStoriesViewer`)
- `frontend/src/screens/Profile/PublicProfileScreen.tsx`
  - Public profile content loading (`loadProfile`, `loadContent`)
  - Relationship CTA handling (`onToggleFriend`)
  - Moderation actions from options sheet (block/mute/report)
  - Story viewer state + view tracking (`openStoryViewer`)

## Feed vs explore behavior

- Home feed:
  - Own posts and friend posts only (including cross-path friends)
  - Includes relevance and engagement metadata
  - Category chips filter by post category only (All = every friend post)
- Explore:
  - Non-friend discovery only
  - People search via `GET /social/search?q=`
  - Optional development mock fallback only when explicitly enabled
- Reels viewer:
  - `mode=home` (default): for-you / friends+suggested reels (Home entry)
  - `mode=explore`: discovery reels from explore feed (Explore entry)

## Cohort path change

- Profile category save runs `resyncCategoryCohortFriends` (detach non-overlapping cohort edges, attach new).
- Manual friendships (`source=manual`) are preserved across path changes.
- UI shows consent warning + full-screen sync overlay while attach/detach runs.

## Moderation model

- Relationships are stored in `user_relationships` table by edge type.
- Block/mute are applied server-side in feed and stories queries.
- Block removes active friendship edges between the two users.
- Report writes moderation records into `reports`.
- Staff decide (Admin web / `POST /admin/moderation/reports/:id/decision`) **soft-hides** content via `is_hidden` — consumer feed/detail omit or 404 hidden rows. Protected review/demo emails cannot be enforced.
- Ops deploy and smoke: [`docs/ADMIN_PHASE0_DEPLOY.md`](ADMIN_PHASE0_DEPLOY.md), console: [`admin/README.md`](../admin/README.md).

## Story model

- Stories expire after 24 hours for public surfaces.
- Owners can retrieve longer history in profile context.
- View tracking is idempotent per viewer/story and excludes self-views.

## Quick navigation tips

- Start in route files to understand source-of-truth behavior.
- Then open matching frontend API client to see request contract.
- Finally inspect profile/feed screens for how state and UI consume those contracts.
