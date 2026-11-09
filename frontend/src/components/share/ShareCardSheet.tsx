import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Share,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import tw from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import { feedback } from '../../utils/interactionFeedback';
import { Image as ExpoImage } from 'expo-image';
import {
  DEFAULT_AVATAR_ASSET,
  resolveAvatarUri,
  resolvePostMediaUri,
} from '../../utils/images';
import { isVideoMedia } from '../../services/api/media';
import { getPublicProfile } from '../../services/api/profile';
import { useAuth } from '../../store/hooks';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { alertMessage } from '../../utils/confirmDialog';
import { copyToClipboard } from '../../utils/csvDownload';
import FadeInUp from '../ui/FadeInUp';

export type ShareCardPayload =
  | {
      kind: 'profile';
      userId: string;
      username: string;
      avatar?: string | null;
      isInstructor?: boolean;
      teachingHeadline?: string | null;
      categories?: string[];
      points?: number;
      endorsements?: number;
    }
  | {
      kind: 'milestone';
      username: string;
      avatar?: string | null;
      userId?: string;
      title: string;
      subtitle: string;
      pathLabel?: string;
    }
  | {
      kind: 'post';
      postId: string;
      userId: string;
      username: string;
      avatar?: string | null;
      caption?: string;
      imageUrl?: string | null;
      category?: string;
      subcategory?: string;
      isInstructor?: boolean;
      mediaType?: string | null;
      isReel?: boolean;
    }
  | {
      kind: 'voice';
      entryId: string;
      userId: string;
      username: string;
      avatar?: string | null;
      content: string;
      moodLabel?: string | null;
      pathLabel?: string | null;
    };

type Props = {
  visible: boolean;
  onClose: () => void;
  payload: ShareCardPayload | null;
};

function sheetTitle(kind: ShareCardPayload['kind']): string {
  switch (kind) {
    case 'profile':
      return 'Profile card';
    case 'post':
      return 'Share this post';
    case 'voice':
      return 'Share this voice';
    case 'milestone':
      return 'Pride moment';
  }
}

function sheetKicker(kind: ShareCardPayload['kind']): string {
  switch (kind) {
    case 'profile':
      return 'Postcard';
    case 'post':
      return '4:5 Stories';
    case 'voice':
      return 'Journal voice';
    case 'milestone':
      return 'Pride moment';
  }
}

