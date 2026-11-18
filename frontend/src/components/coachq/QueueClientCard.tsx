import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import ProofMedia from '../proof/ProofMedia';
import type { QueueClient } from '../../services/api/coachq';
import { contactLabel, displayName, proofChipLabel, weekStats } from './queueFormat';

type Props = {
  item: QueueClient;
  busy?: boolean;
  onOpen: (item: QueueClient) => void;
  onMessage: (item: QueueClient) => void;
  onTemplate: (item: QueueClient) => void;
  onHandled: (item: QueueClient) => void;
  onOverride: (item: QueueClient) => void;
};

const STATUS_STYLE = {
  red: { dot: 'bg-rose-500', chip: 'bg-rose-50 border-rose-100', text: 'text-rose-800', label: 'Act today' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 border-amber-100', text: 'text-amber-800', label: 'This week' },
  green: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-800', label: 'On track' },
} as const;

/** One client in the coach's attention queue: why, their week, and one-tap actions. */
export default function QueueClientCard({ item, busy, onOpen, onMessage, onTemplate, onHandled, onOverride }: Props) {
  const s = STATUS_STYLE[item.status];
  const name = displayName(item.client);
  const stats = weekStats(item.week);
  const live = item.reasons.filter((r) => !r.snoozed);
  const handled = !!item.handled_until;
  const proofs = (item.recent_proofs || []).slice(0, 3);
  // Photos keep a thumbnail; number / timer / note / voice get a compact chip.
  const photoProofs = proofs.filter((p) => p.kind === 'photo' && !!p.media_url);
  const chipProofs = proofs.filter((p) => !photoProofs.includes(p));

  return (
    <View style={tw`mb-3 rounded-card bg-card border border-line/80 overflow-hidden`}>
      <PressableScale
        onPress={() => onOpen(item)}
        feedback="open"
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${s.label}. ${live.map((r) => r.label).join('. ')}. Open plan`}
        style={tw`px-3.5 pt-3 pb-2 flex-row items-center`}
      >
        <GrowAvatar userId={item.client.id} username={item.client.username} uri={item.client.avatar_url} size={40} />
        <View style={tw`flex-1 ml-3`}>
          <View style={tw`flex-row items-center`}>
            <View style={tw`w-2 h-2 rounded-full mr-1.5 ${s.dot}`} />
            <Text style={tw`text-callout font-bold text-ink flex-shrink`} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={tw`text-caption text-ink-3 mt-0.5`} numberOfLines={1}>
            {contactLabel(item.last_contact_at)}
            {handled ? ' · Handled' : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
      </PressableScale>

      {item.override ? (
        <View style={tw`mx-3.5 mb-2 px-2.5 py-1.5 rounded-control bg-raised flex-row items-center`}>
          <Ionicons name="flag-outline" size={12} color={theme.colors.ink3} />
          <Text style={tw`text-caption text-ink-2 ml-1.5 flex-1`} numberOfLines={2}>
            You set this to “{STATUS_STYLE[item.override.status].label}”: {item.override.reason}
          </Text>
        </View>
      ) : null}

      {item.reasons.length || item.wins.length ? (
        <View style={tw`flex-row flex-wrap px-3.5`}>
          {item.reasons.map((r) => (
            <View
              key={r.code}
              style={tw`mr-1.5 mb-1.5 px-2 py-1 rounded-chip border ${
                r.snoozed ? 'bg-raised border-line' : s.chip
              }`}
            >
              <Text style={tw`text-caption font-semibold ${r.snoozed ? 'text-ink-3' : s.text}`}>{r.label}</Text>
            </View>
          ))}
          {item.wins.map((w) => (
            <View key={w.code} style={tw`mr-1.5 mb-1.5 px-2 py-1 rounded-chip border bg-violet-50 border-violet-100`}>
              <Text style={tw`text-caption font-semibold text-violet-800`}>★ {w.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {stats.length || proofs.length ? (
        <View style={tw`flex-row items-center px-3.5 pb-2`}>
          <View style={tw`flex-1 flex-row flex-wrap items-center`}>
            {stats.map((st) => (
              <View key={st.key} style={tw`flex-row items-center mr-3 mt-1`}>
                <Ionicons name={st.icon as keyof typeof Ionicons.glyphMap} size={12} color={theme.colors.ink3} />
                <Text style={tw`text-caption text-ink-2 ml-1`}>{st.label}</Text>
              </View>
            ))}
            {chipProofs.map((p) => {
              const label = proofChipLabel(p);
              return (
                <View
                  key={p.id}
                  accessibilityLabel={`Recent proof: ${label}`}
                  style={tw`mr-1.5 mt-1 px-2 py-0.5 rounded-chip bg-raised border border-line`}
                >
                  <Text style={tw`text-caption font-semibold text-ink-2`} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          {photoProofs.length ? (
            <View style={tw`flex-row ml-2`} accessibilityLabel={`${photoProofs.length} recent photo proofs`}>
              {photoProofs.map((p) => (
                <View key={p.id} style={tw`w-9 h-9 rounded-control overflow-hidden ml-1 bg-raised`}>
                  <ProofMedia proof={p} style={tw`w-full h-full`} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={tw`flex-row border-t border-line/70`}>
        <Action icon="chatbubble-outline" label="Message" onPress={() => onMessage(item)} disabled={busy} />
        <Action icon="flash-outline" label="Reply" onPress={() => onTemplate(item)} disabled={busy} />
        <Action
          icon={handled ? 'checkmark-done' : 'checkmark-done-outline'}
          label={item.status === 'green' ? 'Seen 👍' : 'Handled'}
          onPress={() => onHandled(item)}
          disabled={busy}
          a11y={item.status === 'green' ? 'Mark seen' : 'Mark handled for 7 days'}
        />
        <Action icon="flag-outline" label="Status" onPress={() => onOverride(item)} disabled={busy} a11y="Change status" />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  a11y,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  a11y?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      feedback="tap"
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
      accessibilityState={{ disabled: !!disabled }}
      style={tw`flex-1 py-2.5 items-center justify-center flex-row ${disabled ? 'opacity-50' : ''}`}
    >
      <Ionicons name={icon} size={15} color={theme.colors.ink2} />
      <Text style={tw`text-footnote font-semibold text-ink-2 ml-1`}>{label}</Text>
    </PressableScale>
  );
}
