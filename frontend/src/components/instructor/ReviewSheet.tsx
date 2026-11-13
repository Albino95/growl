import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { StarPicker } from './StarRating';
import type { ReviewEligibility } from '../../services/api/instructor';

export default function ReviewSheet({
  visible,
  eligibility,
  peerName,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  eligibility: ReviewEligibility | null;
  peerName: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { stars: number; follow_through?: number; body?: string }) => void;
}) {
  const isCoach = eligibility?.direction === 'instructor_to_client';
  const [stars, setStars] = useState(eligibility?.mine?.stars || 5);
  const [follow, setFollow] = useState(eligibility?.mine?.follow_through || 5);
  const [body, setBody] = useState(eligibility?.mine?.body || '');

  // The sheet stays mounted while closed; re-seed from the saved review each time it opens.
  const seedStars = eligibility?.mine?.stars || 5;
  const seedFollow = eligibility?.mine?.follow_through || 5;
  const seedBody = eligibility?.mine?.body || '';
  useEffect(() => {
    if (!visible) return;
    setStars(seedStars);
    setFollow(seedFollow);
    setBody(seedBody);
  }, [visible, seedStars, seedFollow, seedBody]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={tw`flex-1 justify-end bg-black/40`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-4 pb-8`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>
              {isCoach ? `Rate ${peerName}` : `Review ${peerName}`}
            </Text>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center`}
            >
              <Ionicons name="close" size={18} color="#1C1917" />
            </PressableScale>
          </View>
          <Text style={tw`text-sm text-stone-500 mb-4 leading-5`}>
            {isCoach
              ? 'How well did they follow your advice? Only after 4 completed weeks together.'
              : 'Reviews open after 4 completed weeks together. Be specific and kind.'}
          </Text>
          <StarPicker
            label={isCoach ? 'Overall' : 'Your review'}
            value={stars}
            onChange={setStars}
          />
          {isCoach ? (
            <StarPicker label="Followed the work" value={follow} onChange={setFollow} />
          ) : null}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={isCoach ? 'What they did well — or what to keep practicing' : 'What changed for you'}
            placeholderTextColor="#6B645E"
            multiline
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 min-h-[88px] mb-4`}
          />
          <PressableScale
            onPress={() =>
              onSubmit({
                stars,
                follow_through: isCoach ? follow : undefined,
                body: body.trim() || undefined,
              })
            }
            disabled={busy}
            style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center ${busy ? 'opacity-60' : ''}`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={tw`text-white font-bold`}>
                {eligibility?.mine ? 'Update review' : 'Save review'}
              </Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
