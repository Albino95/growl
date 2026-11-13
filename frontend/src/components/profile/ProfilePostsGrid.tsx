import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import EmptyState from '../ui/EmptyState';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { gridTileImageUri } from '../../utils/reelCover';

export type ProfileGridPost = {
  id: string;
  image: string;
  caption?: string;
  category?: string;
  subcategory?: string;
  likes?: number;
  isReel?: boolean;
  /** Main media is a video file — never hand it to expo-image. */
  isVideo?: boolean;
  /** Poster image for reels/videos (metadata.cover_url), resolved. */
  cover?: string;
};

/** Branded stand-in for reels with no poster (older reels): dark tile, play mark, caption. */
function ReelFallbackTile({ caption }: { caption?: string }) {
  const text = (caption || '').trim();
  return (
    <View style={tw`w-full h-full bg-[#1F2A24] items-center justify-center px-2`}>
      <View style={tw`w-9 h-9 rounded-full bg-white/15 items-center justify-center`}>
        <Ionicons name="play" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
      </View>
      {text ? (
        <Text style={tw`text-[11px] leading-[14px] text-white/80 text-center mt-2`} numberOfLines={2}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function TileMedia({ post }: { post: ProfileGridPost }) {
  const uri = gridTileImageUri(post);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const videoLike = post.isReel || post.isVideo;
  if (!uri || failed) {
    return videoLike ? <ReelFallbackTile caption={post.caption} /> : null;
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      transition={180}
      recyclingKey={post.id}
      onError={() => setFailed(true)}
    />
  );
}

type Props = {
  posts: ProfileGridPost[];
  onPress: (post: ProfileGridPost) => void;
  emptyTitle?: string;
  emptyDescription?: string;
};

const GAP = 3;
const H_PAD = 16;

export default function ProfilePostsGrid({
  posts,
  onPress,
  emptyTitle = 'No posts yet',
  emptyDescription = 'Posts from this growth path will land here.',
}: Props) {
  const { width } = useWindowDimensions();
  const tile = useMemo(() => {
    const inner = Math.max(240, width - H_PAD * 2);
    return Math.floor((inner - GAP * 2) / 3);
  }, [width]);

  if (posts.length === 0) {
    return (
      <View style={tw`px-4 py-6`}>
        <EmptyState icon="images-outline" title={emptyTitle} description={emptyDescription} />
      </View>
    );
  }

  return (
    <View style={tw`px-4 pt-3 pb-2`}>
      <View style={tw`flex-row items-end justify-between mb-3`}>
        <View>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
            Posts
          </Text>
          <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>
            {posts.length} {posts.length === 1 ? 'piece' : 'pieces'}
          </Text>
        </View>
      </View>

      <View style={tw`flex-row flex-wrap`}>
        {posts.map((post, index) => {
          const col = index % 3;
          const path = post.subcategory
            ? `${post.category}:${post.subcategory}`
            : post.category || '';
          const label = path ? getCategoryLabel(path) : '';
          return (
            <TouchableOpacity
              key={post.id}
              onPress={() => onPress(post)}
              activeOpacity={0.88}
              style={{
                width: tile,
                height: tile,
                marginRight: col === 2 ? 0 : GAP,
                marginBottom: GAP,
                borderRadius: 10,
                overflow: 'hidden',
                backgroundColor: '#EAE4D6',
              }}
            >
              <TileMedia post={post} />
              <View
                style={tw`absolute inset-0`}
                pointerEvents="none"
              >
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 48,
                    backgroundColor: 'rgba(28,25,23,0.28)',
                  }}
                />
                {post.isReel ? (
                  <View style={tw`absolute top-1.5 right-1.5 bg-black/55 rounded-full p-1`}>
                    <Ionicons name="play" size={11} color="#FFFFFF" />
                  </View>
                ) : null}
                {label ? (
                  <View style={tw`absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-[#FFFcf7]/92`}>
                    <Text maxFontSizeMultiplier={1.3} style={tw`text-[11px] font-bold text-emerald-800`} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                ) : null}
                {typeof post.likes === 'number' && post.likes > 0 ? (
                  <View style={tw`absolute right-1.5 bottom-1.5 flex-row items-center`}>
                    <Ionicons name="heart" size={10} color="#FFFFFF" />
                    <Text style={tw`text-[11px] font-bold text-white ml-0.5`}>{post.likes}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
