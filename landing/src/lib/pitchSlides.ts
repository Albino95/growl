/** Full Grow! investor pitch narrative — Grow! only, c-flow aligned. Written in full. */

export type PitchSlide =
  | {
      id: string;
      kind: 'cover' | 'close';
      kicker?: string;
      title: string;
      subtitle: string;
      meta?: string;
      body?: string[];
    }
  | {
      id: string;
      kind: 'prose';
      kicker: string;
      title: string;
      lead?: string;
      paragraphs: string[];
    }
  | {
      id: string;
      kind: 'split';
      kicker: string;
      title: string;
      lead?: string;
      left: { label: string; body: string; tone: 'brand' | 'energy' };
      right: { label: string; items: string[]; tone: 'brand' | 'energy' };
    }
  | {
      id: string;
      kind: 'pillars';
      kicker: string;
      title: string;
      lead?: string;
      pillars: { title: string; body: string }[];
    }
  | {
      id: string;
      kind: 'steps';
      kicker: string;
      title: string;
      lead?: string;
      steps: string[];
      note: string;
    }
  | {
      id: string;
      kind: 'cards';
      kicker: string;
      title: string;
      lead?: string;
      cards: { title: string; body: string; accent?: 'brand' | 'energy' }[];
    }
  | {
      id: string;
      kind: 'metrics';
      kicker: string;
      title: string;
      lead?: string;
      metrics: { value: string; label: string }[];
      note?: string;
    }
  | {
      id: string;
      kind: 'bullets';
      kicker: string;
      title: string;
      lead?: string;
      bullets: string[];
    }
  | {
      id: string;
      kind: 'dual';
      kicker: string;
      title: string;
      lead?: string;
      left: { label: string; items: string[] };
      right: { label: string; items: string[] };
    }
  | {
      id: string;
      kind: 'ask';
      kicker: string;
      title: string;
      lead?: string;
      amount: string;
      amountNote: string;
      uses: string[];
      contact: string;
      diligence?: string[];
    };

