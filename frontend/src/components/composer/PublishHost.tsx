import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableScale from '../ui/PressableScale';
import tw from '../../lib/tw';
import { duration, easing, pop, spring, timing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PUBLISH_PILL_COPY } from '../../hooks/composerConfig';
import { navigationRef } from '../../app/navigation/navigationRef';
import {
  installPublishDeps,
  publishQueue,
  usePublishQueue,
  type PublishJob,
} from '../../state/usePublishQueue';
import { pickPillJob, pillModel } from '../../services/publish/pillModel';
import {
  appPublishDeps,
  openComposerForEdit,
  openSharedReel,
} from '../../services/publish/publishWiring';

/** How long the "Shared" pill stays before it slides away. */
const SUCCESS_HOLD_MS = 2400;
/** Screens where the pill would cover the composer's own header. */
const HIDDEN_ON = new Set(['Post', 'CreateReel', 'CreateStory', 'Auth']);

function useCurrentRouteName(): string | undefined {
  const [name, setName] = useState<string | undefined>(() =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined
  );
  useEffect(() => {
    const read = () => setName(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined);
    read();
    const offState = navigationRef.addListener('state', read);
    const offReady = navigationRef.addListener('ready', read);
    return () => {
      offState();
      offReady();
    };
  }, []);
  return name;
}

/** Bar fill: scaleX from the left edge; Reduce Motion jumps instead of easing. */
function ProgressBar({ value, reduced }: { value: number; reduced: boolean }) {
  const anim = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    if (reduced) {
      anim.setValue(value);
      return;
    }
    const a = timing(anim, value, { duration: duration.base, easing: easing.out });
    a.start();
    return () => a.stop();
  }, [anim, reduced, value]);
  return (
    <View style={tw`h-1 mt-1.5 rounded-full bg-white/15 overflow-hidden`}>
      <Animated.View
        style={[
          tw`h-1 w-full rounded-full bg-brand-400`,
          { transformOrigin: 'left', transform: [{ scaleX: anim }] },
        ]}
      />
    </View>
  );
}

function Thumb({ job, success }: { job: PublishJob; success: boolean }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!success) return;
    scale.setValue(reduced ? 1 : 0.6);
    const a = pop(scale, 1.15, 'bouncy', reduced);
    a.start();
    return () => a.stop();
  }, [reduced, scale, success]);

  return (
    <View style={tw`w-10 h-10 rounded-control overflow-hidden bg-white/10 items-center justify-center`}>
      {job.thumbUri ? (
        <Image
          source={{ uri: job.thumbUri }}
          style={tw`absolute inset-0`}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons
          name={job.kind === 'post' ? 'image-outline' : job.kind === 'reel' ? 'film-outline' : 'sparkles-outline'}
          size={18}
          color="#FFFFFF"
        />
      )}
      {success ? (
        <Animated.View
          style={[
            tw`absolute inset-0 bg-brand-600/85 items-center justify-center`,
            { transform: [{ scale }] },
          ]}
        >
          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
        </Animated.View>
      ) : null}
    </View>
  );
}

function PillButton({
  label,
  onPress,
  primary,
  hint,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  hint?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={6}
      feedback={primary ? 'commit' : false}
      style={tw`px-3 py-2 ml-1 rounded-full ${primary ? 'bg-brand-600' : 'bg-white/10'}`}
    >
      <Text style={tw`text-white text-footnote font-bold`}>{label}</Text>
    </PressableScale>
  );
}

/**
 * Global background-publishing pill. Mount once in App.tsx (after the
 * navigation tree, next to ToastHost). While mounted, the composers hand
 * Share to `usePublishQueue` and close immediately; without it they fall
 * back to the in-place PublishingOverlay.
 */
