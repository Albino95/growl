#!/usr/bin/env node
/**
 * Generates backend/scripts/seed-demo-social-dense.sql
 * Crowd accounts with realistic avatars, bios/statuses, Unsplash posts, stories, friends, likes.
 *
 * Password for all crowd accounts: GrowlDemo123!
 * (same SHA-256 hex as core demo accounts)
 *
 * Run:
 *   node scripts/generate-dense-social-seed.js
 *   npm run seed:social:dense:local
 *   npm run seed:social:dense:qa
 */
const fs = require('fs');
const path = require('path');

const USER_COUNT = 220;
const POST_COUNT = 700;
const STORY_COUNT = 200;
const PASS_HASH = 'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a'; // GrowlDemo123!

const CATEGORY_PATHS = [
  'fitness:losing-weight',
  'fitness:building-muscle',
  'fitness:cardio',
  'fitness:flexibility',
  'art:piano',
  'art:violin',
  'art:drawing',
  'art:photography',
  'nutrition:meal-planning',
  'nutrition:healthy-eating',
  'mindset:meditation',
  'mindset:discipline',
  'mindset:focus',
];

const FIRST = [
  'Jordan', 'River', 'Casey', 'Morgan', 'Sam', 'Avery', 'Nina', 'Leo', 'Mia', 'Kai',
  'Quinn', 'Reese', 'Blake', 'Drew', 'Skyler', 'Parker', 'Jamie', 'Cameron', 'Hayden', 'Rowan',
  'Finley', 'Sage', 'Emerson', 'Phoenix', 'Dakota', 'Taylor', 'Alex', 'Charlie', 'Riley', 'Jesse',
  'Harper', 'Eden', 'Lane', 'Marley', 'Oakley', 'Peyton', 'Remy', 'Shannon', 'Tatum', 'Winter',
  'Amara', 'Noah', 'Sofia', 'Liam', 'Elena', 'Marcus', 'Priya', 'Diego', 'Yuki', 'Omar',
  'Chloe', 'Ethan', 'Zara', 'Mateo', 'Isla', 'Felix', 'Aisha', 'Hugo', 'Nora', 'Theo',
  'Luna', 'Adrian', 'Maya', 'Jonas', 'Freya', 'Caleb', 'Ivy', 'Silas', 'Aria', 'Leo',
  'Vera', 'Nathan', 'Sienna', 'Owen', 'Keira', 'Malik', 'Ruby', 'Jasper', 'Anika', 'Cole',
  'Bianca', 'Dev', 'Camila', 'Rafael', 'Grace', 'Kenji', 'Paige', 'Andre', 'Leila', 'Seth',
  'Noelle', 'Isaac', 'Dahlia', 'Miles', 'Talia', 'Roman', 'Esme', 'Kai', 'Willa', 'Jonah',
  'Amelia', 'Henry', 'Clara', 'Oscar', 'Violet', 'Ezra', 'Stella', 'Luca', 'Hazel', 'Asher',
  'Iris', 'Elliot', 'June', 'Rhys', 'Olive', 'Bennett', 'Sloane', 'Callum', 'Lyra', 'Finn',
];

const LAST = [
  'Miles', 'Chen', 'Patel', 'Brooks', 'Nguyen', 'Santos', 'Okoye', 'Kim', 'Ali', 'Rossi',
  'Walsh', 'Garcia', 'Singh', 'Andersen', 'Costa', 'Park', 'Hernandez', 'Murphy', 'Ibrahim', 'Lee',
  'Torres', 'Brown', 'Novak', 'Clarke', 'Yamamoto', 'Foster', 'Diaz', 'Khan', 'Berg', 'Wright',
];