export const PITCH_SLIDES: PitchSlide[] = [
  {
    id: 'cover',
    kind: 'cover',
    kicker: 'Confidential · Investor overview · September 2026',
    title: 'Grow!',
    subtitle: 'Unlock skills. Share your growth.',
    meta: 'Goals, coaches & community — one mobile journey · Luxembourg / EU',
    body: [
      'Grow! is a personal-growth social platform that turns self-improvement intent into structured progress with human guidance — then makes that progress shareable with the people who keep you going.',
    ],
  },
  {
    id: 'thesis',
    kind: 'prose',
    kicker: 'Thesis',
    title: 'The category is not “another social app.”\nIt is becoming someone — with others.',
    lead: 'Millions of adults want to get fitter, learn a language, change a career habit, or master a craft. What they get today is a pile of disconnected tools: a content feed that does not care about their goal, a coach somewhere else, a journal in another app, and no community that shares the same finish line.',
    paragraphs: [
      'Grow! exists to close that gap. A user picks a growth path, sets a goal, finds peer-earned instructors, follows a plan, journals privately by default, and shares milestones when they are proud — inside one mobile product.',
      'Our equity story is deliberate: acquire through social surfaces that show real progress; retain through relationship — instructors, cohorts, and Growth Circles; defend over time with longitudinal progress data and better matching.',
      'We are not pitching a climate or carbon product. Greenworlder, where relevant, remains a legal or corporate entity only. The consumer brand is Grow! alone.',
    ],
  },
  {
    id: 'problem',
    kind: 'split',
    kicker: 'Problem',
    title: 'People want to grow.\nThe experience is fragmented.',
    lead: 'Ambition is personal. The tooling is not. Our target user — people about 18 to 35 years old, comfortable with apps, chasing a clear goal — lives between Instagram and Udemy and never gets one coherent journey.',
    left: {
      label: 'What they want',
      body: 'Unlock real skills they can be proud of. Stay accountable when motivation dips. Learn from humans they trust. Share progress with a circle that understands the goal — not a generic audience.',
      tone: 'brand',
    },
    right: {
      label: 'What they get instead',
      items: [
        'Too many apps for one goal — feed, coach, journal, shop, calendar, never one thread',
        'Passive content without structure — scrolling that feels busy but does not compound',
        'No trusted human nearby — courses without accountability, or coaches without community',
        'Public failure is scary — so they never post the journey that would actually keep them going',
      ],
      tone: 'energy',
    },
  },
  {
    id: 'insight',
    kind: 'prose',
    kicker: 'Insight',
    title: 'People stick when they train together toward the same finish line — not when they only scroll a feed.',
    paragraphs: [
      'A “personal growth feed” alone is not enough. People stay when they join a small group with a start date, an end date, and a coach or mentor who actually shows up.',
      'That is what Grow! is built around — four simple pieces:',
      '1) A timed group program (about 2–3 months) where everyone starts together and finishes together — for example “First 10K in 12 weeks.”',
      '2) A small accountability group (about 6 to 10 people) who check in on each other; you can also pair with one partner.',
      '3) A simple weekly rhythm: set your goal on Monday, get a tip or live session mid-week, write a short reflection on Sunday.',
      '4) A private journal by default — your notes stay yours until you choose to share a win with your group or publicly.',
      'When someone shares a milestone card, that moment can travel to Instagram or TikTok — free distribution when users are proud, not when they feel forced.',
    ],
  },
  {
    id: 'solution',
    kind: 'pillars',
    kicker: 'Solution',
    title: 'Turn intention into structured progress — with human guidance.',
    lead: 'Grow! is one connected loop. Not four separate products glued together for a pitch.',
    pillars: [
      {
        title: 'Goals & progress',
        body: 'Interest paths (fitness, language, mindset, and more). Goal setting, progress tracking, and private-by-default journaling. Milestones you can share when you choose — pride without guilt.',
      },
      {
        title: 'Coaches & cohorts',
        body: 'Instructors people endorse in a category — not bought ads. Paid sessions, homework, chat, and timed group programs of about 2–3 months with a clear finish.',
      },
      {
        title: 'Community that retains',
        body: 'Small groups of about 6–10, optional 1:1 partners, a simple weekly rhythm, and a private journal you only share when you want. Meetups in launch cities later.',
      },
    ],
  },
  {
    id: 'who',
    kind: 'prose',
    kicker: 'Who it is for',
    title: 'People about 18 to 35 years old who want to improve — and prove it',
    lead: 'We call them Active Improvers: young adults who already use social apps and already buy courses or coaching, but still lack one place for feed + coach + journal + friends around the same goal.',
    paragraphs: [
      'Age: about 18 to 35 years old (the core launch audience). They are used to phones and social apps. They care about skills, fitness, languages, confidence, and visible progress — not guilt-driven streaks or eco messaging.',
      'Why this age band: they have the strongest habit of posting and learning online, they pay for coaches and classes, and cities like Paris and Berlin concentrate this group.',
      'Launch examples: someone training for a first 10K; someone learning French or German for a move or exam. Later we open to any skill they want to unlock and share.',
    ],
  },
  {
    id: 'journey',
    kind: 'steps',
    kicker: 'Product journey',
    title: 'One connected growth journey',
    lead: 'From the first goal to the people who keep you honest — without forcing commerce into the hero path.',
    steps: ['Goal', 'Instructor', 'Plan', 'Progress', 'Community'],
    note: 'Commerce — Shop, business accounts, and advertising — is built and reachable in the product, but it is Phase 2 of the investor story. Launch proves instructor take-rate, cohorts, and retention first. Kitchen-sink platforms fail diligence; sequenced platforms raise.',
  },
  {
    id: 'product-surfaces',
    kind: 'cards',
    kicker: 'What ships',
    title: 'Consumer surfaces that match the story',
    lead: 'The product already includes social feed, reels, stories, journal, instructors, profile progress, and a curated Shop. The brand and pitch lead with skills, coaches, and community.',
    cards: [
      {
        title: 'Feed & Explore',
        body: 'Interest-shaped discovery. Progress posts and short video. No carbon calculator chrome — growth, not greenwashing.',
        accent: 'brand',
      },
      {
        title: 'Journal',
        body: 'Private by default. Reflect on a skill or goal. Streaks celebrate heat without guilt. Share when ready.',
        accent: 'energy',
      },
      {
        title: 'Instructors & Profile',
        body: 'Peer endorsements unlock instructor status. Points, awards, and skill milestones use coral energy — unlock language, not leaf-NGO language.',
      },
      {
        title: 'Shop (demoted in story)',
        body: 'Curated gear and programs aligned to paths. Available in-app; not the first-session hero or the primary revenue claim at raise.',
      },
    ],
  },
  {
    id: 'wedge',
    kind: 'cards',
    kicker: 'Launch wedge',
    title: 'Prove two verticals. Then expand.',
    lead: '“Every personal-development category at once” is the long-term vision and the wrong launch. We narrow to win, then widen.',
    cards: [
      {
        title: 'Fitness / running',
        body: 'Example: Emma, 10K in 12 weeks. Measurable outcomes, shareable progress photos and times, dense freelance instructor supply, natural offline clubs.',
        accent: 'brand',
      },
      {
        title: 'Language learning',
        body: 'Clear milestones, cohort-friendly homework, Europe-native demand, and instructors who already teach online. Complements — does not copy — Duolingo by adding human guidance and social accountability.',
        accent: 'energy',
      },
      {
        title: 'Long-term canvas',
        body: 'Any skill unlocked and shared: career, art, mindset, nutrition, and more. After Benelux proof, Paris and Berlin as youth and innovation capitals for creator density.',
      },
    ],
  },
  {
    id: 'community',
    kind: 'cards',
    kicker: 'How community works (plain English)',
    title: 'Four ways Grow! keeps people after week one',
    lead: 'Forget jargon. Here is what users actually do inside the product.',
    cards: [
      {
        title: 'Timed group programs (~2–3 months)',
        body: 'A class of people starts the same week and aims for the same finish — e.g. “First 10K in 12 weeks” or “B1 French in 10 weeks.” Shared start = urgency. Shared finish = a clear win you can measure.',
        accent: 'brand',
      },
      {
        title: 'Small groups (about 6–10 people)',
        body: 'A tight circle that checks in on progress. Optional: one accountability partner for 1:1 support. Small enough to feel safe; large enough to stay energetic.',
      },
      {
        title: 'A weekly rhythm',
        body: 'Monday: set the week’s goal. Mid-week: a tip or short live from an instructor. Sunday: a short written reflection. Predictable, light, and repeatable.',
      },
      {
        title: 'Private journal → optional share',
        body: 'Writing stays private unless you choose to post. When you hit a milestone, one tap can create a share card for your group — or for Instagram / TikTok. Pride, not pressure.',
        accent: 'energy',
      },
    ],
  },
  {
    id: 'moat',
    kind: 'pillars',
    kicker: 'Defensibility',
    title: 'Acquire socially. Retain through relationship. Defend with data.',
    lead: 'A social feed alone is not a moat. Neither is journaling. The stack is.',
    pillars: [
      {
        title: 'Acquire',
        body: 'Social surfaces where progress is the content — reels, stories, milestone shares — so acquisition looks like culture, not ads.',
      },
      {
        title: 'Retain',
        body: 'Instructors, cohorts, and circles create obligations and belonging that a content feed cannot. Relationship is the retention engine.',
      },
      {
        title: 'Defend',
        body: 'Longitudinal progress data enables better user–instructor matching and personalization over time. Switching costs rise as history deepens.',
      },
    ],
  },
  {
    id: 'brand',
    kind: 'prose',
    kicker: 'Brand',
    title: 'Grow! stands alone. Ambition has a warm accent.',
    paragraphs: [
      'Consumer brand: Grow! only — app stores, ads, instructors, press, and deck chrome. No “Greenworlder Grow!” endorsement. Legal entity appears in contracts, invoices, and privacy footers as required — never as a logo lockup.',
      'Master mark: refined seed + smile forming an abstract “g” — growth and wellbeing. App icon sits on a solid emerald square with safe-zone padding (no oval that dies under iOS/Android masks). Progress language uses seed stages and coral energy for unlocks — never vertical “signal” bars that users confuse with coverage icons.',
      'Palette: emerald for trust and CTAs; coral (#F97066) for streaks, milestones, and celebration; cream neutrals for content. Tone of voice: encouraging, human, specific — never guilt-driven. Missed a day is not failure.',
      'Suggested store listing: Grow! – Goals, Coaches & Community. Drop the exclamation in URLs and handles (letsgrow.lu).',
    ],
  },
  {
    id: 'market',
    kind: 'metrics',
    kicker: 'Market',
    title: 'Personal development is large. Coaching is where money moves.',
    lead: 'We use disciplined figures investors will credit — not social-commerce TAMs that swing by orders of magnitude.',
    metrics: [
      { value: '$56–57bn', label: 'Personal development market (2026)' },
      { value: '~$5.3bn', label: 'Coaching — highest willingness to pay' },
      { value: '~24M', label: 'EU 18–45 with active self-improvement intent' },
      { value: '~8.3M', label: 'LU + BE + FR + DE profile fit (our launch set)' },
    ],
    note: 'Profile fit = population × share aged ~18–45 × 15% intent (same intent rate as EU bottom-up research). Luxembourg is home/legal; Belgium is soft-launch density; France and Germany are scale.',
  },
  {
    id: 'markets-4',
    kind: 'cards',
    kicker: 'Launch markets',
    title: 'Luxembourg · Belgium · France · Germany',
    lead: 'Bottom-up profile fit for the four markets we launch into — before any penetration or revenue claim.',
    cards: [
      {
        title: 'Luxembourg — ~38k profile',
        body: 'HQ and legal home (~0.68M pop). Too small to be the demand engine. Used for trust, ops, and early cohorts — not venture scale alone.',
        accent: 'brand',
      },
      {
        title: 'Belgium — ~615k profile',
        body: 'Soft-launch density: digital, multilingual, creator-friendly. Bridge between LU HQ and larger FR/DE pushes.',
      },
      {
        title: 'France — ~3.47M profile',
        body: 'Paris as youth capital for launch culture. National scale after city proof. Language + fitness cohorts travel well.',
        accent: 'energy',
      },
      {
        title: 'Germany — ~4.16M profile',
        body: 'Berlin as innovation / youth density. Largest absolute profile in the set. Privacy-aware users; social pitch must earn trust.',
      },
    ],
  },
  {
    id: 'revenue-logic',
    kind: 'prose',
    kicker: 'Revenue logic',
    title: '€10 per monetized user per year — planning ARPU',
    lead: 'You asked for a clear income prediction at €10 / user / year. Here is the exact logic — transparent enough for diligence.',
    paragraphs: [
      'Step 1 — Profile fit per country = Population × share aged ~18–45 × 15% active self-improvement intent → ~8.28M across LU+BE+FR+DE.',
      'Step 2 — Monetized users = Profile fit × penetration %. A monetized user is someone who contributes ~€10/year to Grow! on average (blended platform ARPU: instructor take-rate share, later Shop, etc.). Not every download pays €10.',
      'Step 3 — Yearly income ≈ Monetized users × €10.',
      'This is a conservative planning model for the raise narrative. Phase 1 operating reality remains instructor take-rate on GMV — which can exceed €10 blended ARPU when coaches monetize well. We still show €10 so the deck stays honest and comparable.',
      'Sources behind the pitch: c*flow advisory (sequence & ask), independent market research (intent rates & TAM discipline), Carcel/Flexpat craft, live Grow! product, and this four-market €10 model.',
    ],
  },
  {
    id: 'revenue-scenarios',
    kind: 'metrics',
    kicker: 'Income scenarios',
    title: 'Steady-state yearly income @ €10 ARPU (4 markets)',
    lead: 'Mature penetration of the ~8.28M profile — not year-one reality. Use the ramp slide for the path.',
    metrics: [
      { value: '~€0.41M', label: 'Conservative — 0.5% penetration (~41k users)' },
      { value: '~€0.83M', label: 'Base — 1.0% penetration (~83k users)' },
      { value: '~€2.07M', label: 'Upside — 2.5% penetration (~207k users)' },
      { value: '~€4.14M', label: 'Stretch — 5.0% penetration (~414k users)' },
    ],
    note: 'Base 1% country mix at maturity: LU ~€4k · BE ~€62k · FR ~€347k · DE ~€416k ≈ €828k total.',
  },
  {
    id: 'revenue-ramp',
    kind: 'cards',
    kicker: '5-year ramp (base)',
    title: 'Predicted yearly income — launch path',
    lead: 'You do not hit 1% of France and Germany in year one. This ramp is the deck’s planning path at €10 / monetized user / year.',
    cards: [
      {
        title: 'Y1 — ~€120k',
        body: '~12k monetized users. LU+BE soft launch (~1.2% of LU+BE profile) + tiny Paris/Berlin pilots (~0.08% of FR+DE). Prove cohorts and instructors.',
        accent: 'brand',
      },
      {
        title: 'Y2 — ~€350k',
        body: '~35k users. Scale Belgium; city push in Paris and Berlin. Paid tests only after organic baselines.',
      },
      {
        title: 'Y3 — ~€830k',
        body: '~83k users. ~1% of full 4-market profile. National FR/DE expansion if scorecard is green.',
        accent: 'energy',
      },
      {
        title: 'Y4–Y5 — ~€1.2M → ~€1.7M',
        body: '1.5% then ~2% of 4-market profile (~124k → ~166k users). Deeper retention and instructor GMV under the same €10 blended ARPU lens.',
      },
    ],
  },
  {
    id: 'revenue-table',
    kind: 'bullets',
    kicker: 'Country detail @ base 1%',
    title: 'Mature mix — where the €828k comes from',
    lead: 'If we reach 1% monetization of each country’s profile at €10/user/year:',
    bullets: [
      'Luxembourg: ~38k profile → ~380 monetized → ~€3,800 / year (HQ signal, not the P&L engine)',
      'Belgium: ~615k profile → ~6,150 monetized → ~€61,500 / year',
      'France: ~3.47M profile → ~34,700 monetized → ~€347,000 / year',
      'Germany: ~4.16M profile → ~41,600 monetized → ~€416,000 / year',
      'Total: ~82,800 monetized users → ~€828,000 / year at €10 ARPU',
      'Full math and caveats: docs/investor-pitch/FINANCIAL_MODEL_LU_BE_FR_DE.md',
    ],
  },
  {
    id: 'why-now',
    kind: 'bullets',
    kicker: 'Why now',
    title: 'The timing window',
    lead: 'Demand for structured self-improvement is habitual (Strava, Duolingo). Course platforms proved community beats content for completion — but EU-language instructor commerce still has room.',
    bullets: [
      'Gen Z and young millennials treat skill-building as identity — they will pay for coaches and show progress socially when the product respects privacy by default',
      'Skool / Circle / Kajabi capture English creator economies; European-language cohorts and mobile-first social loops are less owned',
      'Privacy is hygiene for Grow! (EU-hosted posture, no data-dividend fantasy) — not the product thesis. The thesis is progress with people',
      'A prior sustainability positioning (v4) is closed. Growth is the only live thesis. Leftover carbon logic is being removed from models and product chrome before diligence',
    ],
  },
  {
    id: 'competition',
    kind: 'bullets',
    kicker: 'Competition',
    title: 'Whitespace: the connected individual growth journey',
    lead: 'Closest peers already combine goals, coaching, and marketplace. We do not claim a empty category — we claim a clearer mobile loop and an EU-first wedge.',
    bullets: [
      'GoalMindr — goals → coach directory → marketplace (very high overlap)',
      'MountSkillMore — gamified personal development + AI coaching + creator marketplace',
      'Forward — roadmap + habits + human coach marketplace',
      'Strive — mentors, challenges, courses; marketing often emphasizes low platform tax',
      'Course / community comps: Skool, Circle, Kajabi — strong revenue, often flat-fee or low take; Grow! must earn take-rate with supply-first seeding',
      'Grow! differentiation: social-first individual journey + peer-earned instructors + private journaling + shareable milestones + EU city GTM — not “privacy social” and not carbon',
    ],
  },
  {
    id: 'model',
    kind: 'cards',
    kicker: 'Business model',
    title: 'Launch on instructor take-rate. Everything else is Phase 2.',
    lead: 'Four revenue pillars at once is a pre-seed failure mode. We sequence.',
    cards: [
      {
        title: 'Phase 1 — Instructors',
        body: 'Primary launch model: take-rate on instructor transactions via Stripe Connect. Preferential take (or holiday) for founding instructors for 6–12 months to seed supply. Optimize for instructor GMV and repeat purchase, not vanity MAU.',
        accent: 'brand',
      },
      {
        title: 'Phase 2 — Shop',
        body: 'Curated marketplace GMV for path-aligned goods and programs. The surface exists today; it is demoted in the raise story until cohort and instructor liquidity are proven.',
      },
      {
        title: 'Phase 2–3 — Business & ads',
        body: 'Business accounts and advertising only become meaningful at real scale. Ads do not produce meaningful revenue below hundreds of thousands of engaged users. We will not pretend otherwise in the deck.',
        accent: 'energy',
      },
    ],
  },
  {
    id: 'gtm',
    kind: 'bullets',
    kicker: 'Go-to-market',
    title: 'Supply first. Controlled soft-launch. Then paid tests.',
    lead: 'Instructors with small audiences are the first acquisition channel. Broad category marketing comes after the loop works.',
    bullets: [
      'Recruit and activate 50–100 founding instructors before a broad consumer push — reduced take, featured placement, toolkit for cohorts',
      'Soft-launch fitness + language cohorts; measure activation (goal + first progress in 7 days), D30, instructor liquidity, cohort completion',
      'Cities: Luxembourg (HQ) + Belgium soft-launch → Paris → Berlin / Germany scale',
      'Offline: running clubs, language meetups, gyms in 1–2 launch cities as trust and referral engines',
      'Paid tests only after organic cohort baselines exist — establish current blended CAC honestly',
      'Prior Greenworlder CAC under €1.20 is historical heritage context from earlier products — it is not Grow! CAC and must never be presented as such without the caveat',
      'Planning ARPU for the four-market model: €10 / monetized user / year → Y1 ~€120k · Y3 base ~€0.83M · Y5 base ~€1.7M (see financial model doc)',
    ],
  },
  {
    id: 'traction',
    kind: 'dual',
    kicker: 'Traction',
    title: 'History is real. The new app must earn its own proof.',
    lead: 'We separate heritage from Grow! so diligence never confuses a plan with a result.',
    left: {
      label: 'Proven (heritage)',
      items: [
        'Five product iterations since 2018 — including white-label era reach',
        '~22,500 historical users across prior generations',
        'Low-cost acquisition playbooks and instructor outreach experience',
        'Working mobile product: social, journal, instructors, Shop, business shell',
      ],
    },
    right: {
      label: 'Planned (Grow! — not yet claimed as done)',
      items: [
        'App Store / Play soft launch and controlled cohorts',
        'Instructor liquidity scorecard (founding 50–100)',
        'Activation / D30 / completion baselines published internally',
        'External raise when retention evidence exists — target window advised around late 2026 after proof',
      ],
    },
  },
  {
    id: 'scorecard',
    kind: 'metrics',
    kicker: 'Launch scorecard',
    title: 'What we will prove before scaling capital.',
    lead: 'These are operating targets for the soft-launch — the board we manage to, not vanity projections.',
    metrics: [
      { value: '40%+', label: 'Activation: goal + first progress within 7 days' },
      { value: '20%+', label: 'D30 retention among activated users' },
      { value: '60%+', label: 'Founding instructors with ≥1 paid engagement in 60 days' },
      { value: '60%+', label: 'Activated users join a cohort or Growth Circle' },
    ],
    note: 'Community extras we track: weekly active contributors as a share of WAU; cohort completion 50%+; referral share of sign-ups 20%+; D30 for community members 2× non-community.',
  },
  {
    id: 'roadmap',
    kind: 'bullets',
    kicker: 'Near-term roadmap',
    title: 'Narrow, validate, then raise',
    lead: 'Aligned with advisory sequencing — not a fantasy path to hundreds of millions of users.',
    bullets: [
      'Now: brand system lock (Grow! standalone, icon, coral energy), eco/carbon chrome removed, wedge IA emphasis in product copy',
      'Next: founding instructor recruitment; first 8–12 week cohorts in fitness and language; Growth Circles live with rituals',
      'In parallel: rebuild financial model without carbon legacy; clarify convertible debt, IP assignment, and any licence arrangements before data-room circulation',
      'Then: revised deck with measured cohort data; structured outreach to angels/operators and pre-seed funds; discuss €1.0–1.25m for 18–24 months runway',
    ],
  },
  {
    id: 'team',
    kind: 'cards',
    kicker: 'Team',
    title: 'Builders of Grow!',
    lead: 'Complete biographies and photos must be locked before any external investor circulation. Placeholders are for internal draft only.',
    cards: [
      {
        title: 'William Ahlefeldt — Founder',
        body: 'Built and scaled prior ventures; IFX Infoforex exit to Reuters. Sets company direction, capital narrative, and instructor / market relationships.',
        accent: 'brand',
      },
      {
        title: 'Chris — Product & leadership',
        body: 'Owns product leadership and operating cadence. Full bio, photo, and role title to be finalized for the circulated deck.',
      },
      {
        title: 'Albino Ndreu — Product & engineering',
        body: 'Mobile and platform engineering, product delivery, and brand/system execution for Grow! across app and landing.',
        accent: 'energy',
      },
      {
        title: 'Next hire — Community lead',
        body: 'Early priority: cohorts, instructor success, rituals, offline partnerships, and trust & safety escalation paths. Community is not a side hustle for a founder.',
      },
    ],
  },
  {
    id: 'ask',
    kind: 'ask',
    kicker: 'Ask',
    title: 'Narrow. Validate. Then raise.',
    lead: 'We are not circulating a fantasy DCF. We are aligning on a disciplined pre-seed to prove the loop.',
    amount: '€1.0–1.25m',
    amountNote:
      'Advisory discussion range for approximately 18–24 months of runway — not a final priced term sheet. Instrument (SAFE / convertible / tranched) to be set with counsel and lead.',
    uses: [
      'Product polish, brand system, and store-ready builds',
      'Founding instructor seeding and preferential take economics',
      'Soft-launch cohorts, community operations, and light paid tests',
      'Financial model rebuild, data room, and corporate hygiene before diligence',
    ],
    contact: 'letsgrow.lu  ·  support@letsgrow.lu',
    diligence: [
      'Confirm status of any large convertible or related-party licence before investor meetings',
      'Assign IP from legacy entities and contractors into the operating newco',
      'Remove carbon-offset rows and outdated ARPU benchmarks from the model',
      'Budget moderation and trust & safety as a real fixed cost — not a token % of early revenue',
    ],
  },
  {
    id: 'risks',
    kind: 'bullets',
    kicker: 'Risks we own',
    title: 'What could go wrong — and how we respond',
    bullets: [
      'Instructor cold start — mitigate with 50–100 founding cohort, fee holiday, and toolkit before consumer spend',
      'Crowded “Grow” naming — stylized Grow!, distinctive mark, EUIPO clearance, store subtitle for discoverability',
      'Public journaling friction — private by default; circles before public; never BeReal-style forced exposure',
      'Take-rate pressure from flat-fee platforms — win on mobile social loop and EU language cohorts; be ready to flex pricing',
      'Scope creep back to four pillars — governance: Phase 2 commerce stays dark in the equity story until scorecard greens',
    ],
  },
  {
    id: 'appendix-comp',
    kind: 'bullets',
    kicker: 'Appendix A',
    title: 'Competitive snapshot (detail)',
    bullets: [
      'GoalMindr — goals + coach directory + marketplace; strong overlap on “goal → coach”',
      'MountSkillMore — gamified PD + AI coaching + community + creator marketplace',
      'Forward — personal roadmap + habits + human coach marketplace',
      'Strive — mentor-led goals, challenges, courses; often positions on lower platform tax',
      'Skool / Circle / Kajabi / Teachable — community and course infrastructure with proven GMV; Grow! differentiates on mobile social progress + peer endorsement instructors',
      'Strava / Duolingo — category kings for fitness and language loops; Grow! partners with that demand via human guidance and multi-path community rather than replacing them overnight',
      'Grow! claim: one mobile journey from goal to coach to plan to progress to community, EU-first, with commerce as Phase 2',
    ],
  },
  {
    id: 'appendix-finance',
    kind: 'prose',
    kicker: 'Appendix B',
    title: 'Financials — revision required before circulation',
    lead: 'This appendix is an honesty slide. Detailed P&L and unit economics will ship only after the model rebuild.',
    paragraphs: [
      'Prior sheets that still contain carbon-offset logic, unrealistic user paths (e.g. trajectories toward hundreds of millions of users without evidence), flat cost bases while scale explodes, or DCF/IRR theater must not leave the building.',
      'What we will bring to diligence instead: cohort-level activation and retention; instructor GMV and take-rate; contribution after payment costs; CAC from measured paid tests; runway under the proposed raise; and a clear statement of any convertible, licence, or IP open points.',
      'Scorecard first. Model second. Narrative always tied to both.',
    ],
  },
  {
    id: 'appendix-reg',
    kind: 'bullets',
    kicker: 'Appendix C',
    title: 'Regulatory & trust posture',
    bullets: [
      'GDPR — journaling and wellbeing-adjacent data treated carefully; Art. 9 sensitivity respected; deletion and export paths exist',
      'DSA — content moderation, report/block, and transparency obligations budgeted as real operations',
      'DAC7 / VAT — marketplace reporting from first relevant GMV when Shop is active',
      'Coaching vs therapy boundary — product and guidelines make clear Grow! is not clinical care; escalation paths for wellbeing crises',
      'Brand promise: we do not sell user data as a dividend product; privacy is hygiene, not the equity thesis',
    ],
  },
  {
    id: 'close',
    kind: 'close',
    title: 'Grow!',
    subtitle: 'Unlock skills. Share your growth.',
    meta: 'Thank you — let’s build the loop that earns the raise',
    body: [
      'Questions, introductions, and data-room requests: support@letsgrow.lu · letsgrow.lu',
    ],
  },
];
