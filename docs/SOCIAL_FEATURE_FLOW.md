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
  - Own posts and friend posts only
  - Includes relevance and engagement metadata
- Explore:
  - Non-friend discovery only
  - Optional development mock fallback only when explicitly enabled

## Moderation model

- Relationships are stored in `user_relationships` table by edge type.
- Block/mute are applied server-side in feed and stories queries.
- Block removes active friendship edges between the two users.
- Report writes moderation records into `reports`.

## Story model

- Stories expire after 24 hours for public surfaces.
- Owners can retrieve longer history in profile context.
- View tracking is idempotent per viewer/story and excludes self-views.

## Quick navigation tips

- Start in route files to understand source-of-truth behavior.
- Then open matching frontend API client to see request contract.
- Finally inspect profile/feed screens for how state and UI consume those contracts.
