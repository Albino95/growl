import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import GrowImage from '../ui/GrowImage';
import { createCohortPost, type CohortPost } from '../../services/api/cohorts';
import { uploadMediaFile } from '../../services/api/media';
import { ApiError } from '../../services/api/http';
import { alertMessage } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';
import { COHORT_LIMITS } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  cohortId: string;
  memberCount: number;
  onPosted: (post: CohortPost) => void;
};

/** Coach: one update to the whole group (text + optional photo). Members get one in-app notification. */
export default function CohortPostComposer({ visible, onClose, cohortId, memberCount, onPosted }: Props) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setText('');
      setPhoto(null);
    }
  }, [visible]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      void alertMessage('Photos needed', 'Allow photo access to add a picture to your update.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setPhoto(res.assets[0].uri);
      haptic('selection');
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      let mediaUrl: string | null = null;
      if (photo) mediaUrl = (await uploadMediaFile(photo, 'post')).url;
      const post = await createCohortPost(cohortId, body, mediaUrl);
      haptic('success');
      onPosted(post);
    } catch (e) {
      void alertMessage('Couldn’t post that', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} keyboardAware maxHeightRatio={0.85}>
      <View style={tw`px-gutter pt-1 pb-6`}>
        <Text style={tw`text-title font-bold text-ink`}>Update the group</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1`}>
          {memberCount === 1 ? '1 member' : `${memberCount} members`} will see this. They can ❤️ and reply.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          maxLength={COHORT_LIMITS.post}
          placeholder="This week we focus on…"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Update text"
          style={tw`mt-3 bg-raised rounded-control px-3.5 py-3 text-body text-ink min-h-28 max-h-60`}
        />
        {photo ? (
          <View style={tw`mt-3`}>
            <GrowImage source={{ uri: photo }} style={tw`w-full h-44 rounded-card`} contentFit="cover" />
            <PressableScale
              onPress={() => setPhoto(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              style={tw`absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 items-center justify-center`}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </PressableScale>
          </View>
        ) : null}
        <View style={tw`flex-row items-center mt-3`}>
          <PressableScale
            feedback={false}
            onPress={() => void pick()}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            style={tw`flex-row items-center px-3 py-2 rounded-control bg-raised`}
          >
            <Ionicons name="image-outline" size={18} color={theme.colors.ink} />
            <Text style={tw`ml-1.5 text-footnote font-semibold text-ink`}>{photo ? 'Change photo' : 'Photo'}</Text>
          </PressableScale>
          <View style={tw`flex-1`} />
          <Text style={tw`text-caption text-ink-3`}>
            {text.length}/{COHORT_LIMITS.post}
          </Text>
        </View>
        <PrimaryButton
          label="Post to group"
          disabled={!text.trim()}
          loading={busy}
          onPress={() => void send()}
          style={tw`mt-4`}
        />
      </View>
    </AnimatedBottomSheet>
  );
}
