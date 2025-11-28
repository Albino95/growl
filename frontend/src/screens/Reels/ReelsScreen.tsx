import React, { useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Reel = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  videoUrl?: string; // In real app, this would be a video URL
  thumbnail: string;
  caption: string;
  category: string;
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  timestamp: string;
  isInstructor: boolean;
};

const MOCK_REELS: Reel[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'Sarah Johnson',
    avatar: '👩',
    thumbnail: '🏋️',
    caption: 'Quick 10-minute morning workout routine! #fitness #workout',
    category: 'fitness',
    likes: 1250,
    comments: 89,
    shares: 45,
    isLiked: false,
    timestamp: '2h ago',
    isInstructor: true,
  },
  {
    id: '2',
    userId: 'u2',
    username: 'Mike Chen',
    avatar: '👨',
    thumbnail: '🎹',
    caption: 'Piano practice session - learning a new piece 🎵',
    category: 'art',
    likes: 890,
    comments: 56,
    shares: 23,
    isLiked: true,
    timestamp: '5h ago',
    isInstructor: true,
  },
  {
    id: '3',
    userId: 'u3',
    username: 'Emma Davis',
    avatar: '👧',
    thumbnail: '🧘',
    caption: 'Meditation tips for beginners ✨ #mindfulness',
    category: 'mindset',
    likes: 2100,
    comments: 145,
    shares: 78,
    isLiked: false,
    timestamp: '1d ago',
    isInstructor: false,
  },
];

export default function ReelsScreen() {
  const { user } = useAuthStore();
  const [reels] = useState<Reel[]>(MOCK_REELS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const toggleLike = (reelId: string) => {
    // In real app, this would update via API
    console.log('Toggle like:', reelId);
  };

  const renderReel = ({ item, index }: { item: Reel; index: number }) => {
    const isActive = index === currentIndex;

    return (
      <View style={[tw`bg-black`, { height: SCREEN_HEIGHT }]}>
        {/* Video/Thumbnail Area */}
        <View style={tw`flex-1 items-center justify-center`}>
          <View style={tw`w-full h-full items-center justify-center bg-gray-900`}>
            <Text style={tw`text-8xl`}>{item.thumbnail}</Text>
            {/* In real app, this would be a Video component */}
          </View>
        </View>

        {/* Overlay Content */}
        <View style={tw`absolute bottom-0 left-0 right-0 p-4`}>
          {/* User Info */}
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3`}>
              <Text style={tw`text-xl`}>{item.avatar}</Text>
            </View>
            <View style={tw`flex-1`}>
              <View style={tw`flex-row items-center`}>
                <Text style={tw`text-white font-semibold`}>{item.username}</Text>
                {item.isInstructor && (
                  <View style={tw`ml-2 px-2 py-0.5 bg-purple-500 rounded-full`}>
                    <Text style={tw`text-xs font-semibold text-white`}>Instructor</Text>
                  </View>
                )}
              </View>
              <Text style={tw`text-white text-sm opacity-80`}>{item.timestamp}</Text>
            </View>
            <TouchableOpacity>
              <Ionicons name="ellipsis-vertical" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Caption */}
          <Text style={tw`text-white mb-4`} numberOfLines={2}>
            {item.caption}
          </Text>

          {/* Actions */}
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center gap-6`}>
              <TouchableOpacity onPress={() => toggleLike(item.id)} style={tw`items-center`}>
                <Ionicons
                  name={item.isLiked ? 'heart' : 'heart-outline'}
                  size={32}
                  color={item.isLiked ? '#EF4444' : '#FFFFFF'}
                />
                <Text style={tw`text-white text-xs mt-1`}>{item.likes > 0 ? formatNumber(item.likes) : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tw`items-center`}>
                <Ionicons name="chatbubble-outline" size={32} color="#FFFFFF" />
                <Text style={tw`text-white text-xs mt-1`}>{item.comments > 0 ? formatNumber(item.comments) : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tw`items-center`}>
                <Ionicons name="paper-plane-outline" size={32} color="#FFFFFF" />
                <Text style={tw`text-white text-xs mt-1`}>{item.shares > 0 ? formatNumber(item.shares) : ''}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity>
              <Ionicons name="bookmark-outline" size={32} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Right Side Actions */}
        <View style={tw`absolute right-4 bottom-32 items-center gap-6`}>
          <TouchableOpacity
            onPress={() => toggleLike(item.id)}
            style={tw`items-center`}
          >
            <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center mb-2`}>
              <Ionicons
                name={item.isLiked ? 'heart' : 'heart-outline'}
                size={24}
                color={item.isLiked ? '#EF4444' : '#FFFFFF'}
              />
            </View>
            <Text style={tw`text-white text-xs font-semibold`}>
              {item.likes > 0 ? formatNumber(item.likes) : 'Like'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`items-center`}>
            <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center mb-2`}>
              <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
            </View>
            <Text style={tw`text-white text-xs font-semibold`}>
              {item.comments > 0 ? formatNumber(item.comments) : 'Comment'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`items-center`}>
            <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center mb-2`}>
              <Ionicons name="paper-plane-outline" size={24} color="#FFFFFF" />
            </View>
            <Text style={tw`text-white text-xs font-semibold`}>
              {item.shares > 0 ? formatNumber(item.shares) : 'Share'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`items-center`}>
            <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center`}>
              <Ionicons name="bookmark-outline" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  return (
    <SafeAreaView style={tw`flex-1 bg-black`} edges={[]}>
      <FlatList
        ref={flatListRef}
        data={reels}
        renderItem={renderReel}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(data, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />
    </SafeAreaView>
  );
}

