import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Text, View, StyleSheet, Dimensions } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import BadgeIcon from './BadgeIcon';
import { RARE_BADGE_IDS, badgeVisual } from './badgeMeta';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { celebrateOnce } from '../../theme/haptics';
import { breathe, duration, easing, spring, timing } from '../../theme/motion';
import { markBadgesSeen, type BadgeEarned } from '../../services/api/growth';

type Props = {
  /** Badge being celebrated; null hides the modal. */
  badge: BadgeEarned | null;
  /** How many more are queued after this one (shows "1 more to open"). */
  remaining?: number;
  /** Share tapped (badge is already marked seen). */
  onShare: (badge: BadgeEarned) => void;
  /** "Nice!" tapped / dismissed (badge is already marked seen). Show the next one, if any. */
  onNext: (badge: BadgeEarned) => void;
};

const CONFETTI_COLORS = ['#059669', '#34D399', '#F97066', '#FB8A7F', '#F59E0B', '#FCD34D'];
const CONFETTI_COUNT = 24;
const MEDAL = 112;

type Piece = { dx: number; up: number; fall: number; spin: number; size: number; color: string; delay: number; round: boolean };

function makePieces(seed: string): Piece[] {
  // Deterministic-ish per badge so re-renders don't reshuffle.
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const rnd = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const width = Math.min(Dimensions.get('window').width, 420);
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + rnd() * 0.4;
    return {
      dx: Math.cos(angle) * (width * 0.25 + rnd() * width * 0.2),
      up: -(70 + rnd() * 120),
      fall: 120 + rnd() * 160,
      spin: (rnd() > 0.5 ? 1 : -1) * (180 + rnd() * 360),
      size: 6 + Math.round(rnd() * 5),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.round(rnd() * 220) + (i % 6) * 20,
      round: i % 3 !== 0,
    };
  });
}

/**
 * Full-screen celebration for one earned badge. RN Animated only, native driver.
 * Reduce Motion: no confetti / scale, just a fade. Confetti + the celebrate
 * haptic fire once ever per badge (celebrateOnce); the card shows for any unseen badge.
 */
export default function BadgeCelebrationModal({ badge, remaining = 0, onShare, onNext }: Props) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const confetti = useRef(Array.from({ length: CONFETTI_COUNT }, () => new Animated.Value(0))).current;
  /** Confetti + celebrate haptic play once ever per badge (celebrateOnce). */
  const [confettiOn, setConfettiOn] = useState(false);

  const badgeId = badge?.id ?? '';
  const pieces = useMemo(() => makePieces(badgeId || 'badge'), [badgeId]);
  const visual = badgeVisual(badgeId);

  useEffect(() => {
    if (!badgeId) return;
    let alive = true;
    let burst: Animated.CompositeAnimation | null = null;
    setConfettiOn(false);
    fade.setValue(0);
    scale.setValue(reduced ? 1 : 0.4);
    glow.setValue(0);
    confetti.forEach((v) => v.setValue(0));

    // The card + medal always show for an unseen badge.
    const intro = Animated.parallel([
      timing(fade, 1, { duration: duration.base, easing: easing.out }, reduced),
      spring(scale, 1, 'bouncy', reduced),
    ]);
    intro.start();

    // Haptic + confetti only the first time this badge is ever celebrated on this device.
    void celebrateOnce(`badge:${badgeId}`).then((fresh) => {
      if (!alive || !fresh || reduced) return;
      setConfettiOn(true);
      burst = Animated.stagger(
        12,
        confetti.map((v, i) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 1500,
            delay: pieces[i].delay,
            easing: easing.out,
            useNativeDriver: true,
          })
        )
      );
      burst.start();
    });

    const glowLoop = breathe(glow, 0, 1, { period: 2200 }, reduced);
    glowLoop?.start();
    return () => {
      alive = false;
      intro.stop();
      burst?.stop();
      glowLoop?.stop();
    };
  }, [badgeId, reduced]);

  const finish = (share: boolean) => {
    if (!badge) return;
    void markBadgesSeen([badge.id]).catch(() => undefined);
    // Silent: Share opens a sheet, "Nice!" just dismisses — no extra tick after the celebration.
    if (share) onShare(badge);
    else onNext(badge);
  };

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const rare = RARE_BADGE_IDS.has(badgeId);

  return (
    <Modal visible={!!badge} transparent animationType="none" onRequestClose={() => finish(false)} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, tw`bg-black/45 items-center justify-center px-6`, { opacity: fade }]}>
        {badge ? (
          <View style={tw`w-full max-w-sm items-center`}>
            {/* Confetti (behind the card) */}
            {!reduced && confettiOn ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, tw`items-center`, { top: 70 }]}>
                {pieces.map((p, i) => {
                  const v = confetti[i];
                  return (
                    <Animated.View
                      key={i}
                      style={{
                        position: 'absolute',
                        width: p.size,
                        height: p.round ? p.size : p.size * 1.6,
                        borderRadius: p.round ? p.size / 2 : 1.5,
                        backgroundColor: p.color,
                        opacity: v.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [
                          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                          {
                            translateY: v.interpolate({
                              inputRange: [0, 0.35, 1],
                              outputRange: [0, p.up, p.up + p.fall],
                            }),
                          },
                          {
                            rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }),
                          },
                        ],
                      }}
                    />
                  );
                })}
              </View>
            ) : null}

            <View style={tw`w-full bg-card rounded-sheet px-6 pt-8 pb-5 items-center border border-line/80`}>
              <View style={{ width: MEDAL + 40, height: MEDAL + 40, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    width: MEDAL + 36,
                    height: MEDAL + 36,
                    borderRadius: (MEDAL + 36) / 2,
                    backgroundColor: rare ? '#FDE68A' : visual.soft,
                    opacity: reduced ? 0.6 : glowOpacity,
                    transform: [{ scale: reduced ? 1 : glowScale }],
                  }}
                />
                <Animated.View style={{ transform: [{ scale }] }}>
                  <BadgeIcon id={badge.id} size={MEDAL} tier={rare ? 'rare' : 'common'} />
                </Animated.View>
              </View>

              <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase mt-3`}>
                New badge
              </Text>
              <Text
                style={tw`text-2xl font-bold text-ink text-center mt-1`}
                accessibilityRole="header"
              >
                You earned {badge.name} 🌱
              </Text>
              {badge.description ? (
                <Text style={tw`text-sm text-ink-2 text-center mt-2 leading-5`}>{badge.description}</Text>
              ) : null}
              {badge.points > 0 ? (
                <View style={tw`mt-3 px-3 py-1 rounded-full bg-energy-50`}>
                  <Text style={tw`text-sm font-bold text-bloom-ink`}>+{badge.points} growth points</Text>
                </View>
              ) : null}

              <View style={tw`flex-row gap-2 mt-6 w-full`}>
                <PressableScale
                  onPress={() => finish(true)}
                  feedback={false}
                  style={tw`flex-1 py-3 rounded-card bg-raised border border-line items-center`}
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${badge.name}`}
                >
                  <Text style={tw`text-ink font-bold`}>Share</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => finish(false)}
                  feedback={false}
                  style={tw`flex-1 py-3 rounded-card bg-emerald-600 items-center`}
                  accessibilityRole="button"
                >
                  <Text style={tw`text-white font-bold`}>Nice!</Text>
                </PressableScale>
              </View>
              {remaining > 0 ? (
                <Text style={tw`text-xs text-ink-3 mt-3`}>
                  {remaining} more badge{remaining === 1 ? '' : 's'} waiting
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