async function prefetchRemote(uri: string) {
  if (!uri || !/^https?:\/\//i.test(uri)) return;
  await Promise.all([
    ExpoImage.prefetch(uri).catch(() => false),
    RNImage.prefetch(uri).catch(() => false),
  ]);
}

function buildLink(payload: ShareCardPayload): string {
  if (payload.kind === 'post') {
    return `https://letsgrow.lu/p/${encodeURIComponent(payload.postId)}`;
  }
  if (payload.kind === 'voice') {
    return `https://letsgrow.lu/j/${encodeURIComponent(payload.entryId)}`;
  }
  return `https://letsgrow.lu/u/${encodeURIComponent(payload.username)}`;
}

function buildMessage(payload: ShareCardPayload, link: string): string {
  if (payload.kind === 'profile') {
    return [
      `Meet ${payload.username} on Grow!`,
      payload.isInstructor ? 'Instructor · peer-earned trust' : 'Growing on purpose',
      payload.teachingHeadline || '',
      link,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (payload.kind === 'post') {
    const caption = (payload.caption || '').trim();
    const clip = caption.length > 140 ? `${caption.slice(0, 137).trim()}…` : caption;
    return [
      `${payload.username} on Grow!`,
      clip || 'A growth moment worth sharing.',
      link,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (payload.kind === 'voice') {
    const clip =
      payload.content.length > 160
        ? `${payload.content.slice(0, 157).trim()}…`
        : payload.content.trim();
    return [
      `A voice from ${payload.username} on Grow!`,
      `“${clip}”`,
      payload.pathLabel ? `Path: ${payload.pathLabel}` : '',
      link,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    payload.title,
    payload.subtitle,
    payload.pathLabel ? `Path: ${payload.pathLabel}` : '',
    `— ${payload.username} on Grow!`,
    link,
  ]
    .filter(Boolean)
    .join('\n');
}

const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
  },
  android: { elevation: 10 },
  default: {},
});

/**
 * Premium share postcard — capture as image for Instagram Stories / Feed.
 * Profile · post · journal voice · milestone.
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function ShareCardSheet({ visible, onClose, payload }: Props) {
  const sharing = useRef(false);
  const shotRef = useRef<ViewShot>(null);
  const closeRef = useRef<() => void>(() => {});
  const loadedRef = useRef({ hero: true, avatar: true });
  const cardPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 48 || g.vy > 0.9) closeRef.current();
      },
    })
  ).current;
  const { user } = useAuth();
  const [capturing, setCapturing] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const [liveAvatar, setLiveAvatar] = useState('');
  const [liveName, setLiveName] = useState('');

  const link = useMemo(() => (payload ? buildLink(payload) : ''), [payload]);
  const message = useMemo(
    () => (payload ? buildMessage(payload, link) : ''),
    [payload, link]
  );

  const previewWidth = Math.min(Dimensions.get('window').width - 40, 360);
  /** Instagram portrait 4:5 */
  const previewHeight = Math.round((previewWidth * 5) / 4);

  const subjectId = useMemo(() => {
    if (!payload) return '';
    return payload.kind === 'milestone' ? payload.userId || '' : payload.userId;
  }, [payload]);

  const avatarUri = useMemo(() => {
    if (!payload) return '';
    const raw =
      liveAvatar ||
      (user && subjectId && user.id === subjectId ? user.avatar : '') ||
      payload.avatar ||
      '';
    return resolveAvatarUri(subjectId || payload.username, payload.username, raw);
  }, [payload, liveAvatar, user, subjectId]);

  const postImage = useMemo(() => {
    if (!payload || payload.kind !== 'post') return '';
    return resolvePostMediaUri(payload.imageUrl, payload.category, payload.postId);
  }, [payload]);

  const videoHero = useMemo(() => {
    if (!payload || payload.kind !== 'post') return false;
    return (
      payload.mediaType === 'video' ||
      !!payload.isReel ||
      isVideoMedia({ uri: postImage, mediaType: payload.mediaType })
    );
  }, [payload, postImage]);

  const showPostPhoto = !!(payload?.kind === 'post' && postImage && !videoHero && !heroFailed);
  const avatarSrc = avatarUri ? { uri: avatarUri } : DEFAULT_AVATAR_ASSET;

  useEffect(() => {
    if (!visible || !payload || !subjectId) return;
    let cancelled = false;
    setLiveAvatar('');
    setLiveName('');
    if (user && user.id === subjectId && user.avatar) {
      setLiveAvatar(user.avatar);
    }
    void getPublicProfile(subjectId)
      .then((p) => {
        if (cancelled) return;
        if (p.avatar) setLiveAvatar(p.avatar);
        if (p.username) setLiveName(p.username);
      })
      .catch(() => {
        /* keep payload / auth avatar */
      });
    return () => {
      cancelled = true;
    };
  }, [visible, payload, subjectId, user]);

  useEffect(() => {
    if (!visible || !payload) return;
    setHeroFailed(false);
    const needHero = payload.kind === 'post' && !!postImage && !videoHero;
    loadedRef.current = { hero: !needHero, avatar: !avatarUri };
    if (avatarUri) void prefetchRemote(avatarUri);
    if (needHero) void prefetchRemote(postImage);
  }, [visible, payload, avatarUri, postImage, videoHero]);

  const shareLink = async () => {
    if (!payload || sharing.current) return;
    sharing.current = true;
    feedback.send();
    try {
      await Share.share(Platform.OS === 'ios' ? { message, url: link } : { message });
    } catch (e) {
      if ((e as { message?: string })?.message !== 'User did not share') {
        alertMessage('Could not share', e instanceof Error ? e.message : 'Try again');
      }
    } finally {
      sharing.current = false;
    }
  };

  const shareImage = async () => {
    if (!payload || capturing || sharing.current) return;
    setCapturing(true);
    sharing.current = true;
    feedback.send();
    try {
      if (showPostPhoto) void prefetchRemote(postImage);
      if (avatarUri) void prefetchRemote(avatarUri);
      const deadline = Date.now() + 1600;
      while (Date.now() < deadline && (!loadedRef.current.hero || !loadedRef.current.avatar)) {
        await sleep(40);
      }
      await sleep(80);
      const uri = await captureRef(shotRef, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        width: 1080,
        height: 1350,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          UTI: 'public.jpeg',
          dialogTitle: 'Share Grow! card',
        });
      } else if (uri && Platform.OS === 'ios') {
        await Share.share({ url: uri, message });
      } else {
        sharing.current = false;
        await shareLink();
      }
    } catch (e) {
      if ((e as { message?: string })?.message === 'User did not share') return;
      // Fallback to link share if capture fails (e.g. web / missing native module)
      sharing.current = false;
      try {
        await Share.share(Platform.OS === 'ios' ? { message, url: link } : { message });
      } catch {
        alertMessage('Could not share', e instanceof Error ? e.message : 'Try again');
      }
    } finally {
      setCapturing(false);
      sharing.current = false;
    }
  };

  const copyLink = async () => {
    if (!link) return;
    feedback.select();
    await copyToClipboard(link, 'Link copied');
  };

  if (!payload) return null;

  const username = liveName || payload.username;
  const brandBarH = 56;
  const footerH = payload.kind === 'profile' ? 78 : 96;
  const heroH = Math.max(180, previewHeight - brandBarH - footerH);

  const pathLine =
    payload.kind === 'profile' && payload.categories?.length
      ? payload.categories.slice(0, 2).map(getCategoryLabel).join(' · ')
      : payload.kind === 'milestone'
        ? payload.pathLabel
        : payload.kind === 'voice'
          ? payload.pathLabel
          : payload.kind === 'post' && (payload.category || payload.subcategory)
            ? [payload.category, payload.subcategory]
                .filter(Boolean)
                .map((p) => getCategoryLabel(String(p)))
                .join(' · ')
            : null;

  const accentWarm = payload.kind === 'voice' || payload.kind === 'milestone';
  const kindLabel =
    payload.kind === 'voice'
      ? 'Voice'
      : payload.kind === 'post'
        ? 'Post'
        : payload.kind === 'milestone'
          ? 'Milestone'
          : 'Profile';

  const captionText =
    payload.kind === 'post'
      ? (payload.caption || '').trim() || 'A growth moment on Grow!'
      : payload.kind === 'voice'
        ? payload.content.trim()
        : payload.kind === 'profile'
          ? payload.teachingHeadline || 'Unlock skills. Share your growth.'
          : payload.subtitle;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.94}>
      {({ close }) => {
        closeRef.current = close;
        return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={tw`px-5 pb-4`}
          bounces={false}
        >
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            {sheetKicker(payload.kind)}
          </Text>
          <Text style={tw`text-[26px] font-bold text-stone-900 mt-0.5 leading-8`}>
            {sheetTitle(payload.kind)}
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1.5 mb-4 leading-5`}>
            Drag the bar down to close · tap Share to Stories when it looks right.
          </Text>

          {/* Instagram 4:5 postcard — captured as JPEG */}
          <View {...cardPan.panHandlers}>
          <FadeInUp distance={16}>
          <View style={[tw`self-center`, CARD_SHADOW, { borderRadius: 28 }]}>
            <ViewShot
              ref={shotRef}
              style={{
                width: previewWidth,
                height: previewHeight,
                borderRadius: 28,
                overflow: 'hidden',
                backgroundColor: '#FFFcf7',
              }}
            >
              <View
                collapsable={false}
                style={{
                  flex: 1,
                  backgroundColor: accentWarm ? '#FFF8F6' : '#FFFcf7',
                }}
              >
                {/* Brand bar */}
                <View
                  style={{
                    paddingHorizontal: 18,
                    paddingTop: 16,
                    paddingBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: accentWarm ? '#FFF1F0' : '#ECFDF5',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <RNImage
                      source={require('../../../assets/icon.png')}
                      style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10 }}
                    />
                    <View>
                      <Text
                        style={{
                          fontSize: 13,
                          letterSpacing: 2.5,
                          textTransform: 'uppercase',
                          color: '#065F46',
                          fontWeight: '800',
                        }}
                      >
                        Grow!
                      </Text>
                      <Text style={{ fontSize: 10, color: '#A8A29E', marginTop: 1 }}>
                        letsgrow.lu
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: accentWarm ? '#FFE4E6' : '#D1FAE5',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: accentWarm ? '#E11D48' : '#065F46',
                      }}
                    >
                      {kindLabel}
                    </Text>
                  </View>
                </View>

                {/* Hero media / quote — explicit size so ViewShot can paint it */}
                {payload.kind === 'post' && showPostPhoto ? (
                  <View
                    collapsable={false}
                    style={{
                      height: heroH,
                      marginHorizontal: 14,
                      marginTop: 4,
                    }}
                  >
                    <RNImage
                      source={{ uri: postImage }}
                      style={{
                        width: previewWidth - 28,
                        height: heroH,
                        borderRadius: 18,
                        backgroundColor: '#E7E5E4',
                      }}
                      resizeMode="cover"
                      fadeDuration={0}
                      onLoad={() => {
                        loadedRef.current.hero = true;
                      }}
                      onError={() => {
                        loadedRef.current.hero = true;
                        setHeroFailed(true);
                      }}
                    />
                  </View>
                ) : payload.kind === 'post' ? (
                  <View
                    style={{
                      height: heroH,
                      marginHorizontal: 18,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        letterSpacing: 2,
                        color: '#065F46',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                    >
                      {videoHero ? 'Reel' : 'Post'}
                    </Text>
                    <Text
                      style={{
                        fontSize: 22,
                        lineHeight: 30,
                        fontWeight: '700',
                        color: '#1C1917',
                      }}
                      numberOfLines={7}
                    >
                      {captionText}
                    </Text>
                  </View>
                ) : payload.kind === 'voice' ? (
                  <View
                    style={{
                      flex: 1,
                      marginHorizontal: 18,
                      marginTop: 8,
                      justifyContent: 'center',
                      paddingLeft: 14,
                      borderLeftWidth: 3,
                      borderLeftColor: '#F97066',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        letterSpacing: 2,
                        color: '#E11D48',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                    >
                      Thought
                    </Text>
                    <Text
                      style={{
                        fontSize: 20,
                        lineHeight: 28,
                        fontWeight: '600',
                        color: '#1C1917',
                      }}
                      numberOfLines={8}
                    >
                      “
                      {captionText.length > 240
                        ? `${captionText.slice(0, 237).trim()}…`
                        : captionText}
                      ”
                    </Text>
                  </View>
                ) : payload.kind === 'milestone' ? (
                  <View
                    style={{
                      flex: 1,
                      marginHorizontal: 18,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        letterSpacing: 2,
                        color: '#E11D48',
                        textTransform: 'uppercase',
                        marginBottom: 8,
                      }}
                    >
                      Unlocked
                    </Text>
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: '800',
                        color: '#1C1917',
                        marginBottom: 8,
                      }}
                    >
                      {payload.title}
                    </Text>
                    <Text style={{ fontSize: 15, lineHeight: 22, color: '#57534E' }}>
                      {payload.subtitle}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      marginHorizontal: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RNImage
                      source={avatarSrc}
                      style={{
                        width: 132,
                        height: 132,
                        borderRadius: 66,
                        backgroundColor: '#E8E4DC',
                        borderWidth: 4,
                        borderColor: '#A7F3D0',
                      }}
                      resizeMode="cover"
                      fadeDuration={0}
                      onLoad={() => {
                        loadedRef.current.avatar = true;
                      }}
                      onError={() => {
                        loadedRef.current.avatar = true;
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: '800',
                        color: '#1C1917',
                        marginTop: 16,
                        textAlign: 'center',
                      }}
                      numberOfLines={1}
                    >
                      {username}
                    </Text>
                    {payload.kind === 'profile' && payload.isInstructor ? (
                      <View
                        style={{
                          marginTop: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: '#D1FAE5',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
                          Instructor
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      style={{
                        fontSize: 16,
                        lineHeight: 23,
                        color: '#44403C',
                        fontWeight: '500',
                        marginTop: 12,
                        textAlign: 'center',
                      }}
                      numberOfLines={4}
                    >
                      {captionText}
                    </Text>
                  </View>
                )}

                {/* Footer identity — profile already has a face-hero */}
                <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 }}>
                  {payload.kind !== 'profile' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <RNImage
                      source={avatarSrc}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        marginRight: 12,
                        backgroundColor: '#E8E4DC',
                        borderWidth: 2,
                        borderColor: accentWarm ? '#FECACA' : '#A7F3D0',
                      }}
                      resizeMode="cover"
                      fadeDuration={0}
                      onLoad={() => {
                        loadedRef.current.avatar = true;
                      }}
                      onError={() => {
                        loadedRef.current.avatar = true;
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 16, fontWeight: '800', color: '#1C1917' }}
                        numberOfLines={1}
                      >
                        {username}
                      </Text>
                      {payload.kind === 'post' ? (
                        <Text
                          style={{ fontSize: 13, color: '#57534E', marginTop: 2, lineHeight: 18 }}
                          numberOfLines={2}
                        >
                          {captionText}
                        </Text>
                      ) : payload.kind === 'voice' && payload.moodLabel ? (
                        <Text style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>
                          {payload.moodLabel}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  ) : null}

                  {pathLine ? (
                    <View
                      style={{
                        marginTop: 12,
                        alignSelf: 'flex-start',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: '#EAE4D6',
                      }}
                    >
                      <Text
                        style={{ fontSize: 11, fontWeight: '600', color: '#57534E' }}
                        numberOfLines={1}
                      >
                        {pathLine}
                      </Text>
                    </View>
                  ) : null}

                  {payload.kind === 'profile' &&
                  (typeof payload.points === 'number' ||
                    (typeof payload.endorsements === 'number' && payload.endorsements > 0)) ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {typeof payload.points === 'number' ? (
                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: '#EAE4D6',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#44403C' }}>
                            {payload.points} pts
                          </Text>
                        </View>
                      ) : null}
                      {typeof payload.endorsements === 'number' && payload.endorsements > 0 ? (
                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: '#ECFDF5',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#065F46' }}>
                            {payload.endorsements} endorsements
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </ViewShot>
          </View>
          </FadeInUp>
          </View>

          <PressableScale
            onPress={() => void shareImage()}
            disabled={capturing}
            pressedScale={0.97}
            style={tw`mt-5 py-4 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2 ${
              capturing ? 'opacity-70' : ''
            }`}
          >
            {capturing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="logo-instagram" size={20} color="#fff" />
            )}
            <Text style={tw`text-white font-bold text-[16px]`}>
              {capturing ? 'Preparing…' : 'Share to Stories'}
            </Text>
          </PressableScale>

          <View style={tw`mt-2.5 flex-row gap-2`}>
            <PressableScale
              onPress={() => void shareLink()}
              pressedScale={0.97}
              style={tw`flex-1 py-3.5 rounded-2xl bg-[#EAE4D6] border border-stone-200/80 items-center flex-row justify-center gap-2`}
            >
              <Ionicons name="share-outline" size={18} color="#1C1917" />
              <Text style={tw`text-stone-900 font-semibold`}>Link</Text>
            </PressableScale>
            <PressableScale
              onPress={() => void copyLink()}
              pressedScale={0.97}
              style={tw`flex-1 py-3.5 rounded-2xl bg-[#EAE4D6] border border-stone-200/80 items-center flex-row justify-center gap-2`}
            >
              <Ionicons name="link-outline" size={18} color="#1C1917" />
              <Text style={tw`text-stone-900 font-semibold`}>Copy</Text>
            </PressableScale>
          </View>

          <PressableScale onPress={close} style={tw`mt-2 py-3 items-center`}>
            <Text style={tw`text-stone-500 font-semibold`}>Not now</Text>
          </PressableScale>
        </ScrollView>
        );
      }}
    </AnimatedBottomSheet>
  );
}