const BIOS = [
  'Showing up daily. Progress over perfection.',
  'Building strength and calm, one session at a time.',
  'Meal prep Sundays · early mornings · long walks.',
  'Artist by night, runner by morning.',
  'Learning piano again after 10 years away.',
  'Meditation + mobility. Soft discipline.',
  'Coach-in-training. Always refining form.',
  'Plant-forward cooking. Fuel that tastes good.',
  'Photography walks and quiet focus blocks.',
  'Cardio streak: consistency is the flex.',
  'Drawing every day — sketchbooks over scrolls.',
  'Flexibility goals. Breathe, then stretch.',
  'Mindset work before the heavy lifts.',
  'Community over competition.',
  'Tracking small wins so they stack.',
  'Violin practice logs live here.',
  'Hydrated, walked, grateful. Repeat.',
  'Building muscle and better habits.',
  'Focus sprints + deep rest.',
  'Sharing the messy middle of growth.',
];

const STATUSES = [
  'Just finished a 5K — legs are toast 🔥',
  'Meal prep done for the week. Future me says thanks.',
  '20 minutes of meditation before the chaos.',
  'PR on deadlifts today. Slow and clean.',
  'Sketch dump from tonight\'s life drawing class.',
  'New piano piece unlocked. Hands still shaking.',
  'Rest day, but still moved for 30 minutes.',
  'Morning run through the park. Golden light.',
  'Tried a new high-protein bowl recipe.',
  'Mobility flow after a long desk day.',
  'Accountability check-in: showed up anyway.',
  'Studio session — lost track of time (in a good way).',
  'Cold plunge + journaling. Nervous system reset.',
  'Teaching my first form clinic this weekend.',
  'Photo walk downtown. Found new angles.',
  'Yoga for hips. Everything hurts less already.',
  'Cut caffeine for a week. Sleep is wild.',
  'Back squat focus week starts tomorrow.',
  'Violin etudes before breakfast. Ritual locked.',
  'Grateful for this community\'s honesty.',
];

const STORY_CAPTIONS = [
  'Today\'s vibe',
  'In the zone',
  'Quick check-in',
  'Practice log',
  'Fuel',
  'Sunrise session',
  'Studio light',
  'On the mat',
  'Out for a walk',
  'Progress note',
];

/** High-quality Unsplash lifestyle / fitness / food / art images */
const POST_IMAGES = [
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=1080&q=80',
  'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=1080&q=80',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1080&q=80',
  'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1080&q=80',
  'https://images.unsplash.com/photo-1517832207067-4db24a2ae47c?w=1080&q=80',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1080&q=80',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1080&q=80',
  'https://images.unsplash.com/photo-1552674601-ca4d8a9ae4c7?w=1080&q=80',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1080&h=1350&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1080&q=80',
  'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1080&q=80',
  'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=1080&q=80',
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1080&q=80',
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1080&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1080&q=80',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&q=80',
  'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1080&q=80',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=1080&q=80',
  'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=1080&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=1080&q=80',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=1080&q=80',
  'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1080&q=80',
  'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1080&q=80',
  'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1080&q=80',
  'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1080&q=80',
  'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1080&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1080&q=80',
  'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1080&q=80',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1080&q=80',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1080&q=80',
  'https://images.unsplash.com/photo-1599058945522-28d584b6f14f?w=1080&q=80',
  'https://images.unsplash.com/photo-1517963879433-6ad2b056d944?w=1080&q=80',
  'https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=1080&q=80',
  'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=1080&h=1350&fit=crop&q=80',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=1080&h=1350&fit=crop&q=80',
];

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function parentCat(pathKey) {
  return pathKey.includes(':') ? pathKey.split(':')[0] : pathKey;
}

function subCat(pathKey) {
  return pathKey.includes(':') ? pathKey.split(':')[1] : null;
}

function uid(i) {
  return `dense-u-${String(i).padStart(3, '0')}`;
}