export default function PublishHost() {
  const jobs = usePublishQueue((s) => s.jobs);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const routeName = useCurrentRouteName();

  useEffect(() => {
    installPublishDeps(appPublishDeps);
    publishQueue.getState().hostMounted(true);
    return () => publishQueue.getState().hostMounted(false);
  }, []);

  const job = pickPillJob(jobs);
  const visible = !!job && !(routeName && HIDDEN_ON.has(routeName));

  // Keep the last content around so the exit animation plays with it.
  const lastJobRef = useRef<PublishJob | null>(null);
  if (visible && job) lastJobRef.current = job;
  const [mounted, setMounted] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const a = spring(enter, 1, 'gentle', reduced);
      a.start();
      return () => a.stop();
    }
    const a = timing(enter, 0, { duration: duration.quick, easing: easing.in }, reduced);
    a.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => a.stop();
  }, [enter, visible, reduced]);

  // "Shared" holds briefly, then leaves.
  const successId = job?.status === 'success' ? job.id : null;
  useEffect(() => {
    if (!successId) return;
    AccessibilityInfo.announceForAccessibility(PUBLISH_PILL_COPY.success);
    const t = setTimeout(() => publishQueue.getState().dismiss(successId), SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [successId]);

  const failedId = job?.status === 'failed' ? job.id : null;
  useEffect(() => {
    if (failedId) AccessibilityInfo.announceForAccessibility(PUBLISH_PILL_COPY.failed);
  }, [failedId]);

  const shown = visible && job ? job : lastJobRef.current;
  if (!mounted || !shown) return null;
  const model = pillModel(shown, jobs);
  const q = publishQueue.getState();
  const success = shown.status === 'success';
  const failed = shown.status === 'failed';
  const canViewReel = success && shown.kind === 'reel' && !!shown.post?.id;

  return (
    <View
      pointerEvents="box-none"
      style={[tw`absolute left-0 right-0 items-center px-gutter`, { top: insets.top + 6, zIndex: 900, elevation: 900 }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          tw`w-full max-w-[420px] flex-row items-center rounded-card bg-[#1C1917] dark:bg-[#2E2A26] pl-2 pr-1.5 py-2`,
          {
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            opacity: enter,
            transform: reduced
              ? []
              : [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          },
        ]}
      >
        <Thumb job={shown} success={success} />
        <View
          style={tw`flex-1 ml-2.5 mr-1`}
          accessible
          accessibilityRole={failed ? 'alert' : 'progressbar'}
          accessibilityLabel={failed && shown.error ? `${model.label}. ${shown.error}` : model.label}
          accessibilityValue={
            model.bar !== null ? { min: 0, max: 100, now: model.percent } : undefined
          }
        >
          <Text style={tw`text-white text-footnote font-semibold`} numberOfLines={1}>
            {model.label}
            {model.waiting > 0 ? <Text style={tw`text-white/60`}>{`  ·  +${model.waiting}`}</Text> : null}
          </Text>
          {failed && shown.error ? (
            <Text style={tw`text-white/60 text-caption mt-0.5`} numberOfLines={1}>
              {shown.error}
            </Text>
          ) : null}
          {model.bar !== null ? <ProgressBar value={model.bar} reduced={reduced} /> : null}
        </View>
        {model.canCancel ? (
          <PillButton
            label={PUBLISH_PILL_COPY.cancel}
            hint="Stops sharing. Your draft stays saved."
            onPress={() => q.cancel(shown.id)}
          />
        ) : null}
        {failed ? (
          <>
            <PillButton
              label={PUBLISH_PILL_COPY.edit}
              hint="Reopens your draft"
              onPress={() => {
                const req = q.edit(shown.id);
                if (req) openComposerForEdit(req);
              }}
            />
            <PillButton label={PUBLISH_PILL_COPY.retry} primary onPress={() => q.retry(shown.id)} />
            <PressableScale
              onPress={() => q.dismiss(shown.id)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              accessibilityHint="Your draft stays saved for next time"
              hitSlop={8}
              style={tw`w-8 h-8 items-center justify-center`}
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </PressableScale>
          </>
        ) : null}
        {canViewReel ? (
          <PillButton
            label={PUBLISH_PILL_COPY.view}
            onPress={() => {
              q.dismiss(shown.id);
              openSharedReel(shown);
            }}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
