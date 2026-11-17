import React from 'react';
import { View, Text, Image as RNImage } from 'react-native';
import type { WeeklyRecap } from '../../services/api/growth';
import { getCategoryMeta } from '../../utils/categoryLabels';
import { recapDayStatuses, recapStatChips } from './growthMeta';

/** Share payloads for the growth system — open with `<ShareCardSheet payload={…} />`. */
type Owner = {
  /** Defaults to the signed-in user. */
  userId?: string;
  username?: string;
  avatar?: string | null;
};

export type RecapSharePayload = Owner & { kind: 'recap'; recap: WeeklyRecap };
export type BadgeSharePayload = Owner & {
  kind: 'badge';
  badgeId: string;
  name: string;
  description: string;
  /** Growth level name ("Sprout") or the level object from GET /me/badges. */
  level?: string | { n: number; name: string };
  /** Optional glyph for the medallion; defaults to 🌱. */
  emoji?: string;
};
export type ChallengeSharePayload = Owner & {
  kind: 'challenge';
  title: string;
  emoji: string;
  progress: number;
  target: number;
  completed: boolean;
};
export type ProgressSharePayload = Owner & {
  kind: 'progress';
  activeDays: number;
  longest: number;
  /** Oldest → newest; the last 91 are drawn as a 13-week grid. */
  heatmapDays?: { day: string; active: boolean; rest?: boolean }[];
};
export type GrowthSharePayload =
  | RecapSharePayload
  | BadgeSharePayload
  | ChallengeSharePayload
  | ProgressSharePayload;

export type GrowthShareFormat = 'story' | 'square';

const GROWTH_KINDS = new Set(['recap', 'badge', 'challenge', 'progress']);
export function isGrowthSharePayload(p: { kind: string } | null | undefined): p is GrowthSharePayload {
  return !!p && GROWTH_KINDS.has(p.kind);
}

export function growthShareKindLabel(kind: GrowthSharePayload['kind']): string {
  switch (kind) {
    case 'recap':
      return 'Weekly recap';
    case 'badge':
      return 'Badge';
    case 'challenge':
      return 'Challenge';
    case 'progress':
      return 'Progress';
  }
}

export function growthShareMessage(p: GrowthSharePayload, link: string): string {
  switch (p.kind) {
    case 'recap':
      return [
        `My week in growth on Grow!: ${p.recap.active_days} active ${p.recap.active_days === 1 ? 'day' : 'days'}.`,
        p.recap.reflection,
        link,
      ]
        .filter(Boolean)
        .join('\n');
    case 'badge':
      return [`I earned “${p.name}” on Grow! 🌱`, p.description, link].filter(Boolean).join('\n');
    case 'challenge':
      return [
        p.completed
          ? `${p.emoji} Finished “${p.title}” on Grow!`
          : `${p.emoji} ${p.progress}/${p.target} days into “${p.title}” on Grow!`,
        link,
      ].join('\n');
    case 'progress':
      return [
        `${p.activeDays} active days on Grow! · longest streak ${p.longest} ${p.longest === 1 ? 'day' : 'days'}.`,
        link,
      ].join('\n');
  }
}

const C = {
  cream: '#FFFcf7',
  page: '#F3EEE4',
  sand: '#EAE4D6',
  brand: '#059669',
  brandDark: '#065F46',
  brandSoft: '#ECFDF5',
  coral: '#F97066',
  coralSoft: '#FFF1F0',
  ink: '#1C1917',
  muted: '#57534E',
  faint: '#A8A29E',
};

type Props = {
  payload: GrowthSharePayload;
  width: number;
  height: number;
  username: string;
};

function weekdayLetter(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'narrow' });
}

/**
 * Branded growth card captured by ShareCardSheet (story 9:16 or square 1:1).
 * Plain Views + inline styles only so react-native-view-shot paints it reliably.
 */