function avatarUrl(i) {
  // Realistic portrait photos (randomuser.me)
  const gender = i % 2 === 0 ? 'women' : 'men';
  const n = ((i - 1) % 99) + 1;
  return `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;
}

function usernameFor(i) {
  const first = FIRST[(i - 1) % FIRST.length];
  const last = LAST[(i * 3 + 7) % LAST.length];
  if (i <= FIRST.length) return `${first} ${last}`;
  return `${first} ${last} ${i}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function emitInsert(tableHeaderLines, rows, batchSize) {
  for (const batch of chunk(rows, batchSize)) {
    lines.push(...tableHeaderLines);
    lines.push(batch.join(',\n') + ';');
    lines.push('');
  }
}

const lines = [];
lines.push('-- Dense social seed: crowd users, posts, stories, friends, engagement');
lines.push('-- Password for all dense accounts: GrowlDemo123!');
lines.push('-- Avatars: randomuser.me portraits | Posts: Unsplash');
lines.push('-- Generated by scripts/generate-dense-social-seed.js');
lines.push('-- Batched INSERTs to stay under SQLite statement size limits');
lines.push('');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('');

// Users
const userHeader = [
  'INSERT OR REPLACE INTO users (',
  '  id, email, password_hash, points, is_instructor, is_business, metadata,',
  '  email_verified, email_verification_token_hash, email_verification_expires_at,',
  '  created_at, updated_at',
  ') VALUES',
];
const userRows = [];
for (let i = 1; i <= USER_COUNT; i++) {
  const id = uid(i);
  const email = `demo-${String(i).padStart(3, '0')}@growl.seed`;
  const displayName = usernameFor(i);
  const pathKey = CATEGORY_PATHS[(i - 1) % CATEGORY_PATHS.length];
  const second = CATEGORY_PATHS[(i + 4) % CATEGORY_PATHS.length];
  const cats = i % 3 === 0 ? [pathKey, second] : [pathKey];
  const isInstructor = i <= 18 ? 1 : 0;
  const points = 60 + i * 5 + (isInstructor ? 220 : 0);
  const bio = BIOS[(i - 1) % BIOS.length];
  const status = STATUSES[(i * 3) % STATUSES.length];
  const meta = JSON.stringify({
    username: displayName,
    avatar: avatarUrl(i),
    bio,
    status,
    categories: cats,
  });
  userRows.push(
    `  ('${id}', '${email}', '${PASS_HASH}', ${points}, ${isInstructor}, 0, '${esc(meta)}', 1, NULL, NULL, datetime('now', '-${(i % 90) + 1} days'), datetime('now'))`
  );
}
emitInsert(userHeader, userRows, 20);

// Posts
const postHeader = [
  'INSERT OR IGNORE INTO posts (id, user_id, image_url, caption, category, subcategory, engagement_score, metadata, created_at, updated_at) VALUES',
];
const postRows = [];
for (let i = 1; i <= POST_COUNT; i++) {
  const userIdx = ((i - 1) % USER_COUNT) + 1;
  const userId = uid(userIdx);
  const pathKey = CATEGORY_PATHS[(i - 1) % CATEGORY_PATHS.length];
  const hoursAgo = (i % 168) + 1;
  const caption = STATUSES[i % STATUSES.length];
  const image = POST_IMAGES[i % POST_IMAGES.length];
  const username = usernameFor(userIdx);
  const avatar = avatarUrl(userIdx);
  const likes = 2 + (i % 40);
  const comments = i % 7;
  const meta = JSON.stringify({
    username,
    avatar,
    likes,
    comments,
    isInstructor: userIdx <= 18,
  });
  const sub = subCat(pathKey);
  postRows.push(
    `  ('dense-post-${String(i).padStart(3, '0')}', '${userId}', '${image}', '${esc(caption)}', '${parentCat(pathKey)}', ${sub ? `'${sub}'` : 'NULL'}, ${10 + (i % 80)}, '${esc(meta)}', datetime('now', '-${hoursAgo} hours'), datetime('now', '-${hoursAgo} hours'))`
  );
}
emitInsert(postHeader, postRows, 25);

// Stories
const storyHeader = [
  'INSERT OR IGNORE INTO stories (id, user_id, image_url, caption, views, expires_at, created_at, updated_at) VALUES',
];
const storyRows = [];
for (let i = 1; i <= STORY_COUNT; i++) {
  const userIdx = ((i - 1) % USER_COUNT) + 1;
  const userId = uid(userIdx);
  const image = POST_IMAGES[(i * 5) % POST_IMAGES.length];
  const caption = STORY_CAPTIONS[i % STORY_CAPTIONS.length];
  storyRows.push(
    `  ('dense-story-${String(i).padStart(3, '0')}', '${userId}', '${image}', '${esc(caption)}', ${i % 50}, datetime('now', '+22 hours'), datetime('now', '-${i % 18} hours'), datetime('now', '-${i % 18} hours'))`
  );
}
emitInsert(storyHeader, storyRows, 25);

// Likes + comments
const engHeader = [
  'INSERT OR IGNORE INTO post_engagement (id, post_id, user_id, type, content, created_at) VALUES',
];
const engRows = [];
let eng = 0;
for (let p = 1; p <= Math.min(POST_COUNT, 500); p++) {
  for (let u = 1; u <= 6; u++) {
    eng++;
    const voter = ((p + u * 11) % USER_COUNT) + 1;
    engRows.push(
      `  ('dense-like-${eng}', 'dense-post-${String(p).padStart(3, '0')}', '${uid(voter)}', 'like', NULL, datetime('now', '-${p % 48} hours'))`
    );
  }
}
const COMMENT_SNIPPETS = [
  'Love this energy!',
  'Keep going — inspiring.',
  'Same journey here.',
  'Form looks solid.',
  'Need this recipe!',
  'Consistency wins.',
  'Beautiful shot.',
  'Thanks for sharing.',
];
for (let c = 1; c <= 240; c++) {
  eng++;
  const author = ((c * 7) % USER_COUNT) + 1;
  engRows.push(
    `  ('dense-cmt-${c}', 'dense-post-${String(c).padStart(3, '0')}', '${uid(author)}', 'comment', '${esc(COMMENT_SNIPPETS[c % COMMENT_SNIPPETS.length])}', datetime('now', '-${c % 36} hours'))`
  );
}
emitInsert(engHeader, engRows, 40);

// Friendships
const relHeader = [
  'INSERT OR IGNORE INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES',
];
const relRows = [];
let rel = 0;
for (let i = 1; i <= USER_COUNT; i++) {
  const a = uid(i);
  for (const offset of [1, 2, 5, 11, 17]) {
    const bIdx = ((i - 1 + offset) % USER_COUNT) + 1;
    if (bIdx === i) continue;
    const b = uid(bIdx);
    rel++;
    relRows.push(`  ('dense-rel-${rel}-a', '${a}', '${b}', 'friend', datetime('now'))`);
    rel++;
    relRows.push(`  ('dense-rel-${rel}-b', '${b}', '${a}', 'friend', datetime('now'))`);
  }
}
for (let i = 1; i <= 80; i++) {
  const b = uid(i);
  rel++;
  relRows.push(`  ('dense-rel-core-${i}-a', 'demo-core-user', '${b}', 'friend', datetime('now'))`);
  rel++;
  relRows.push(`  ('dense-rel-core-${i}-b', '${b}', 'demo-core-user', 'friend', datetime('now'))`);
}
emitInsert(relHeader, relRows, 40);

// Instructor endorsements
const voteHeader = [
  'INSERT OR IGNORE INTO instructor_votes (id, user_id, candidate_id, created_at) VALUES',
];
const voteRows = [];
for (let i = 1; i <= 18; i++) {
  for (let v = 19; v <= 36; v++) {
    voteRows.push(
      `  ('dense-vote-${i}-${v}', '${uid(v)}', '${uid(i)}', datetime('now', '-${v} hours'))`
    );
  }
}
emitInsert(voteHeader, voteRows, 40);

const out = path.join(__dirname, 'seed-demo-social-dense.sql');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log('Wrote', out);
console.log(`Users: ${USER_COUNT}, Posts: ${POST_COUNT}, Stories: ${STORY_COUNT}`);
console.log('Password: GrowlDemo123!');
