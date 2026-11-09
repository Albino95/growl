import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import {
  assignCoachingHomework,
  completeCoachingContract,
  getCoachingContract,
  submitCoachingReview,
  type CoachingAssignment,
  type CoachingContract,
  type ReviewEligibility,
} from '../../services/api/instructor';
import ReviewSheet from '../../components/instructor/ReviewSheet';
import { StarRow } from '../../components/instructor/StarRating';
import { useAuth } from '../../store/hooks';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { resolvePostMediaUri } from '../../utils/images';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';

type Route = RouteProp<{ CoachingContract: { contractId: string } }, 'CoachingContract'>;

export default function CoachingContractScreen() {
  const navigation = useNavigation();
  const { contractId } = useRoute<Route>().params;
  const { user } = useAuth();
  const [contract, setContract] = useState<CoachingContract | null>(null);
  const [assignments, setAssignments] = useState<CoachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewEligibility | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isCoach = contract?.instructor_id === user?.id;

  const load = useCallback(async () => {
    try {
      const res = await getCoachingContract(contractId);
      setContract(res.contract);
      setAssignments(res.assignments);
      setReview(res.review || null);
    } catch (e) {
      alertMessage('Plan', e instanceof Error ? e.message : 'Could not load this plan');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contractId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onAssign = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const path = (user?.categories || [])[0] || '';
      const [category_key, subcategory_key] = path.includes(':')
        ? path.split(':')
        : [path, 'practice'];
      await assignCoachingHomework(contractId, {
        title: title.trim() || undefined,
        goal_detail: detail.trim() || undefined,
        category_key: category_key || undefined,
        subcategory_key: subcategory_key || undefined,
      });
      feedback.send();
      setAssignOpen(false);
      setTitle('');
      setDetail('');
      await load();
    } catch (e) {
      alertMessage('Homework', e instanceof Error ? e.message : 'Could not assign');
    } finally {
      setBusy(false);
    }
  };

  const onSubmitReview = async (input: {
    stars: number;
    follow_through?: number;
    body?: string;
  }) => {
    if (!contract || busy) return;
    setBusy(true);
    try {
      await submitCoachingReview({
        peer_id: isCoach ? contract.client_id : contract.instructor_id,
        contract_id: contract.id,
        ...input,
      });
      feedback.success();
      setReviewOpen(false);
      await load();
    } catch (e) {
      alertMessage('Review', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (busy || !contract) return;
    setBusy(true);
    try {
      const next = await completeCoachingContract(contract.id);
      setContract(next);
      feedback.open();
    } catch (e) {
      alertMessage('Plan', e instanceof Error ? e.message : 'Could not complete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </PressableScale>
        }
      />

      {loading && !contract ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : contract ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING, paddingHorizontal: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#059669"
            />
          }
        >
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-3`}>
            Coaching plan
          </Text>
          <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>
            {isCoach ? contract.client?.username : contract.instructor?.username}
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1`}>
            {contract.status === 'active' ? 'Plan active · billing coming' : contract.status}
          </Text>

          <View style={tw`mt-4 px-4 py-3.5 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}>
            <Text style={tw`text-[16px] font-bold text-stone-900`}>
              {contract.weeks} week{contract.weeks === 1 ? '' : 's'} · {contract.sessions_per_week}× /
              week · €{contract.weekly_fee_eur}/week
            </Text>
            <Text style={tw`text-sm text-stone-600 mt-1`}>
              €{contract.total_eur} total
              {contract.trial_days ? ` · ${contract.trial_days}-day trial` : ''}
            </Text>
          </View>

          <View style={tw`flex-row gap-2 mt-3`}>
            {isCoach && contract.status === 'active' ? (
              <PressableScale
                onPress={() => setAssignOpen(true)}
                style={tw`flex-1 py-3 rounded-2xl bg-emerald-600 items-center`}
              >
                <Text style={tw`text-white font-bold`}>Assign homework</Text>
              </PressableScale>
            ) : null}
            {contract.status === 'active' ? (
              <PressableScale
                onPress={() => void onComplete()}
                style={tw`flex-1 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center`}
              >
                <Text style={tw`text-stone-800 font-bold`}>Mark complete</Text>
              </PressableScale>
            ) : null}
          </View>

          <View style={tw`mt-3 px-4 py-3.5 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              {isCoach ? 'Rate this client' : 'Review this coach'}
            </Text>
            {review?.eligible ? (
              <>
                {review.mine ? (
                  <View style={tw`flex-row items-center mt-2`}>
                    <StarRow value={review.mine.stars} />
                    <Text style={tw`text-xs text-stone-500 ml-2`}>Your review</Text>
                  </View>
                ) : (
                  <Text style={tw`text-sm text-stone-600 mt-1.5`}>
                    {review.weeks_completed} weeks completed. You can write a review.
                  </Text>
                )}
                <PressableScale
                  onPress={() => setReviewOpen(true)}
                  style={tw`mt-2.5 py-2.5 rounded-xl bg-emerald-600 items-center`}
                >
                  <Text style={tw`text-white font-bold text-sm`}>
                    {review.mine ? 'Update review' : isCoach ? 'Rate follow-through' : 'Write a review'}
                  </Text>
                </PressableScale>
              </>
            ) : (
              <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
                Reviews open after {review?.weeks_needed || 4} completed weeks together.
                {review ? ` You have ${review.weeks_completed}.` : ''}
              </Text>
            )}
          </View>

          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-6 mb-2`}>
            Homework trace
          </Text>
          {assignments.length === 0 ? (
            <Text style={tw`text-sm text-stone-500 leading-5`}>
              {isCoach
                ? 'Plant a seed for this client. They check in with a photo — that is the proof.'
                : 'Your coach will plant homework here. Check in with a photo when you finish.'}
            </Text>
          ) : (
            assignments.map((item) => (
              <PressableScale
                key={item.id}
                onPress={() => navigateFromRoot(navigation, 'SeedDetail', { seedId: item.seed_id })}
                style={tw`mb-2.5 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}
              >
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`font-bold text-stone-900 flex-1`} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View
                    style={tw`ml-2 px-2 py-0.5 rounded-full ${
                      item.status === 'done' ? 'bg-emerald-50' : 'bg-[#EAE4D6]'
                    }`}
                  >
                    <Text
                      style={tw`text-[11px] font-semibold ${
                        item.status === 'done' ? 'text-emerald-800' : 'text-stone-600'
                      }`}
                    >
                      {item.status === 'done' ? 'Done' : 'Assigned'}
                    </Text>
                  </View>
                </View>
                <Text style={tw`text-xs text-stone-500 mt-1`}>
                  {item.seed.stage || 'seed'}
                  {item.seed.category_key
                    ? ` · ${getCategoryLabel(item.seed.category_key)}`
                    : ''}
                  {item.last_action ? ` · ${item.last_action.replace('_', ' ')}` : ''}
                </Text>
                {item.last_photo ? (
                  <Image
                    source={{ uri: resolvePostMediaUri(item.last_photo, item.seed.category_key, item.seed_id) }}
                    style={tw`w-full h-28 rounded-xl mt-2 bg-[#EAE4D6]`}
                    contentFit="cover"
                  />
                ) : null}
              </PressableScale>
            ))
          )}
        </ScrollView>
      ) : null}

      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <KeyboardAvoidingView
          style={tw`flex-1 justify-end bg-black/40`}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-4 pb-8`}>
            <Text style={tw`text-lg font-bold text-stone-900 mb-1`}>Assign homework</Text>
            <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
              Plants a Garden seed they can water with a photo. Proof does not move money.
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="This week’s practice"
              placeholderTextColor="#A8A29E"
              style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 mb-2`}
            />
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="What good looks like"
              placeholderTextColor="#A8A29E"
              multiline
              style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 min-h-[72px] mb-4`}
            />
            <PressableScale
              onPress={() => void onAssign()}
              disabled={busy}
              style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center ${busy ? 'opacity-60' : ''}`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={tw`text-white font-bold`}>Plant homework</Text>
              )}
            </PressableScale>
            <PressableScale onPress={() => setAssignOpen(false)} style={tw`py-3 items-center mt-1`}>
              <Text style={tw`text-stone-500 font-semibold`}>Cancel</Text>
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ReviewSheet
        visible={reviewOpen}
        eligibility={review}
        peerName={
          isCoach
            ? contract?.client?.username || 'Client'
            : contract?.instructor?.username || 'Coach'
        }
        busy={busy}
        onClose={() => setReviewOpen(false)}
        onSubmit={(input) => void onSubmitReview(input)}
      />
    </SafeAreaView>
  );
}