export default function GrowthShareCard({ payload, width, height, username }: Props) {
  const k = width / 360; // type scale
  const tall = height / width > 1.4;
  const fs = (n: number) => Math.round(n * k);

  const kicker = (text: string, color = C.coral) => (
    <Text
      style={{
        fontSize: fs(11),
        fontWeight: '800',
        letterSpacing: 2.4,
        color,
        textTransform: 'uppercase',
        marginBottom: fs(10),
      }}
    >
      {text}
    </Text>
  );

  let body: React.ReactNode = null;

  if (payload.kind === 'recap') {
    const r = payload.recap;
    const dots = recapDayStatuses(r.days || []);
    const chips = recapStatChips(r, (p) => getCategoryMeta(p).parentLabel);
    const dot = fs(tall ? 30 : 24);
    body = (
      <View>
        {kicker(r.is_first_week ? 'My first week' : 'My week in growth')}
        <Text style={{ fontSize: fs(tall ? 76 : 60), fontWeight: '800', color: C.ink, lineHeight: fs(tall ? 82 : 66) }}>
          {r.active_days}
        </Text>
        <Text style={{ fontSize: fs(18), fontWeight: '600', color: C.muted, marginTop: fs(2) }}>
          active {r.active_days === 1 ? 'day' : 'days'} this week
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: fs(tall ? 26 : 16) }}>
          {dots.map((d) => (
            <View key={d.day} style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  backgroundColor:
                    d.status === 'active' ? C.brand : d.status === 'rest' ? '#A7F3D0' : C.sand,
                }}
              />
              <Text style={{ fontSize: fs(11), color: C.faint, marginTop: fs(6), fontWeight: '600' }}>
                {weekdayLetter(d.day)}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: fs(tall ? 22 : 14) }}>
          {chips.map((c) => (
            <View
              key={c}
              style={{
                paddingHorizontal: fs(12),
                paddingVertical: fs(6),
                borderRadius: 999,
                backgroundColor: C.brandSoft,
                marginRight: fs(8),
                marginBottom: fs(8),
              }}
            >
              <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.brandDark }}>{c}</Text>
            </View>
          ))}
        </View>
        {r.reflection ? (
          <Text
            style={{ fontSize: fs(tall ? 18 : 15), lineHeight: fs(tall ? 26 : 21), color: C.ink, marginTop: fs(8), fontWeight: '500' }}
            numberOfLines={tall ? 4 : 2}
          >
            {r.reflection}
          </Text>
        ) : null}
      </View>
    );
  } else if (payload.kind === 'badge') {
    const medal = fs(tall ? 150 : 110);
    const level = typeof payload.level === 'string' ? payload.level : payload.level?.name;
    body = (
      <View style={{ alignItems: 'center' }}>
        {kicker('Badge earned')}
        <View
          style={{
            width: medal,
            height: medal,
            borderRadius: medal / 2,
            backgroundColor: C.brandSoft,
            borderWidth: fs(5),
            borderColor: '#A7F3D0',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: medal * 0.45 }}>{payload.emoji || '🌱'}</Text>
        </View>
        <Text style={{ fontSize: fs(30), fontWeight: '800', color: C.ink, marginTop: fs(18), textAlign: 'center' }}>
          {payload.name}
        </Text>
        <Text
          style={{ fontSize: fs(16), lineHeight: fs(22), color: C.muted, marginTop: fs(8), textAlign: 'center' }}
          numberOfLines={3}
        >
          {payload.description}
        </Text>
        {level ? (
          <View
            style={{
              marginTop: fs(14),
              paddingHorizontal: fs(14),
              paddingVertical: fs(6),
              borderRadius: 999,
              backgroundColor: C.coralSoft,
            }}
          >
            <Text style={{ fontSize: fs(12), fontWeight: '800', color: '#E0584E' }}>Level · {level}</Text>
          </View>
        ) : null}
      </View>
    );
  } else if (payload.kind === 'challenge') {
    const target = Math.max(1, payload.target);
    const pct = Math.max(0, Math.min(1, payload.progress / target));
    const barW = width - fs(44) * 2;
    body = (
      <View>
        {kicker(payload.completed ? 'Challenge complete' : 'Challenge in progress')}
        <Text style={{ fontSize: fs(tall ? 64 : 48) }}>{payload.emoji}</Text>
        <Text style={{ fontSize: fs(28), lineHeight: fs(34), fontWeight: '800', color: C.ink, marginTop: fs(10) }}>
          {payload.title}
        </Text>
        <View
          style={{
            width: barW,
            height: fs(14),
            borderRadius: fs(7),
            backgroundColor: C.sand,
            marginTop: fs(22),
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: Math.max(fs(14), barW * pct),
              height: fs(14),
              borderRadius: fs(7),
              backgroundColor: payload.completed ? C.brand : C.coral,
            }}
          />
        </View>
        <Text style={{ fontSize: fs(16), fontWeight: '700', color: C.muted, marginTop: fs(10) }}>
          {payload.completed ? 'Completed ✓' : `${payload.progress} of ${payload.target} days`}
        </Text>
      </View>
    );
  } else {
    const days = (payload.heatmapDays || []).slice(-91);
    const cols = Math.ceil(days.length / 7);
    const gap = fs(3);
    const cell = cols > 0 ? Math.min(fs(18), Math.floor((width - fs(44) * 2 - gap * (cols - 1)) / cols)) : 0;
    body = (
      <View>
        {kicker('My growth')}
        <Text style={{ fontSize: fs(tall ? 76 : 60), fontWeight: '800', color: C.ink, lineHeight: fs(tall ? 82 : 66) }}>
          {payload.activeDays}
        </Text>
        <Text style={{ fontSize: fs(18), fontWeight: '600', color: C.muted }}>active days</Text>
        <Text style={{ fontSize: fs(15), fontWeight: '700', color: '#E0584E', marginTop: fs(8) }}>
          Longest streak · {payload.longest} {payload.longest === 1 ? 'day' : 'days'}
        </Text>
        {cols > 0 ? (
          <View style={{ flexDirection: 'row', marginTop: fs(tall ? 26 : 16) }}>
            {Array.from({ length: cols }).map((_, c) => (
              <View key={c} style={{ marginRight: c === cols - 1 ? 0 : gap }}>
                {days.slice(c * 7, c * 7 + 7).map((d) => (
                  <View
                    key={d.day}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: Math.max(2, cell / 4),
                      marginBottom: gap,
                      backgroundColor: d.active ? C.brand : d.rest ? '#A7F3D0' : C.sand,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View collapsable={false} style={{ width, height, backgroundColor: C.cream, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          top: -width * 0.25,
          right: -width * 0.2,
          width: width * 0.75,
          height: width * 0.75,
          borderRadius: width,
          backgroundColor: 'rgba(16,185,129,0.10)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -width * 0.3,
          left: -width * 0.25,
          width: width * 0.7,
          height: width * 0.7,
          borderRadius: width,
          backgroundColor: 'rgba(249,112,102,0.10)',
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: fs(24), paddingTop: fs(tall ? 34 : 22) }}>
        <RNImage
          source={require('../../../assets/icon.png')}
          style={{ width: fs(30), height: fs(30), borderRadius: fs(8), marginRight: fs(10) }}
        />
        <Text style={{ fontSize: fs(15), letterSpacing: 2.5, color: C.brandDark, fontWeight: '800' }}>GROW!</Text>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: fs(44) }}>{body}</View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: fs(24),
          paddingBottom: fs(tall ? 34 : 20),
        }}
      >
        <Text style={{ fontSize: fs(13), fontWeight: '700', color: C.ink }} numberOfLines={1}>
          {username ? `@${username}` : ''}
        </Text>
        <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.brandDark }}>Grow! · letsgrow.lu</Text>
      </View>
    </View>
  );
}
