import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Text, View, StyleSheet, Dimensions } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import BadgeIcon from './BadgeIcon';
import { RARE_BADGE_IDS, badgeVisual } from './badgeMeta';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { triggerFeedback } from '../../utils/interactionFeedback';
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
 * Reduce Motion: no confetti / scale, just a fade.
 */
export default function BadgeCelebrationModal({ badge, remaining = 0, onShare, onNext }: Props) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const confetti = useRef(Array.from({ length: CONFETTI_COUNT }, () => new Animated.Value(0))).current;
  const glowLoop = useRef<Animated.CompositeAnimation | null>(null);

  const badgeId = badge?.id ?? '';
  const pieces = useMemo(() => makePieces(badgeId || 'badge'), [badgeId]);
  const visual = badgeVisual(badgeId);

  useEffect(() => {
    if (!badgeId) return;
    triggerFeedback('celebrate');
    fade.setValue(0);
    scale.setValue(reduced ? 1 : 0.4);
    glow.setValue(0);
    confetti.forEach((v) => v.setValue(0));

    const anims: Animated.CompositeAnimation[] = [
      Animated.timing(fade, { toValue: 1, duration: reduced ? 180 : 220, useNativeDriver: true }),
    ];
    if (!reduced) {
      anims.push(
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
        Animated.stagger(
          12,
          confetti.map((v, i) =>
            Animated.timing(v, {
              toValue: 1,
              duration: 1500,
              delay: pieces[i].delay,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            })
          )
        )
      );
    }
    const intro = Animated.parallel(anims);
    intro.start();

    glowLoop.current?.stop();
    if (!reduced) {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      glowLoop.current.start();
    }
    return () => {
      intro.stop();
      glowLoop.current?.stop();
    };
  }, [badgeId, reduced]);

  const finish = (share: boolean) => {
    if (!badge) return;
    void markBadgesSeen([badge.id]).catch(() => undefined);
    triggerFeedback('tap');
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
            {!reduced ? (
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

            <View style={tw`w-full bg-[#FFFcf7] rounded-3xl px-6 pt-8 pb-5 items-center border border-stone-200/80`}>
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

              <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase mt-3`}>
                New badge
              </Text>
              <Text
                style={tw`text-2xl font-bold text-stone-900 text-center mt-1`}
                accessibilityRole="header"
              >
                You earned {badge.name} 🌱
              </Text>
              {badge.description ? (
                <Text style={tw`text-sm text-stone-600 text-center mt-2 leading-5`}>{badge.description}</Text>
              ) : null}
              {badge.points > 0 ? (
                <View style={tw`mt-3 px-3 py-1 rounded-full bg-[#FFF1F0]`}>
                  <Text style={tw`text-sm font-bold text-[#E85D55]`}>+{badge.points} growth points</Text>
                </View>
              ) : null}

              <View style={tw`flex-row gap-2 mt-6 w-full`}>
                <PressableScale
                  onPress={() => finish(true)}
                  feedback={false}
                  style={tw`flex-1 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center`}
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${badge.name}`}
                >
                  <Text style={tw`text-stone-800 font-bold`}>Share</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => finish(false)}
                  feedback={false}
                  style={tw`flex-1 py-3 rounded-2xl bg-emerald-600 items-center`}
                  accessibilityRole="button"
                >
                  <Text style={tw`text-white font-bold`}>Nice!</Text>
                </PressableScale>
              </View>
              {remaining > 0 ? (
                <Text style={tw`text-xs text-stone-500 mt-3`}>
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
