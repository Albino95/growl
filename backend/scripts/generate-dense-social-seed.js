#!/usr/bin/env node
/**
 * Generates backend/scripts/seed-demo-social-dense.sql
 *
 * Every user, post, and story is tied to a content pack so:
 *   category + subcategory ↔ image ↔ caption/bio/status
 *
 * Password for all dense accounts: GrowlDemo123!
 *
 * Run:
 *   node scripts/generate-dense-social-seed.js
 *   npm run seed:social:dense:qa
 */
const fs = require('fs');
const path = require('path');

const USER_COUNT = 120;
const POST_COUNT = 360;
const STORY_COUNT = 120;
const PASS_HASH = 'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a'; // GrowlDemo123!

const U = (id) => `https://images.unsplash.com/${id}?w=1080&h=1350&fit=crop&q=80`;

/**
 * Curated packs: image + captions + bios all describe the same activity.
 * Keys must match frontend category:subcategory paths where possible.
 */
const CONTENT_PACKS = {
  'fitness:losing-weight': {
    images: [
      U('photo-1534438327276-14e5300c3a48'),
      U('photo-1574680096145-d05b474e2155'),
      U('photo-1518611012118-696072aa579a'),
      U('photo-1476480862126-209bfaa8edc8'),
    ],
    captions: [
      'Morning walk + light weights. Consistency over intensity this week.',
      'Logged macros for the first time in months — already clearer decisions.',
      'Rest-day mobility instead of skipping entirely. Showing up counts.',
      'Plateau check-in: swapped one snack, kept the training streak.',
    ],
    stories: ['Walk done', 'Scale day', 'Mobility', 'Fuel check'],
    bios: [
      'Rebuilding habits around movement and food — one honest week at a time.',
      'Losing weight without losing joy. Walks, weights, real meals.',
    ],
    statuses: ['Hit my step goal before noon.', 'Prep bowls ready for tomorrow.'],
  },
  'fitness:building-muscle': {
    images: [
      U('photo-1534438327276-14e5300c3a48'),
      U('photo-1583454110551-21f2fa2afe61'),
      U('photo-1574680096145-d05b474e2155'),
      U('photo-1599058917212-d750089bc07e'),
    ],
    captions: [
      'Pull day locked in — slow eccentrics on rows.',
      'Hit a clean PR on bench. Form first, then load.',
      'Protein shake + stretch. Recovery is training too.',
      'Accessory work for shoulders after the main lifts.',
    ],
    stories: ['Gym check-in', 'PR board', 'Pump', 'Cooldown'],
    bios: [
      'Building muscle with progressive overload and patience.',
      'Strength training log. Form checks welcome.',
    ],
    statuses: ['Pull session done.', 'Deload week — still showing up.'],
  },
  'fitness:cardio': {
    images: [
      U('photo-1476480862126-209bfaa8edc8'),
      U('photo-1476480862126-209bfaa8edc8'),
      U('photo-1571008887538-b36bb32f4571'),
      U('photo-1534438327276-14e5300c3a48'),
    ],
    captions: [
      'Easy 5K — stayed conversational the whole way.',
      'Sunrise intervals. Legs heavy, mood lighter.',
      'Bike commute doubled as today’s cardio block.',
      'Zone-2 run before meetings. Best focus hack I have.',
    ],
    stories: ['Miles logged', 'Sunrise run', 'Bike day', 'Cool-down'],
    bios: [
      'Cardio streak keeper. Roads, trails, and early alarms.',
      'Running for clarity as much as fitness.',
    ],
    statuses: ['Negative split on the 5K.', 'Rest day walk instead of zero.'],
  },
  'fitness:flexibility': {
    images: [
      U('photo-1544367567-0f2fcb009e0b'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1599901860904-17e6ed7083a0'),
      U('photo-1518611012118-696072aa579a'),
    ],
    captions: [
      'Hip openers after a desk marathon. Breath first.',
      '20-minute yoga flow — spine finally happy.',
      'Hamstring stretch series. Slow and boring on purpose.',
      'Mobility circuit before bed. Sleep hits different.',
    ],
    stories: ['On the mat', 'Stretch', 'Breath', 'Flow'],
    bios: [
      'Flexibility goals: breathe, then stretch.',
      'Yoga + mobility for desk athletes.',
    ],
    statuses: ['Hips unlocked (mostly).', 'Evening flow done.'],
  },
  'art:piano': {
    images: [
      U('photo-1520523839897-bd0b52f945a0'),
      U('photo-1511379938547-c1f69419868d'),
      U('photo-1517832207067-4db24a2ae47c'),
      U('photo-1510915361894-db8b60106cb1'),
    ],
    captions: [
      'Left-hand independence drills. Ugly but necessary.',
      'Learned the B section without stopping — tiny win.',
      'Recording a practice loop for tempo honesty.',
      'Sight-reading session. Mistakes welcome tonight.',
    ],
    stories: ['Keys warm', 'Metronome', 'Studio', 'Practice'],
    bios: [
      'Piano after a long break. Scales before songs.',
      'Sharing the messy middle of learning pieces.',
    ],
    statuses: ['Hands still shaking after that piece.', '30 focused minutes at the keys.'],
  },
  'art:violin': {
    images: [
      U('photo-1612225330812-01a9c6b355ec'),
      U('photo-1542601906990-b4d3fb778b09'),
      U('photo-1511192336575-5a79af67a629'),
      U('photo-1511379938547-c1f69419868d'),
    ],
    captions: [
      'Intonation drills before breakfast. Ritual locked.',
      'Bow hold reset — tone opened up immediately.',
      'Etude day. Boring on paper, compounding in practice.',
      'Slow practice on the hard passage. No shortcuts.',
    ],
    stories: ['Rosined', 'Etude', 'Tuning', 'Quiet practice'],
    bios: [
      'Violin practice logs live here.',
      'Strings, patience, and daily etudes.',
    ],
    statuses: ['Bow rosined. Ready.', 'Intonation check passed… mostly.'],
  },
  'art:drawing': {
    images: [
      U('photo-1513364776144-60967b0f800f'),
      U('photo-1513475382585-d06e58bcb0e0'),
      U('photo-1460661419201-fd4cecdf8a8b'),
      U('photo-1452860606245-08befc0ff44b'),
    ],
    captions: [
      'Gesture sketches to loosen the wrist.',
      'Life-drawing warmups — proportion over polish.',
      'Ink study of hands. Still learning.',
      'Sketch dump from tonight’s session.',
    ],
    stories: ['Sketchbook', 'Ink', 'Lines', 'Studio light'],
    bios: [
      'Drawing every day — sketchbooks over scrolls.',
      'Artist by night. Lines first, detail later.',
    ],
    statuses: ['Filled three pages today.', 'Gesture warmups done.'],
  },
  'art:photography': {
    images: [
      U('photo-1492691527719-9d1e07e534b4'),
      U('photo-1452587925148-ce544e77e70d'),
      U('photo-1506905925346-21bda4d32df4'),
      U('photo-1469854523086-cc02fe5d8800'),
    ],
    captions: [
      'Golden-hour walk. Chasing edges of light.',
      'Street frames downtown — new angles on old corners.',
      'Landscape study: patience beats more shots.',
      'Edited last night’s set. Less is more in the crop.',
    ],
    stories: ['Golden hour', 'Lens on', 'City frames', 'Light study'],
    bios: [
      'Photography walks and quiet focus blocks.',
      'Chasing light more than likes.',
    ],
    statuses: ['Memory card full in the best way.', 'Found a new corner downtown.'],
  },
  'nutrition:meal-planning': {
    images: [
      U('photo-1546069901-ba9599a7e63c'),
      U('photo-1490645935967-10de6ba17061'),
      U('photo-1512621776951-a57141f2eefd'),
      U('photo-1498837167922-ddd27525d352'),
    ],
    captions: [
      'Sunday prep: roasted veg + proteins for four days.',
      'Bowl template I rotate — greens, grain, protein, crunch.',
      'Labeled containers = fewer takeout nights.',
      'Grocery list built from the weekly plan, not the fridge stare.',
    ],
    stories: ['Prep day', 'Bowls', 'Labeled', 'Grocery run'],
    bios: [
      'Meal prep Sundays. Future me says thanks.',
      'Plant-forward cooking. Fuel that tastes good.',
    ],
    statuses: ['Prep done for the week.', 'Containers stacked and ready.'],
  },
  'nutrition:healthy-eating': {
    images: [
      U('photo-1512621776951-a57141f2eefd'),
      U('photo-1546069901-ba9599a7e63c'),
      U('photo-1490645935967-10de6ba17061'),
      U('photo-1482049016688-2d3e1b311543'),
    ],
    captions: [
      'Colorful plate rule: half vegetables today.',
      'High-protein breakfast that actually fills me up.',
      'Swapped the afternoon pastry for fruit + yogurt — still happy.',
      'Cooking at home three nights straight. Energy noticeables.',
    ],
    stories: ['Fresh plate', 'Breakfast', 'Home cook', 'Hydrated'],
    bios: [
      'Eating for energy, not perfection.',
      'Simple plates, solid protein, lots of color.',
    ],
    statuses: ['Cooked instead of ordered.', 'Water goal hit before lunch.'],
  },
  'mindset:positive-thinking': {
    images: [
      U('photo-1499209974431-9dddcece7f88'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
    ],
    captions: [
      'Wrote three things that went right before checking email.',
      'Reframed a rough morning — still hard, less hopeless.',
      'Gratitude list while coffee cooled. Two minutes, big shift.',
      'Told myself the kind story first. Action followed.',
    ],
    stories: ['Grateful', 'Reframe', 'Quiet win', 'Morning note'],
    bios: [
      'Training the inner voice as carefully as the body.',
      'Positive practice without toxic positivity.',
    ],
    statuses: ['Three wins logged.', 'Chose curiosity over spiral.'],
  },
  'mindset:stress-management': {
    images: [
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1544367567-0f2fcb009e0b'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
    ],
    captions: [
      'Ten mindful breaths between meetings.',
      'Phone in another room for a 25-minute reset.',
      'Evening wind-down: stretch + journal, no scroll.',
      'Named the stress out loud — then took a walk.',
    ],
    stories: ['Breathe', 'Reset', 'Unplugged', 'Calm'],
    bios: [
      'Stress tools that fit a busy calendar.',
      'Breath, walks, and honest check-ins.',
    ],
    statuses: ['Nervous system reset complete.', 'Walked the stress down.'],
  },
  'mindset:self-confidence': {
    images: [
      U('photo-1529156069898-49953e39b3ac'),
      U('photo-1517245386807-bb43f82c33c4'),
      U('photo-1522202176988-66273c2fd55f'),
      U('photo-1499209974431-9dddcece7f88'),
    ],
    captions: [
      'Said yes to something that used to scare me.',
      'Shared unfinished work on purpose. Exposure therapy.',
      'Stood taller in the meeting. Small posture, big signal.',
      'Kept a win log — evidence beats doubt.',
    ],
    stories: ['Showed up', 'Shared WIP', 'Win log', 'Brave yes'],
    bios: [
      'Building confidence through receipts, not pep talks.',
      'Action first, confidence second.',
    ],
    statuses: ['Did the scary thing.', 'Win log updated.'],
  },
  'discipline:habit-building': {
    images: [
      U('photo-1484480974693-6ca0a78fb36b'),
      U('photo-1506784983877-45594efa4cbe'),
      U('photo-1434030216411-0b793f4b4173'),
      U('photo-1454165804606-c3d57bc86b40'),
    ],
    captions: [
      'Habit stack: make bed → water → 10 pushups. Day 12.',
      'Missed yesterday, restarted today without drama.',
      'Tracked the chain in ink. Streaks motivate me.',
      'Shrunk the habit until it was impossible to skip.',
    ],
    stories: ['Streak', 'Restart', 'Tiny habit', 'Logged'],
    bios: [
      'Habit builder. Small daily reps.',
      'Discipline as kindness to future me.',
    ],
    statuses: ['Chain unbroken.', 'Restarted without shame.'],
  },
  'discipline:productivity': {
    images: [
      U('photo-1484480974693-6ca0a78fb36b'),
      U('photo-1434030216411-0b793f4b4173'),
      U('photo-1454165804606-c3d57bc86b40'),
      U('photo-1499750310107-5fef28a66643'),
    ],
    captions: [
      'Two deep-work blocks. Phone in another room.',
      'Cleared the inbox to zero — then closed the tab.',
      'One priority before noon. Everything else waited.',
      'Time-blocked the afternoon. Felt longer in a good way.',
    ],
    stories: ['Deep work', 'Inbox zero', 'One priority', 'Focus'],
    bios: [
      'Focus sprints + deep rest.',
      'Protecting attention like a scarce resource.',
    ],
    statuses: ['Deep-work block complete.', 'One priority shipped.'],
  },
  'discipline:time-management': {
    images: [
      U('photo-1501139083538-0139583c060f'),
      U('photo-1484480974693-6ca0a78fb36b'),
      U('photo-1454165804606-c3d57bc86b40'),
      U('photo-1506784983877-45594efa4cbe'),
    ],
    captions: [
      'Calendar blocked in 90-minute chunks. Fewer context switches.',
      'Analog timer for one task. No second screens.',
      'Moved “someday” tasks out of today. Instant calm.',
      'Buffer between meetings — finally protected it.',
    ],
    stories: ['Blocked time', 'Timer on', 'Buffer', 'Calendar clean'],
    bios: [
      'Time management without hustle theater.',
      'Protecting hours so the work can actually happen.',
    ],
    statuses: ['Day planned before coffee.', 'Buffer held.'],
  },
  'discipline:goal-setting': {
    images: [
      U('photo-1434030216411-0b793f4b4173'),
      U('photo-1484480974693-6ca0a78fb36b'),
      U('photo-1454165804606-c3d57bc86b40'),
      U('photo-1499750310107-5fef28a66643'),
    ],
    captions: [
      'Quarterly goals rewritten as weekly actions.',
      'One measurable outcome for this month. Everything else is noise.',
      'Reviewed last week’s goals — kept two, dropped one guilt-free.',
      'Vision board updated with actual next steps.',
    ],
    stories: ['Q goals', 'Weekly plan', 'Review', 'Next step'],
    bios: [
      'Goals that survive Monday morning.',
      'Writing intentions into calendars.',
    ],
    statuses: ['Weekly goals locked.', 'Review complete.'],
  },
  'fitness:strength': {
    images: [
      U('photo-1583454110551-21f2fa2afe61'),
      U('photo-1534438327276-14e5300c3a48'),
      U('photo-1534438327276-14e5300c3a48'),
      U('photo-1574680096145-d05b474e2155'),
    ],
    captions: [
      'Strength block: heavy compounds, long rests.',
      'Deadlift day. Bar speed stayed honest.',
      'Core finisher after the main lifts.',
      'Logged every set. Strength loves receipts.',
    ],
    stories: ['Heavy day', 'Bar loaded', 'Core done', 'Logged'],
    bios: [
      'Strength training, progressive and patient.',
      'Barbell work and recovery rituals.',
    ],
    statuses: ['Compounds done.', 'Strength block week 3.'],
  },
  'art:guitar': {
    images: [
      U('photo-1510915361894-db8b60106cb1'),
      U('photo-1511379938547-c1f69419868d'),
      U('photo-1511379938547-c1f69419868d'),
      U('photo-1493225457124-a3eb161ffa5f'),
    ],
    captions: [
      'Chord transitions slowed to half tempo. Cleaner already.',
      'Fingerpicking pattern finally looping without looking.',
      'Amp warm, metronome on. Practice over performance.',
      'Learned the bridge — still rough, still proud.',
    ],
    stories: ['Strings on', 'Amp warm', 'Practice', 'New riff'],
    bios: [
      'Guitar after work. Calluses returning.',
      'Learning songs the slow way.',
    ],
    statuses: ['Practice loop done.', 'Calluses earning their keep.'],
  },
  'art:painting': {
    images: [
      U('photo-1460661419201-fd4cecdf8a8b'),
      U('photo-1513364776144-60967b0f800f'),
      U('photo-1579783902614-a3fb3927b6a5'),
      U('photo-1541961017774-22349e4a1262'),
    ],
    captions: [
      'Underpainting done. Color tomorrow.',
      'Palette knife study — more texture, less fuss.',
      'Still-life session with bad lighting and good focus.',
      'Layer dried overnight. Glazing next.',
    ],
    stories: ['Wet paint', 'Palette', 'Studio', 'Drying'],
    bios: [
      'Painting in stolen evenings.',
      'Color studies and unfinished canvases welcome.',
    ],
    statuses: ['Palette cleaned.', 'One layer dried.'],
  },
  'nutrition:cooking': {
    images: [
      U('photo-1556910103-1c02745aae4d'),
      U('photo-1482049016688-2d3e1b311543'),
      U('photo-1504674900247-0877df9cc836'),
      U('photo-1555939594-58d7cb561ad1'),
    ],
    captions: [
      'Knife skills night — onions without tears (almost).',
      'Tried a new sauce from scratch. Worth the mess.',
      'Cast-iron dinner for two. Simple and loud flavor.',
      'Cooked the whole meal without opening an app.',
    ],
    stories: ['Knife work', 'Sauce day', 'Cast iron', 'Home cook'],
    bios: [
      'Learning to cook like I mean it.',
      'Kitchen experiments, edible results.',
    ],
    statuses: ['Dinner from scratch.', 'Knife board cleared.'],
  },
  'nutrition:weight-management': {
    images: [
      U('photo-1490645935967-10de6ba17061'),
      U('photo-1546069901-ba9599a7e63c'),
      U('photo-1498837167922-ddd27525d352'),
      U('photo-1512621776951-a57141f2eefd'),
    ],
    captions: [
      'Logged meals for seven days. Patterns finally visible.',
      'Portion check with the scale — calibration, not obsession.',
      'Swapped one liquid calorie for water. Quiet win.',
      'Balanced plate: protein, fiber, and something I enjoy.',
    ],
    stories: ['Logged', 'Portions', 'Balance', 'Check-in'],
    bios: [
      'Weight management with data and kindness.',
      'Sustainable plates over crash plans.',
    ],
    statuses: ['Week logged.', 'Portions honest today.'],
  },
  'martial-arts:boxing': {
    images: [
      U('photo-1549719386-74dfcbf7dbed'),
      U('photo-1517438476312-10d79c077509'),
      U('photo-1599058917212-d750089bc07e'),
      U('photo-1574680096145-d05b474e2155'),
    ],
    captions: [
      'Pad work: jab-cross until the shoulders burn.',
      'Footwork drills before gloves. Foundations first.',
      'Sparring light — defense over ego.',
      'Bag work + three rounds. Hands taped, mind quiet.',
    ],
    stories: ['Gloves on', 'Pads', 'Footwork', 'Cooldown'],
    bios: [
      'Boxing for focus as much as fitness.',
      'Bags, pads, and patient footwork.',
    ],
    statuses: ['Rounds complete.', 'Hands taped.'],
  },
  'martial-arts:karate': {
    images: [
      U('photo-1555597673-b21d5c935865'),
      U('photo-1549719386-74dfcbf7dbed'),
      U('photo-1517438476312-10d79c077509'),
      U('photo-1534438327276-14e5300c3a48'),
    ],
    captions: [
      'Kata practice — same sequence, cleaner lines.',
      'Kihon drills until the stances felt rooted.',
      'Belt class: partner work with control.',
      'Slow kata for precision. Speed comes later.',
    ],
    stories: ['Dojo', 'Kata', 'Stance', 'Gi on'],
    bios: [
      'Karate fundamentals, practiced weekly.',
      'Discipline through kata and breath.',
    ],
    statuses: ['Kata polished.', 'Dojo night done.'],
  },
  'martial-arts:jiu-jitsu': {
    images: [
      U('photo-1555597673-b21d5c935865'),
      U('photo-1517438476312-10d79c077509'),
      U('photo-1549719386-74dfcbf7dbed'),
      U('photo-1574680096145-d05b474e2155'),
    ],
    captions: [
      'Guard retention drills. Got swept, learned anyway.',
      'Positional sparring from side control only.',
      'New escape — ugly but it worked twice.',
      'Gi night. Grips tired before the round ended.',
    ],
    stories: ['Mats', 'Gi night', 'Drills', 'Roll'],
    bios: [
      'Jiu-jitsu white belt energy: curious and sore.',
      'Learning to lose gracefully on the mats.',
    ],
    statuses: ['Rolled three rounds.', 'Escape clicked.'],
  },
  'martial-arts:taekwondo': {
    images: [
      U('photo-1555597673-b21d5c935865'),
      U('photo-1549719386-74dfcbf7dbed'),
      U('photo-1518611012118-696072aa579a'),
      U('photo-1517438476312-10d79c077509'),
    ],
    captions: [
      'Kicking combinations on the paddle. Snap over power.',
      'Poomsae run-throughs before sparring.',
      'Flexibility for higher kicks — hip openers first.',
      'Sparring light: timing over aggression.',
    ],
    stories: ['Kicks', 'Poomsae', 'Paddle', 'Stretch'],
    bios: [
      'Taekwondo for agility and focus.',
      'Kicks, forms, and patient flexibility.',
    ],
    statuses: ['Forms clean.', 'Kick drills done.'],
  },
  'language:spanish': {
    images: [
      U('photo-1546410531-bb4caa6b424d'),
      U('photo-1544716278-ca5e3f4abd8c'),
      U('photo-1434030216411-0b793f4b4173'),
      U('photo-1503676260728-1c00da094a0b'),
    ],
    captions: [
      '20 minutes of Spanish conversation practice. Mistakes allowed.',
      'Flashcards on the commute — verbs sticking finally.',
      'Wrote a short diary entry en español. Proud and imperfect.',
      'Podcast at 0.9x speed. Comprehension climbing.',
    ],
    stories: ['¡Hola!', 'Verbs', 'Podcast', 'Diary'],
    bios: [
      'Learning Spanish one conversation at a time.',
      'Flashcards, podcasts, and messy speaking practice.',
    ],
    statuses: ['Daily Spanish done.', 'New verbs locked.'],
  },
  'language:french': {
    images: [
      U('photo-1544716278-ca5e3f4abd8c'),
      U('photo-1546410531-bb4caa6b424d'),
      U('photo-1503676260728-1c00da094a0b'),
      U('photo-1434030216411-0b793f4b4173'),
    ],
    captions: [
      'French listening practice with subtitles off for five minutes.',
      'Conjugation table review — passé composé finally clicking.',
      'Ordered coffee in French (rehearsed). Still counts.',
      'Read a children’s page aloud. Pronunciation over pride.',
    ],
    stories: ['Écoute', 'Conjugate', 'Café', 'Reading'],
    bios: [
      'French for travel and curiosity.',
      'Slow listening, brave speaking.',
    ],
    statuses: ['Listening block done.', 'Conjugations reviewed.'],
  },
  'language:mandarin': {
    images: [
      U('photo-1503676260728-1c00da094a0b'),
      U('photo-1546410531-bb4caa6b424d'),
      U('photo-1544716278-ca5e3f4abd8c'),
      U('photo-1528164344705-47542687000d'),
    ],
    captions: [
      'Tone drills with a mirror. Embarrassing and effective.',
      'Wrote ten new characters with stroke order.',
      'HSK vocab sprint — 15 minutes, no phone.',
      'Shadowed a slow dialogue. Mouth tired, tones better.',
    ],
    stories: ['Tones', 'Characters', 'HSK', 'Shadow'],
    bios: [
      'Mandarin tones and characters — daily reps.',
      'Stroke order, then speaking.',
    ],
    statuses: ['Characters practiced.', 'Tone drill done.'],
  },
  'language:japanese': {
    images: [
      U('photo-1528164344705-47542687000d'),
      U('photo-1503676260728-1c00da094a0b'),
      U('photo-1544716278-ca5e3f4abd8c'),
      U('photo-1546410531-bb4caa6b424d'),
    ],
    captions: [
      'Hiragana review until recognition felt automatic.',
      'Anki deck cleared for the day. Small streak win.',
      'Listened to a slow Japanese podcast on the walk.',
      'Wrote a short self-intro. Grammar messy, progress real.',
    ],
    stories: ['Hiragana', 'Anki', 'Listening', 'Intro'],
    bios: [
      'Japanese from zero — kana first.',
      'Daily Anki and gentle immersion.',
    ],
    statuses: ['Anki clear.', 'Kana review done.'],
  },
  'coding:web-development': {
    images: [
      U('photo-1498050108023-c5249f4df085'),
      U('photo-1461749280684-dccba630e2f6'),
      U('photo-1517336714731-489689fd1ca8'),
      U('photo-1518770660439-4636190af475'),
    ],
    captions: [
      'Shipped a small UI polish PR. Details compound.',
      'Refactored a messy component — fewer props, clearer state.',
      'CSS grid finally did what I meant. Celebration walk.',
      'Local build green. Tomorrow: review comments.',
    ],
    stories: ['PR shipped', 'Refactor', 'Green build', 'Deep code'],
    bios: [
      'Web dev by day, side projects by night.',
      'Shipping small, learning loud.',
    ],
    statuses: ['Build green.', 'PR merged.'],
  },
  'coding:mobile-development': {
    images: [
      U('photo-1512941937669-90a1b58e7e9c'),
      U('photo-1518770660439-4636190af475'),
      U('photo-1498050108023-c5249f4df085'),
      U('photo-1551650975-87deedd944c3'),
    ],
    captions: [
      'Fixed a navigation edge case on Android. Feels better already.',
      'Profile screen polish — spacing that matches the design.',
      'Simulator run of the onboarding flow. One less friction point.',
      'Expo build queued. Fingers crossed for a clean one.',
    ],
    stories: ['Sim run', 'UI polish', 'Build', 'Nav fix'],
    bios: [
      'Mobile apps, React Native, and patience with simulators.',
      'Shipping screens that feel native.',
    ],
    statuses: ['Simulator happy.', 'Build queued.'],
  },
  'coding:data-science': {
    images: [
      U('photo-1551288049-bebda4e38f71'),
      U('photo-1460925895917-afdab827c52f'),
      U('photo-1504868584819-f8e8b4b6d7e3'),
      U('photo-1555949963-aa79dcee981c'),
    ],
    captions: [
      'Cleaned a messy CSV until the charts made sense.',
      'Notebook experiment: feature that actually moved the metric.',
      'Visualized last month’s habit data. Patterns, not vibes.',
      'SQL query rewritten — 10x faster, same answer.',
    ],
    stories: ['Charts', 'Notebook', 'SQL', 'Clean data'],
    bios: [
      'Data for decisions, not decoration.',
      'Notebooks, SQL, and honest metrics.',
    ],
    statuses: ['Query optimized.', 'Chart shipped.'],
  },
  'coding:algorithms': {
    images: [
      U('photo-1516321318423-f06f85e504b3'),
      U('photo-1461749280684-dccba630e2f6'),
      U('photo-1498050108023-c5249f4df085'),
      U('photo-1518770660439-4636190af475'),
    ],
    captions: [
      'Two LeetCode mediums. One brute force, one improved.',
      'Whiteboarded recursion until the base case clicked.',
      'Complexity check: O(n) after the rewrite. Satisfying.',
      'Practice set done before standup. Brain warm.',
    ],
    stories: ['LeetCode', 'Whiteboard', 'Big-O', 'Warmup'],
    bios: [
      'Algorithms practice for sharper thinking.',
      'Daily problem, weekly review.',
    ],
    statuses: ['Problem set done.', 'Big-O cleaned up.'],
  },
  'sustainability:sustainable-living': {
    images: [
      U('photo-1542601906990-b4d3fb778b09'),
      U('photo-1532996122724-e3c354a0b15b'),
      U('photo-1416879595882-3373a0480b5b'),
      U('photo-1542601906990-b4d3fb778b09'),
    ],
    captions: [
      'Reusable bags + bulk aisle run. Less plastic this week.',
      'Mended a shirt instead of replacing it.',
      'Planted herbs on the windowsill. Tiny garden, big mood.',
      'Walked errands that used to be a short drive.',
    ],
    stories: ['Bulk run', 'Mend', 'Herbs', 'Walked it'],
    bios: [
      'Sustainable living in small weekly upgrades.',
      'Less waste, more intention.',
    ],
    statuses: ['Plastic-light day.', 'Herbs watered.'],
  },
  'sustainability:zero-waste': {
    images: [
      U('photo-1532996122724-e3c354a0b15b'),
      U('photo-1542601906990-b4d3fb778b09'),
      U('photo-1542601906990-b4d3fb778b09'),
      U('photo-1416879595882-3373a0480b5b'),
    ],
    captions: [
      'Jar restock at the refill store. Labels still charmingly ugly.',
      'Compost bin finally part of the kitchen rhythm.',
      'Packaged snacks swapped for whole fruit this week.',
      'Zero-waste kit in the bag: utensils, cup, napkin.',
    ],
    stories: ['Refill', 'Compost', 'Kit packed', 'Jars'],
    bios: [
      'Zero-waste experiments that stick.',
      'Refills, jars, and fewer wrappers.',
    ],
    statuses: ['Refill done.', 'Compost emptied.'],
  },
  'wellness:sleep': {
    images: [
      U('photo-1541783245831-57d6fb0926d3'),
      U('photo-1522771739844-6a9f6d5f14af'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
    ],
    captions: [
      'Phone downstairs. Book upstairs. Sleep improved already.',
      'Consistent bedtime for five nights. Mood noticed.',
      'Cooler room + dark curtains. Science, not vibes.',
      'Wind-down stretch before lights out.',
    ],
    stories: ['Phone away', 'Bedtime', 'Dark room', 'Wind-down'],
    bios: [
      'Protecting sleep like a training block.',
      'Evening rituals over late scrolls.',
    ],
    statuses: ['In bed on time.', 'Phone left downstairs.'],
  },
  'wellness:self-care': {
    images: [
      U('photo-1515377905703-c4788e51af15'),
      U('photo-1544367567-0f2fcb009e0b'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
    ],
    captions: [
      'Slow morning: tea, stretch, no rush calendar.',
      'Scheduled a nothing block. Defended it.',
      'Skin care + quiet music. Small reset.',
      'Said no to one extra thing. Energy conserved.',
    ],
    stories: ['Slow AM', 'Nothing block', 'Reset', 'Protected'],
    bios: [
      'Self-care that fits real weeks.',
      'Rest is part of the plan.',
    ],
    statuses: ['Nothing block kept.', 'Reset complete.'],
  },
  'wellness:mental-health': {
    images: [
      U('photo-1499209974431-9dddcece7f88'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
      U('photo-1506126613408-eca07ce68773'),
    ],
    captions: [
      'Therapy homework done. Uncomfortable and useful.',
      'Named the feeling before reacting. Progress.',
      'Walked without headphones — let the mind settle.',
      'Checked in with a friend. Mutual honesty helped.',
    ],
    stories: ['Check-in', 'Walk', 'Named it', 'Honest'],
    bios: [
      'Mental health tools in public, stigma optional.',
      'Small practices, big honesty.',
    ],
    statuses: ['Check-in done.', 'Walk cleared my head.'],
  },
  'finance:budgeting': {
    images: [
      U('photo-1554224155-6726b3ff858f'),
      U('photo-1579621970563-ebec7560ff3e'),
      U('photo-1450101499163-c8848c66ca85'),
      U('photo-1460925895917-afdab827c52f'),
    ],
    captions: [
      'Weekly budget review — categories still honest.',
      'Moved dining-out money into groceries. Felt adult.',
      'Tracked every spend for seven days. Eye-opening.',
      'Envelope method digital edition. Caps held.',
    ],
    stories: ['Budget', 'Tracked', 'Caps held', 'Review'],
    bios: [
      'Budgeting without shame spirals.',
      'Numbers first, then choices.',
    ],
    statuses: ['Budget reviewed.', 'Caps held this week.'],
  },
  'finance:saving': {
    images: [
      U('photo-1579621970563-ebec7560ff3e'),
      U('photo-1554224155-6726b3ff858f'),
      U('photo-1450101499163-c8848c66ca85'),
      U('photo-1434626881859-194d67b2b86f'),
    ],
    captions: [
      'Auto-transfer hit. Savings grew without willpower.',
      'Skipped one impulse buy. Logged the win.',
      'Emergency fund milestone — quiet celebration.',
      'Round-ups added up more than I expected.',
    ],
    stories: ['Auto-save', 'Milestone', 'Skipped buy', 'Round-ups'],
    bios: [
      'Saving on autopilot wherever possible.',
      'Milestones over perfection.',
    ],
    statuses: ['Auto-transfer landed.', 'Milestone hit.'],
  },
};

const PACK_KEYS = Object.keys(CONTENT_PACKS);

const FIRST = [
  'Jordan', 'River', 'Casey', 'Morgan', 'Sam', 'Avery', 'Nina', 'Leo', 'Mia', 'Kai',
  'Quinn', 'Reese', 'Blake', 'Drew', 'Skyler', 'Parker', 'Jamie', 'Cameron', 'Hayden', 'Rowan',
  'Finley', 'Sage', 'Emerson', 'Phoenix', 'Dakota', 'Taylor', 'Alex', 'Charlie', 'Riley', 'Jesse',
  'Amara', 'Noah', 'Sofia', 'Liam', 'Elena', 'Marcus', 'Priya', 'Diego', 'Yuki', 'Omar',
  'Chloe', 'Ethan', 'Zara', 'Mateo', 'Isla', 'Felix', 'Aisha', 'Hugo', 'Nora', 'Theo',
];

const LAST = [
  'Miles', 'Chen', 'Patel', 'Brooks', 'Nguyen', 'Santos', 'Okoye', 'Kim', 'Ali', 'Rossi',
  'Walsh', 'Garcia', 'Singh', 'Andersen', 'Costa', 'Park', 'Hernandez', 'Murphy', 'Ibrahim', 'Lee',
  'Torres', 'Brown', 'Novak', 'Clarke', 'Foster', 'Diaz', 'Khan', 'Berg', 'Wright', 'Shaw',
];

const COMMENT_BY_PARENT = {
  fitness: ['Form looks solid.', 'Keep stacking sessions!', 'Recovery day tomorrow?', 'Strong work.'],
  art: ['Beautiful progress.', 'Love this practice log.', 'Keep going — inspiring.', 'Gorgeous light.'],
  nutrition: ['Need this recipe!', 'Meal prep goals.', 'Plate looks perfect.', 'Saving this idea.'],
  mindset: ['Needed this reminder.', 'Same journey here.', 'Thanks for sharing.', 'Breathing with you.'],
  discipline: ['Consistency wins.', 'Love the system.', 'Accountability unlocked.', 'Keep the streak.'],
  'martial-arts': ['Sharp technique.', 'Keep drilling!', 'Respect on the mats.', 'Form looks cleaner.'],
  language: ['Keep practicing!', 'Impressive consistency.', 'Language goals!', 'Love this streak.'],
  coding: ['Nice ship.', 'Clean approach.', 'Ship it.', 'Debug win.'],
  sustainability: ['Needed this.', 'Doing the work.', 'Inspiring habits.', 'Planet points.'],
  wellness: ['Protect that rest.', 'Grateful you shared.', 'Same here.', 'Care looks good on you.'],
  finance: ['Money clarity!', 'Smart move.', 'Goals stacking.', 'Budget goals.'],
};

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

function packForIndex(i) {
  return CONTENT_PACKS[PACK_KEYS[(i - 1) % PACK_KEYS.length]];
}

function pathForIndex(i) {
  return PACK_KEYS[(i - 1) % PACK_KEYS.length];
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const lines = [];
function emitInsert(tableHeaderLines, rows, batchSize) {
  for (const batch of chunk(rows, batchSize)) {
    lines.push(...tableHeaderLines);
    lines.push(batch.join(',\n') + ';');
    lines.push('');
  }
}

lines.push('-- Dense social seed (category-matched images, captions, stories, bios)');
lines.push('-- Password for all dense accounts: GrowlDemo123!');
lines.push('-- Generated by scripts/generate-dense-social-seed.js');
lines.push('-- Batched INSERTs to stay under SQLite statement size limits');
lines.push('');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('');

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
  const pathKey = pathForIndex(i);
  const pack = packForIndex(i);
  const second = pathForIndex(i + 5);
  const cats = i % 4 === 0 ? [pathKey, second] : [pathKey];
  const isInstructor = i <= 16 ? 1 : 0;
  const points = 80 + i * 6 + (isInstructor ? 200 : 0);
  const bio = pick(pack.bios, i);
  const status = pick(pack.statuses, i * 3);
  const meta = JSON.stringify({
    username: displayName,
    avatar: avatarUrl(i),
    bio,
    status,
    categories: cats,
  });
  userRows.push(
    `  ('${id}', '${email}', '${PASS_HASH}', ${points}, ${isInstructor}, 0, '${esc(meta)}', 1, NULL, NULL, datetime('now', '-${(i % 60) + 1} days'), datetime('now'))`
  );
}
emitInsert(userHeader, userRows, 20);

const postHeader = [
  'INSERT OR REPLACE INTO posts (id, user_id, image_url, caption, category, subcategory, engagement_score, metadata, created_at, updated_at) VALUES',
];
const postRows = [];
for (let i = 1; i <= POST_COUNT; i++) {
  const userIdx = ((i - 1) % USER_COUNT) + 1;
  const userId = uid(userIdx);
  // Prefer the author's primary path so feed/profile stay coherent
  const pathKey = pathForIndex(userIdx);
  const pack = CONTENT_PACKS[pathKey];
  const hoursAgo = (i % 96) + 1;
  const caption = pick(pack.captions, i);
  const image = pick(pack.images, i);
  const username = usernameFor(userIdx);
  const avatar = avatarUrl(userIdx);
  const likes = 3 + (i % 36);
  const comments = i % 5;
  const isReel = i % 9 === 0;
  const meta = JSON.stringify({
    username,
    avatar,
    likes,
    comments,
    isInstructor: userIdx <= 16,
    ...(isReel ? { format: 'reel' } : {}),
  });
  const sub = subCat(pathKey);
  postRows.push(
    `  ('dense-post-${String(i).padStart(3, '0')}', '${userId}', '${image}', '${esc(caption)}', '${parentCat(pathKey)}', ${sub ? `'${sub}'` : 'NULL'}, ${12 + (i % 70)}, '${esc(meta)}', datetime('now', '-${hoursAgo} hours'), datetime('now', '-${hoursAgo} hours'))`
  );
}
emitInsert(postHeader, postRows, 25);

const storyHeader = [
  'INSERT OR REPLACE INTO stories (id, user_id, image_url, caption, views, expires_at, created_at, updated_at) VALUES',
];
const storyRows = [];
for (let i = 1; i <= STORY_COUNT; i++) {
  const userIdx = ((i - 1) % USER_COUNT) + 1;
  const userId = uid(userIdx);
  const pathKey = pathForIndex(userIdx);
  const pack = CONTENT_PACKS[pathKey];
  const image = pick(pack.images, i * 3);
  const caption = pick(pack.stories, i);
  storyRows.push(
    `  ('dense-story-${String(i).padStart(3, '0')}', '${userId}', '${image}', '${esc(caption)}', ${i % 40}, datetime('now', '+22 hours'), datetime('now', '-${i % 16} hours'), datetime('now', '-${i % 16} hours'))`
  );
}
emitInsert(storyHeader, storyRows, 25);

const engHeader = [
  'INSERT OR IGNORE INTO post_engagement (id, post_id, user_id, type, content, created_at) VALUES',
];
const engRows = [];
let eng = 0;
for (let p = 1; p <= Math.min(POST_COUNT, 300); p++) {
  for (let u = 1; u <= 5; u++) {
    eng++;
    const voter = ((p + u * 11) % USER_COUNT) + 1;
    engRows.push(
      `  ('dense-like-${eng}', 'dense-post-${String(p).padStart(3, '0')}', '${uid(voter)}', 'like', NULL, datetime('now', '-${p % 48} hours'))`
    );
  }
}
for (let c = 1; c <= 180; c++) {
  eng++;
  const author = ((c * 7) % USER_COUNT) + 1;
  const postOwner = ((c - 1) % USER_COUNT) + 1;
  const parent = parentCat(pathForIndex(postOwner));
  const snippets = COMMENT_BY_PARENT[parent] || COMMENT_BY_PARENT.mindset;
  engRows.push(
    `  ('dense-cmt-${c}', 'dense-post-${String(c).padStart(3, '0')}', '${uid(author)}', 'comment', '${esc(pick(snippets, c))}', datetime('now', '-${c % 36} hours'))`
  );
}
emitInsert(engHeader, engRows, 40);

const relHeader = [
  'INSERT OR IGNORE INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES',
];
const relRows = [];
let rel = 0;
for (let i = 1; i <= USER_COUNT; i++) {
  const a = uid(i);
  for (const offset of [1, 2, 5, 11]) {
    const bIdx = ((i - 1 + offset) % USER_COUNT) + 1;
    if (bIdx === i) continue;
    const b = uid(bIdx);
    rel++;
    relRows.push(`  ('dense-rel-${rel}-a', '${a}', '${b}', 'friend', datetime('now'))`);
    rel++;
    relRows.push(`  ('dense-rel-${rel}-b', '${b}', '${a}', 'friend', datetime('now'))`);
  }
}
for (let i = 1; i <= 60; i++) {
  const b = uid(i);
  rel++;
  relRows.push(`  ('dense-rel-core-${i}-a', 'demo-core-user', '${b}', 'friend', datetime('now'))`);
  rel++;
  relRows.push(`  ('dense-rel-core-${i}-b', '${b}', 'demo-core-user', 'friend', datetime('now'))`);
}
// Link review account when present (App Review QA)
for (let i = 1; i <= 40; i++) {
  const b = uid(i);
  rel++;
  relRows.push(`  ('dense-rel-review-${i}-a', 'user_app_review_qa', '${b}', 'friend', datetime('now'))`);
  rel++;
  relRows.push(`  ('dense-rel-review-${i}-b', '${b}', 'user_app_review_qa', 'friend', datetime('now'))`);
}
emitInsert(relHeader, relRows, 40);

const voteHeader = [
  'INSERT OR IGNORE INTO instructor_votes (id, user_id, candidate_id, created_at) VALUES',
];
const voteRows = [];
for (let i = 1; i <= 16; i++) {
  for (let v = 17; v <= 32; v++) {
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
console.log(`Packs: ${PACK_KEYS.length} category-matched content packs`);
console.log('Password: GrowlDemo123!');
