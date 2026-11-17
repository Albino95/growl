import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PrimaryButton from '../ui/PrimaryButton';
import FormTextInput from '../ui/FormTextInput';
import GrowAvatar from '../ui/GrowAvatar';
import { getCohort, joinCohort, previewCohortByCode, type Cohort, type CohortDetail } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';
import { haptic } from '../../theme/haptics';
import { codeFromText, membersLabel, personName, weekLabel } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialCode?: string | null;
  onJoined: (detail: CohortDetail) => void;
};

/** Member: type or paste a group code, see the group, join. */
export default function CohortJoinSheet({ visible, onClose, initialCode, onJoined }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Cohort | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setText(initialCode ?? '');
      setPreview(null);
      setProblem(null);
    }
  }, [visible, initialCode]);

  const code = codeFromText(text);

  useEffect(() => {
    if (!visible || !code) {
      setPreview(null);
      return;
    }
    let alive = true;
    setProblem(null);
    previewCohortByCode(code)
      .then((c) => alive && setPreview(c))
      .catch((e) => {
        if (!alive) return;
        setPreview(null);
        setProblem(e instanceof ApiError && e.status === 404 ? 'We couldn’t find a group with that code.' : 'Couldn’t check that code just now.');
      });
    return () => {
      alive = false;
    };
  }, [code, visible]);

  const alreadyIn = preview?.role === 'member' || preview?.role === 'coach';

  const join = async () => {
    if (!code || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const detail = alreadyIn && preview ? await getCohort(preview.id) : await joinCohort({ code });
      haptic('success');
      onJoined(detail);
    } catch (e) {
      setProblem(e instanceof ApiError && e.message ? e.message : 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} keyboardAware maxHeightRatio={0.8}>
      <View style={tw`px-gutter pt-1 pb-8`}>
        <Text style={tw`text-title font-bold text-ink`}>Join a group</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1`}>Your coach shares an 8-character code.</Text>
        <FormTextInput
          value={text}
          onChangeText={setText}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={60}
          placeholder="ABCD-1234"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Group code"
          style={tw`mt-4 bg-raised rounded-control px-3.5 py-3 text-title font-semibold text-ink tracking-widest text-center`}
        />

        {preview ? (
          <View style={tw`mt-4 bg-card border border-line rounded-card px-4 py-3.5`}>
            <Text style={tw`text-callout font-bold text-ink`}>{preview.title}</Text>
            <View style={tw`flex-row items-center mt-2`}>
              <GrowAvatar userId={preview.coach.id} username={preview.coach.username} uri={preview.coach.avatar_url} size={24} />
              <Text style={tw`ml-2 text-footnote text-ink-2`}>with {personName(preview.coach)}</Text>
            </View>
            <Text style={tw`text-footnote text-ink-3 mt-1.5`}>
              {weekLabel(preview)} · {membersLabel(preview)}
            </Text>
            {preview.description ? (
              <Text style={tw`text-footnote text-ink-2 mt-2 leading-5`} numberOfLines={4}>
                {preview.description}
              </Text>
            ) : null}
          </View>
        ) : null}

        {problem ? (
          <View style={tw`mt-3 flex-row items-center`}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.ink3} />
            <Text style={tw`ml-1.5 text-footnote text-ink-2 flex-1`}>{problem}</Text>
          </View>
        ) : null}

        <Text style={tw`text-footnote text-ink-3 mt-4 leading-5`}>
          Group members see your name and photo. Your homework and check-ins stay between you and the coach.
        </Text>
        <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>{COACHING_BILLING_NOTE}</Text>

        <PrimaryButton
          label={alreadyIn ? 'Open group' : 'Join group'}
          disabled={!code || (!!preview && preview.spots_left <= 0 && !alreadyIn)}
          loading={busy}
          onPress={() => void join()}
          style={tw`mt-4`}
        />
      </View>
    </AnimatedBottomSheet>
  );
}
