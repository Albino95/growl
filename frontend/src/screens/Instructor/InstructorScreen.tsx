import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import {
  claimInstructor,
  getInstructorEligibility,
  getInstructorHub,
  getMyOffering,
  listCoachingContracts,
  listCoachingInquiries,
  requestEndorsement,
  respondToPartnershipRequest,
  suggestEndorsers,
  updateInstructorPartnership,
  updateMyOffering,
  type CoachingContract,
  type CoachingInquiry,
  type EndorsementSuggestion,
  type InstructorEligibility,
  type InstructorEndorser,
  type InstructorHub,
  type InstructorOffering,
  type InstructorPartnership,
  type InstructorPartnershipRequest,
} from '../../services/api/instructor';
import { createConversation } from '../../services/api/messages';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { feedback } from '../../utils/interactionFeedback';
import PressableScale from '../../components/ui/PressableScale';
import tw from '../../lib/tw';
import { formatCurrency, parseLocaleNumber } from '../../utils/money';
import { COACHING_ACTIVE_STATUS, COACHING_LIMITS } from '../../constants/coaching';

type HubTab = 'overview' | 'students' | 'community' | 'partnerships';

function formatMoney(n: number, currency?: string | null) {
  return formatCurrency(Number(n || 0), currency || 'EUR');
}

type OfferDraft = {
  weekly: string;
  sessions: string;
  weeks: string;
  trial: string;
  accepting: boolean;
};

/** Validate the offer form; returns the parsed values or a user-facing error. */
function parseOfferDraft(
  d: OfferDraft
):
  | { ok: true; value: { weekly_fee_eur: number; sessions_per_week: number; typical_weeks: number; trial_days: number } }
  | { ok: false; error: string } {
  const L = COACHING_LIMITS;
  const weekly = parseLocaleNumber(d.weekly);
  if (weekly == null || weekly < L.weeklyFee.min || weekly > L.weeklyFee.max) {
    return { ok: false, error: `Weekly fee must be between €${L.weeklyFee.min} and €${L.weeklyFee.max}.` };
  }
  const whole = (raw: string, lo: number, hi: number) => {
    const n = parseLocaleNumber(raw);
    return n != null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  const sessions = whole(d.sessions, L.sessionsPerWeek.min, L.sessionsPerWeek.max);
  if (sessions == null) {
    return {
      ok: false,
      error: `Times / week must be a whole number from ${L.sessionsPerWeek.min} to ${L.sessionsPerWeek.max}.`,
    };
  }
  const weeks = whole(d.weeks, L.weeks.min, L.weeks.max);
  if (weeks == null) {
    return { ok: false, error: `Weeks must be a whole number from ${L.weeks.min} to ${L.weeks.max}.` };
  }
  const trial = whole(d.trial, L.trialDays.min, L.trialDays.max);
  if (trial == null) {
    return {
      ok: false,
      error: `Trial days must be a whole number from ${L.trialDays.min} to ${L.trialDays.max}.`,
    };
  }
  return {
    ok: true,
    value: {
      weekly_fee_eur: Math.round(weekly * 100) / 100,
      sessions_per_week: sessions,
      typical_weeks: weeks,
      trial_days: trial,
    },
  };
}

function AvatarBubble({
  avatar,
  name,
  size = 40,
}: {
  avatar?: string | null;
  name: string;
  size?: number;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (avatar && (avatar.startsWith('http') || avatar.startsWith('data:'))) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        tw`bg-[#EAE4D6] items-center justify-center border border-stone-200/80`,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {avatar && avatar.length <= 4 ? (
        <Text style={{ fontSize: size * 0.45 }}>{avatar}</Text>
      ) : (
        <Text style={tw`font-bold text-stone-700`}>{initial}</Text>
      )}
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={tw`flex-1 py-3`}>
      <Text style={tw`text-xl font-bold text-stone-900`}>{value}</Text>
      <Text style={tw`text-[11px] text-stone-500 mt-0.5 uppercase tracking-wide`}>{label}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={tw`py-10 px-4 items-center`}>
      <View style={tw`w-12 h-12 rounded-full bg-[#EAE4D6] items-center justify-center mb-3`}>
        <Ionicons name={icon} size={22} color="#57534E" />
      </View>
      <Text style={tw`text-base font-semibold text-stone-900 text-center`}>{title}</Text>
      <Text style={tw`text-sm text-stone-500 text-center mt-1 leading-5`}>{description}</Text>
    </View>
  );
}

function OfferField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={tw`flex-1`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-1`}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={tw`bg-[#F3EEE4] border border-stone-200/80 rounded-xl px-3 py-2 text-[15px] text-stone-900`}
      />
    </View>
  );
}

function partnershipTerms(p: {
  partnership_type: string;
  commission_rate: number | null;
  fixed_fee: number | null;
}) {
  if (p.partnership_type === 'commission') {
    return `${p.commission_rate ?? 0}% commission`;
  }
  if (p.partnership_type === 'fixed') {
    return `${formatMoney(p.fixed_fee ?? 0)} fixed fee`;
  }
  return `${p.commission_rate ?? 0}% + ${formatMoney(p.fixed_fee ?? 0)}`;
}

export default function InstructorScreen({ navigation }: any) {
  const { user, updateUser, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [eligibility, setEligibility] = useState<InstructorEligibility | null>(null);
  const [hub, setHub] = useState<InstructorHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EndorsementSuggestion[]>([]);
  const [justClaimed, setJustClaimed] = useState(false);
  const [offering, setOffering] = useState<InstructorOffering | null>(null);
  const [completedPlans, setCompletedPlans] = useState(0);
  const [inquiries, setInquiries] = useState<CoachingInquiry[]>([]);
  const [contracts, setContracts] = useState<CoachingContract[]>([]);
  const [offerDraft, setOfferDraftState] = useState<OfferDraft>({
    weekly: '10',
    sessions: '3',
    weeks: '2',
    trial: '0',
    accepting: true,
  });
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [acceptingBusy, setAcceptingBusy] = useState(false);
  // True while the offer form has edits that aren't saved yet, so a focus reload won't clobber them.
  const offerDirtyRef = useRef(false);
  const setOfferDraft = useCallback((update: (d: OfferDraft) => OfferDraft) => {
    offerDirtyRef.current = true;
    setOfferError(null);
    setOfferDraftState(update);
  }, []);

  const loadEligibility = useCallback(async () => {
    try {
      const [elig, sug] = await Promise.all([
        getInstructorEligibility(),
        suggestEndorsers().catch(() => [] as EndorsementSuggestion[]),
      ]);
      setEligibility(elig);
      setSuggestions(sug);
    } catch {
      setEligibility(null);
      setSuggestions([]);
    }
  }, []);

  const loadHub = useCallback(async () => {
    try {
      const [data, mine, inquiryRows, contractRows] = await Promise.all([
        getInstructorHub(),
        getMyOffering().catch(() => null),
        listCoachingInquiries().catch(() => [] as CoachingInquiry[]),
        listCoachingContracts().catch(() => [] as CoachingContract[]),
      ]);
      setHub(data);
      if (mine) {
        setOffering(mine.offering);
        setCompletedPlans(mine.completed_plans);
        if (!offerDirtyRef.current) {
          setOfferDraftState({
            weekly: String(mine.offering.weekly_fee_eur),
            sessions: String(mine.offering.sessions_per_week),
            weeks: String(mine.offering.typical_weeks),
            trial: String(mine.offering.trial_days),
            accepting: mine.offering.accepting,
          });
        } else {
          // Accepting is saved immediately, so always mirror the server value.
          setOfferDraftState((d) => ({ ...d, accepting: mine.offering.accepting }));
        }
      }
      setInquiries(inquiryRows.filter((i) => i.role === 'instructor' && i.status !== 'closed'));
      setContracts(contractRows.filter((c) => c.role === 'instructor'));
    } catch {
      setHub(null);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!user?.isInstructor) {
      setLoading(true);
      await loadEligibility();
      setLoading(false);
      return;
    }
    setLoading(true);
    await loadHub();
    setLoading(false);
  }, [user?.isInstructor, loadEligibility, loadHub]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (user?.isInstructor) await loadHub();
    else await loadEligibility();
    setRefreshing(false);
  };

  const onClaim = async () => {
    if (!eligibility?.canClaim || claimBusy) return;
    const ok = await confirmAsync(
      'Become an instructor?',
      'You have enough peer endorsements and posts. Claiming unlocks the Instructor Hub.',
      { confirmLabel: 'Claim instructor' }
    );
    if (!ok) return;
    setClaimBusy(true);
    try {
      const result = await claimInstructor();
      feedback.success();
      updateUser({ isInstructor: true });
      await refreshProfile();
      setEligibility(result);
      setJustClaimed(true);
      await loadHub();
      setActiveTab('overview');
    } catch (e) {
      feedback.error();
      alertMessage('Could not claim', e instanceof Error ? e.message : 'Try again');
    } finally {
      setClaimBusy(false);
    }
  };

  const askEndorsement = async (person: EndorsementSuggestion) => {
    setBusyId(person.id);
    try {
      await requestEndorsement(
        person.id,
        `Would you endorse me on Grow!? We share a path and it unlocks coaching for peers.`
      );
      feedback.send();
      alertMessage(
        'Request sent',
        `${person.username} will see it under Notifications and can endorse you with one tap.`
      );
      setSuggestions((prev) => prev.filter((p) => p.id !== person.id));
    } catch (e) {
      // Fall back to a friendly DM if the structured request fails (e.g. not friends-only path).
      try {
        const res = await createConversation(person.id);
        const path =
          person.shared_categories[0] != null
            ? getCategoryLabel(person.shared_categories[0])
            : 'our shared growth path';
        navigateFromRoot(navigation, 'Messages', {
          conversationId: res.data.conversation.id,
          targetUserId: person.id,
          draftText: `Hey ${person.username} — would you endorse me on Grow! for ${path}? It unlocks the Instructor Hub so I can coach peers on that path.`,
        });
      } catch {
        alertMessage('Could not ask', e instanceof Error ? e.message : 'Try again');
      }
    } finally {
      setBusyId(null);
    }
  };

  const promotePartnership = (p: InstructorPartnership) => {
    feedback.open();
    const path = (user?.categories || [])[0];
    navigateFromRoot(navigation, 'Post', {
      category: typeof path === 'string' ? path : undefined,
      caption: `Partnered with ${p.business_name} — gear that supports the work. #grow`,
      promoteBusinessId: p.business_id,
      promoteBusinessName: p.business_name,
    });
  };

  const openProfile = (userId: string) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId });
  };

  const openMessages = (targetUserId?: string) => {
    navigateFromRoot(navigation, 'Messages', targetUserId ? { targetUserId } : undefined);
  };

  const saveOffering = async () => {
    if (offerBusy) return;
    const parsed = parseOfferDraft(offerDraft);
    if (!parsed.ok) {
      setOfferError(parsed.error);
      feedback.error();
      return;
    }
    setOfferBusy(true);
    try {
      const next = await updateMyOffering({ ...parsed.value, accepting: offerDraft.accepting });
      setOffering(next);
      offerDirtyRef.current = false;
      setOfferError(null);
      feedback.success();
    } catch (e) {
      alertMessage('Offer', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setOfferBusy(false);
    }
  };

  /** Accepting on/off saves right away (optimistic), using the last saved offer values. */
  const toggleAccepting = async () => {
    if (acceptingBusy) return;
    // Use the last saved offer; if none loaded yet, fall back to a valid draft.
    let base: Omit<InstructorOffering, 'accepting' | 'currency'> | null = offering;
    if (!base) {
      const parsed = parseOfferDraft(offerDraft);
      if (!parsed.ok) {
        setOfferError(parsed.error);
        return;
      }
      base = parsed.value;
    }
    const prev = offerDraft.accepting;
    const nextAccepting = !prev;
    setOfferDraftState((d) => ({ ...d, accepting: nextAccepting }));
    setOffering((o) => (o ? { ...o, accepting: nextAccepting } : o));
    setAcceptingBusy(true);
    try {
      const next = await updateMyOffering({
        weekly_fee_eur: base.weekly_fee_eur,
        sessions_per_week: base.sessions_per_week,
        typical_weeks: base.typical_weeks,
        trial_days: base.trial_days,
        accepting: nextAccepting,
      });
      setOffering(next);
      feedback.select();
    } catch (e) {
      setOfferDraftState((d) => ({ ...d, accepting: prev }));
      setOffering((o) => (o ? { ...o, accepting: prev } : o));
      alertMessage('Offer', e instanceof Error ? e.message : 'Could not update');
    } finally {
      setAcceptingBusy(false);
    }
  };

  const messageEndorser = async (person: InstructorEndorser) => {
    if (!person.is_friend) {
      openProfile(person.id);
      return;
    }
    setBusyId(person.id);
    try {
      const res = await createConversation(person.id);
      navigateFromRoot(navigation, 'Messages', {
        conversationId: res.data.conversation.id,
        targetUserId: person.id,
      });
    } catch (e) {
      alertMessage('Could not open chat', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const onRespondRequest = async (
    req: InstructorPartnershipRequest,
    status: 'approved' | 'declined'
  ) => {
    const label = status === 'approved' ? 'Accept' : 'Decline';
    const ok = await confirmAsync(
      `${label} partnership?`,
      `${req.business_name} offered ${partnershipTerms(req)}.`,
      { confirmLabel: label, destructive: status === 'declined' }
    );
    if (!ok) return;
    setBusyId(req.id);
    try {
      await respondToPartnershipRequest(req.id, status);
      await loadHub();
    } catch (e) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update request');
    } finally {
      setBusyId(null);
    }
  };

  const onUpdatePartnership = async (
    p: InstructorPartnership,
    status: 'active' | 'paused' | 'ended'
  ) => {
    const labels = { active: 'reactivate', paused: 'pause', ended: 'end' } as const;
    const ok = await confirmAsync(
      'Update partnership',
      `Are you sure you want to ${labels[status]} your partnership with ${p.business_name}?`,
      { confirmLabel: labels[status], destructive: status === 'ended' }
    );
    if (!ok) return;
    setBusyId(p.id);
    try {
      await updateInstructorPartnership(p.id, status);
      await loadHub();
    } catch (e) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update partnership');
    } finally {
      setBusyId(null);
    }
  };

  const goBackOrProfile = () => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Profile');
  };

  if (!user?.isInstructor) {
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
        <GrowChromeHeader
          leftAccessory={
            <Pressable
              onPress={goBackOrProfile}
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={18} color="#1C1917" />
            </Pressable>
          }
        />
        <ScrollView
          contentContainerStyle={[tw`px-5 pt-4`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#059669" />
          }
        >
          <Text style={tw`text-lg font-bold text-stone-900`}>Instructor Hub</Text>
          <Text style={tw`text-sm text-stone-500 mt-1 leading-5 mb-6`}>
            Peers in your growth areas endorse you. Hit the bar, then claim access — no purchase
            required.
          </Text>

          {loading && !eligibility ? (
            <ActivityIndicator color="#059669" style={tw`mt-8`} />
          ) : eligibility ? (
            <View style={tw`border-t border-stone-200/80 pt-5`}>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Endorsements {eligibility.endorsementsReceived}/{eligibility.endorsementsNeeded}
              </Text>
              <View style={tw`h-1.5 bg-stone-200/80 rounded-full mb-5 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-emerald-600`,
                    {
                      width: `${Math.min(
                        (eligibility.endorsementsReceived / eligibility.endorsementsNeeded) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Posts {eligibility.postCount}/{eligibility.postsNeeded}
              </Text>
              <View style={tw`h-1.5 bg-stone-200/80 rounded-full mb-6 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-emerald-600`,
                    {
                      width: `${Math.min(
                        (eligibility.postCount / Math.max(eligibility.postsNeeded, 1)) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              {eligibility.canClaim ? (
                <View style={tw`rounded-2xl bg-[#FFF1F0] border border-[#FECACA] px-4 py-4 mb-2`}>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-[#E11D48] uppercase`}>
                    Ready
                  </Text>
                  <Text style={tw`text-lg font-bold text-stone-900 mt-1`}>You hit the bar</Text>
                  <Text style={tw`text-sm text-stone-600 mt-1 leading-5 mb-3`}>
                    Unlock community coaching, partner brands, and the Coaches inbox lane.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void onClaim()}
                    disabled={claimBusy}
                    style={tw`bg-energy-600 rounded-xl py-3.5 items-center ${claimBusy ? 'opacity-60' : ''}`}
                  >
                    <Text style={tw`text-white font-bold`}>
                      {claimBusy ? 'Claiming…' : 'Claim instructor status'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={tw`text-sm text-stone-500 leading-5 mb-4`}>
                    Ask friends on shared paths to endorse you — or keep posting progress.
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigateFromRoot(navigation, 'Post')}
                    style={tw`flex-row items-center justify-center py-3 border border-stone-200/80 rounded-xl bg-white/60 mb-5`}
                  >
                    <Ionicons name="create-outline" size={18} color="#059669" />
                    <Text style={tw`text-emerald-700 font-semibold ml-2`}>Create a post</Text>
                  </TouchableOpacity>

                  {suggestions.length > 0 ? (
                    <View style={tw`rounded-[22px] overflow-hidden border border-emerald-600/40 bg-[#FFFcf7]`}>
                      <View style={tw`h-1.5 bg-emerald-600`} />
                      <View style={tw`px-4 pt-3.5 pb-2`}>
                        <View style={tw`flex-row items-center mb-1`}>
                          <Ionicons name="ribbon-outline" size={14} color="#059669" />
                          <Text
                            style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase ml-1.5`}
                          >
                            Ask for endorsement
                          </Text>
                        </View>
                        <Text style={tw`text-sm text-stone-600 leading-5 mb-3`}>
                          Structured ask → they get a notification, not a cold DM.
                        </Text>
                        {suggestions.map((person, idx) => (
                          <View
                            key={person.id}
                            style={tw`flex-row items-center py-3 ${
                              idx < suggestions.length - 1 ? 'border-b border-stone-200/80' : ''
                            }`}
                          >
                            <TouchableOpacity onPress={() => openProfile(person.id)}>
                              <AvatarBubble avatar={person.avatar} name={person.username} />
                            </TouchableOpacity>
                            <View style={tw`flex-1 ml-3 pr-2`}>
                              <Text style={tw`font-semibold text-stone-900`}>
                                {person.username}
                              </Text>
                              <View style={tw`flex-row flex-wrap gap-1 mt-1.5`}>
                                {(person.shared_categories || []).slice(0, 2).map((key) => (
                                  <View
                                    key={`${person.id}-${key}`}
                                    style={tw`px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100`}
                                  >
                                    <Text style={tw`text-[11px] font-semibold text-emerald-800`}>
                                      {getCategoryLabel(key)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={() => void askEndorsement(person)}
                              disabled={busyId === person.id}
                              style={tw`px-3.5 py-2 rounded-xl bg-emerald-600 ${
                                busyId === person.id ? 'opacity-60' : ''
                              }`}
                            >
                              <Text style={tw`text-xs font-bold text-white`}>
                                {busyId === person.id ? '…' : 'Send ask'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          ) : (
            <Text style={tw`text-center text-stone-500 mt-6`}>
              Could not load eligibility. Pull to refresh.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const stats = hub?.stats;
  const tabs: { key: HubTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    {
      key: 'students',
      label: `Students${inquiries.length || contracts.length ? ` · ${inquiries.length + contracts.filter((c) => c.status === 'active').length}` : ''}`,
    },
    { key: 'community', label: `Community${stats?.endorsers ? ` · ${stats.endorsers}` : ''}` },
    {
      key: 'partnerships',
      label: `Partners${
        stats?.pending_requests
          ? ` · ${stats.pending_requests}`
          : stats?.active_partnerships
            ? ` · ${stats.active_partnerships}`
            : ''
      }`,
    },
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <Pressable
            onPress={goBackOrProfile}
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </Pressable>
        }
        right={
          <>
            <Pressable
              onPress={() => openMessages()}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Messages"
            >
              <Ionicons name="chatbubbles-outline" size={17} color="#059669" />
            </Pressable>
            <Pressable
              onPress={() => navigateFromRoot(navigation, 'Post')}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Create post"
            >
              <Ionicons name="create-outline" size={17} color="#059669" />
            </Pressable>
          </>
        }
      />

      <View style={tw`px-5 pt-3 pb-1`}>
        <Text style={tw`text-lg font-bold text-stone-900`}>Instructor Hub</Text>
        <Text style={tw`text-sm text-stone-500 mt-0.5 leading-5`}>
          Talk, send a written plan, then assign homework.
        </Text>
      </View>

      <View style={tw`flex-row px-5 mt-3 border-b border-stone-200/80`}>
        {tabs.map((tab) => (
          <PressableScale
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            feedback="select"
            style={tw`mr-5 pb-2.5 border-b-2 ${
              activeTab === tab.key ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            <Text
              style={tw`text-sm font-semibold ${
                activeTab === tab.key ? 'text-emerald-700' : 'text-stone-500'
              }`}
            >
              {tab.label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {loading && !hub ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#059669" />
          }
        >
          {activeTab === 'overview' && stats ? (
            <View style={tw`px-5 pt-2`}>
              {justClaimed ? (
                <View style={tw`mb-4 px-4 py-4 rounded-2xl bg-[#FFF1F0] border border-[#FECACA]`}>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-[#E11D48] uppercase`}>
                    You’re in
                  </Text>
                  <Text style={tw`text-lg font-bold text-stone-900 mt-1`}>Instructor unlocked</Text>
                  <Text style={tw`text-sm text-stone-600 mt-1 leading-5`}>
                    Teach today: post a tip, check your inbox, or greet someone who endorsed you.
                  </Text>
                  <TouchableOpacity onPress={() => setJustClaimed(false)} style={tw`mt-3`}>
                    <Text style={tw`text-sm font-semibold text-[#E11D48]`}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={tw`mb-4 px-3.5 py-3.5 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Your offer
                </Text>
                <Text style={tw`text-sm text-stone-500 mt-1 mb-3`}>
                  New proposals use your current trial length.{' '}
                  {formatCurrency(offering?.weekly_fee_eur ?? 10, offering?.currency)}/week ·{' '}
                  {completedPlans} completed plans.
                </Text>
                <View style={tw`flex-row gap-2 mb-2`}>
                  <OfferField
                    label="€ / week"
                    value={offerDraft.weekly}
                    onChange={(weekly) => setOfferDraft((d) => ({ ...d, weekly }))}
                  />
                  <OfferField
                    label="Times / week"
                    value={offerDraft.sessions}
                    onChange={(sessions) => setOfferDraft((d) => ({ ...d, sessions }))}
                  />
                </View>
                <View style={tw`flex-row gap-2 mb-3`}>
                  <OfferField
                    label="Weeks"
                    value={offerDraft.weeks}
                    onChange={(weeks) => setOfferDraft((d) => ({ ...d, weeks }))}
                  />
                  <OfferField
                    label="Trial days"
                    value={offerDraft.trial}
                    onChange={(trial) => setOfferDraft((d) => ({ ...d, trial }))}
                  />
                </View>
                <View style={tw`flex-row items-center justify-between`}>
                  <PressableScale
                    onPress={() => void toggleAccepting()}
                    disabled={acceptingBusy}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: offerDraft.accepting, disabled: acceptingBusy }}
                    style={tw`px-3 py-2 rounded-xl ${
                      offerDraft.accepting ? 'bg-emerald-50' : 'bg-[#EAE4D6]'
                    } ${acceptingBusy ? 'opacity-60' : ''}`}
                  >
                    <Text
                      style={tw`text-xs font-semibold ${
                        offerDraft.accepting ? 'text-emerald-800' : 'text-stone-600'
                      }`}
                    >
                      {offerDraft.accepting ? 'Accepting plans' : 'Paused'}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => void saveOffering()}
                    disabled={offerBusy}
                    style={tw`px-4 py-2 rounded-xl bg-emerald-600 ${offerBusy ? 'opacity-60' : ''}`}
                  >
                    <Text style={tw`text-white text-xs font-bold`}>
                      {offerBusy ? 'Saving…' : 'Save offer'}
                    </Text>
                  </PressableScale>
                </View>
                {offerError ? (
                  <Text style={tw`text-xs text-red-700 mt-2`}>{offerError}</Text>
                ) : null}
              </View>

              <Text
                style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
              >
                Do next
              </Text>
              {[
                {
                  icon: 'create-outline' as const,
                  label: 'Teach today',
                  subtitle: 'Post a tip on your paths',
                  onPress: () => {
                    feedback.open();
                    navigateFromRoot(navigation, 'Post');
                  },
                  highlight: true,
                },
                {
                  icon: 'chatbubbles-outline' as const,
                  label: 'Coach inbox',
                  subtitle:
                    (stats.unread_messages || 0) > 0
                      ? `${stats.unread_messages} unread`
                      : 'Message learners & friends',
                  onPress: () => {
                    feedback.tab();
                    openMessages();
                  },
                  highlight: !!hub?.actions?.open_inbox,
                },
                {
                  icon: 'school-outline' as const,
                  label: 'Students',
                  subtitle:
                    inquiries.length > 0
                      ? `${inquiries.length} talking · ${contracts.filter((c) => c.status === 'active').length} active plans`
                      : 'Reach-outs, proposals, and homework',
                  onPress: () => setActiveTab('students'),
                  highlight: inquiries.length > 0,
                },
                {
                  icon: 'people-outline' as const,
                  label: 'Check in',
                  subtitle: `${stats.endorsers} endorsers · ${stats.learners || 0} on your paths`,
                  onPress: () => setActiveTab('community'),
                  highlight: !!hub?.actions?.check_in_learners,
                },
                {
                  icon: 'briefcase-outline' as const,
                  label: 'Partnerships',
                  subtitle:
                    stats.pending_requests > 0
                      ? `${stats.pending_requests} request${stats.pending_requests === 1 ? '' : 's'} waiting`
                      : `${stats.active_partnerships} active · promote products`,
                  onPress: () => setActiveTab('partnerships'),
                  highlight: !!hub?.actions?.review_partners,
                },
              ].map((item) => (
                <PressableScale
                  key={item.label}
                  onPress={item.onPress}
                  style={tw`flex-row items-center py-3.5 border-b border-stone-200/80 ${
                    item.highlight ? 'bg-emerald-50/50 mx-[-8px] px-2 rounded-xl' : ''
                  }`}
                >
                  <View
                    style={tw`w-9 h-9 rounded-full items-center justify-center mr-3 ${
                      item.highlight ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                    }`}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={item.highlight ? '#fff' : '#57534E'}
                    />
                  </View>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`font-semibold text-stone-900`}>{item.label}</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
                </PressableScale>
              ))}

              <View style={tw`flex-row border-b border-stone-200/80 mt-4`}>
                <StatCell label="Points" value={stats.points} />
                <StatCell label="Endorsements" value={stats.endorsements} />
                <StatCell label="Posts" value={stats.posts} />
              </View>
              <View style={tw`flex-row border-b border-stone-200/80`}>
                <StatCell label="Partners" value={stats.active_partnerships} />
                <StatCell label="Pending" value={stats.pending_requests} />
                <StatCell label="Referrals" value={stats.referral_orders} />
              </View>

              {stats.referral_revenue > 0 ? (
                <View style={tw`py-4 border-b border-stone-200/80`}>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                    Attributed sales
                  </Text>
                  <Text style={tw`text-2xl font-bold text-stone-900 mt-1`}>
                    {formatMoney(stats.referral_revenue)}
                  </Text>
                  <Text style={tw`text-sm text-stone-500 mt-0.5`}>
                    From partnership referrals across your brands
                  </Text>
                </View>
              ) : null}

              <Text
                style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-5 mb-2`}
              >
                More
              </Text>
              {[
                {
                  icon: 'person-outline' as const,
                  label: 'View public profile',
                  subtitle: 'Teaching presence & endorsements',
                  onPress: () => user?.id && openProfile(user.id),
                },
              ].map((item, i, arr) => (
                <PressableScale
                  key={item.label}
                  onPress={item.onPress}
                  style={tw`flex-row items-center py-3.5 ${
                    i < arr.length - 1 ? 'border-b border-stone-200/80' : ''
                  }`}
                >
                  <View style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
                    <Ionicons name={item.icon} size={18} color="#57534E" />
                  </View>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`font-semibold text-stone-900`}>{item.label}</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
                </PressableScale>
              ))}
            </View>
          ) : null}

          {activeTab === 'students' ? (
            <View style={tw`px-5 pt-2`}>
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
                People who reached out. Send a proposal after you talk. Homework lives on their coaching plan.
              </Text>
              {contracts.filter((c) => c.status === 'active').length > 0 ? (
                <>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
                    Active plans
                  </Text>
                  {contracts
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <PressableScale
                        key={c.id}
                        onPress={() =>
                          navigateFromRoot(navigation, 'CoachingContract', { contractId: c.id })
                        }
                        style={tw`mb-2 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}
                      >
                        <Text style={tw`font-bold text-stone-900`}>
                          {c.client?.username || 'Client'}
                        </Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {c.weeks} wk · {c.sessions_per_week}× ·{' '}
                          {formatCurrency(c.weekly_fee_eur, c.currency)}/week · {COACHING_ACTIVE_STATUS}
                        </Text>
                      </PressableScale>
                    ))}
                </>
              ) : null}

              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2 mt-3`}>
                Talking
              </Text>
              {inquiries.length === 0 ? (
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No reach-outs yet"
                  description="When someone taps Reach out on your page, the thread lands here."
                />
              ) : (
                inquiries.map((row) => (
                  <PressableScale
                    key={row.id}
                    onPress={() =>
                      openMessages(row.client_id)
                    }
                    style={tw`flex-row items-center py-3 border-b border-stone-200/80`}
                  >
                    <AvatarBubble
                      avatar={row.client?.avatar}
                      name={row.client?.username || 'Client'}
                    />
                    <View style={tw`flex-1 ml-3`}>
                      <Text style={tw`font-semibold text-stone-900`}>
                        {row.client?.username || 'Client'}
                      </Text>
                      <Text style={tw`text-xs text-stone-500 mt-0.5`}>Open coaching thread</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
                  </PressableScale>
                ))
              )}

              {contracts.filter((c) => c.status === 'completed').length > 0 ? (
                <>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2 mt-5`}>
                    Completed
                  </Text>
                  {contracts
                    .filter((c) => c.status === 'completed')
                    .map((c) => (
                      <PressableScale
                        key={c.id}
                        onPress={() =>
                          navigateFromRoot(navigation, 'CoachingContract', { contractId: c.id })
                        }
                        style={tw`py-3 border-b border-stone-200/80`}
                      >
                        <Text style={tw`font-semibold text-stone-900`}>
                          {c.client?.username || 'Client'}
                        </Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {formatCurrency(c.total_eur, c.currency)} · {c.weeks} weeks
                        </Text>
                      </PressableScale>
                    ))}
                </>
              ) : null}
            </View>
          ) : null}

          {activeTab === 'community' ? (
            <View style={tw`px-5 pt-2`}>
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
                Endorsers and friends on your paths — check in or coach them.
              </Text>
              {(hub?.learners?.length ?? 0) > 0 ? (
                <>
                  <Text
                    style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
                  >
                    On your paths
                  </Text>
                  {hub!.learners!.map((person) => (
                    <View
                      key={`learner-${person.id}`}
                      style={tw`flex-row items-center py-3 border-b border-stone-200/80`}
                    >
                      <TouchableOpacity onPress={() => openProfile(person.id)}>
                        <AvatarBubble avatar={person.avatar} name={person.username} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openProfile(person.id)}
                        style={tw`flex-1 ml-3 pr-2`}
                      >
                        <Text style={tw`font-semibold text-stone-900`}>{person.username}</Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`} numberOfLines={1}>
                          {(person.shared_categories || person.categories || [])
                            .slice(0, 2)
                            .map(getCategoryLabel)
                            .join(' · ')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void messageEndorser({ ...person, is_friend: true, endorsed_at: '' })}
                        disabled={busyId === person.id}
                        style={tw`px-3 py-1.5 rounded-full bg-emerald-600`}
                      >
                        <Text style={tw`text-xs font-bold text-white`}>Check in</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <Text
                    style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2 mt-5`}
                  >
                    Endorsers
                  </Text>
                </>
              ) : null}
              {!hub?.endorsers?.length ? (
                <EmptyState
                  icon="people-outline"
                  title="No endorsers yet"
                  description="Share your public profile so peers in your categories can endorse you."
                />
              ) : (
                hub.endorsers.map((person, i) => (
                  <View
                    key={person.id}
                    style={tw`flex-row items-center py-3.5 ${
                      i < hub.endorsers.length - 1 ? 'border-b border-stone-200/80' : ''
                    }`}
                  >
                    <TouchableOpacity onPress={() => openProfile(person.id)}>
                      <AvatarBubble avatar={person.avatar} name={person.username} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openProfile(person.id)}
                      style={tw`flex-1 ml-3 pr-2`}
                    >
                      <Text style={tw`font-semibold text-stone-900`}>{person.username}</Text>
                      <Text style={tw`text-xs text-stone-500 mt-0.5`} numberOfLines={1}>
                        {(person.categories || []).slice(0, 2).map(getCategoryLabel).join(' · ') ||
                          `${person.points} pts`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void messageEndorser(person)}
                      disabled={busyId === person.id}
                      style={tw`px-3 py-1.5 rounded-full border border-stone-200/80 bg-white/60`}
                    >
                      <Text style={tw`text-xs font-semibold text-emerald-700`}>
                        {busyId === person.id
                          ? '…'
                          : person.is_friend
                            ? 'Message'
                            : 'Profile'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {activeTab === 'partnerships' ? (
            <View style={tw`px-5 pt-2`}>
              {(hub?.pending_requests?.length ?? 0) > 0 ? (
                <View style={tw`mb-6`}>
                  <Text
                    style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
                  >
                    Incoming requests
                  </Text>
                  {hub!.pending_requests.map((req) => (
                    <View
                      key={req.id}
                      style={tw`py-4 border-b border-stone-200/80`}
                    >
                      <View style={tw`flex-row items-center mb-2`}>
                        <AvatarBubble
                          avatar={req.business_avatar}
                          name={req.business_name}
                          size={36}
                        />
                        <View style={tw`ml-3 flex-1`}>
                          <Text style={tw`font-semibold text-stone-900`}>{req.business_name}</Text>
                          <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                            {partnershipTerms(req)}
                          </Text>
                        </View>
                      </View>
                      {req.message ? (
                        <Text style={tw`text-sm text-stone-600 mb-3 leading-5`}>{req.message}</Text>
                      ) : null}
                      <View style={tw`flex-row`}>
                        <TouchableOpacity
                          onPress={() => void onRespondRequest(req, 'approved')}
                          disabled={busyId === req.id}
                          style={tw`flex-1 mr-2 py-2.5 rounded-xl bg-emerald-700 items-center ${
                            busyId === req.id ? 'opacity-60' : ''
                          }`}
                        >
                          <Text style={tw`text-white font-semibold text-sm`}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void onRespondRequest(req, 'declined')}
                          disabled={busyId === req.id}
                          style={tw`flex-1 ml-2 py-2.5 rounded-xl border border-stone-200/80 bg-white/60 items-center`}
                        >
                          <Text style={tw`text-stone-700 font-semibold text-sm`}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text
                style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
              >
                Your partnerships
              </Text>
              {!hub?.partnerships?.length ? (
                <EmptyState
                  icon="briefcase-outline"
                  title="No partnerships yet"
                  description="Businesses discover instructors and send partnership requests. Accept them here."
                />
              ) : (
                hub.partnerships.map((p, i) => (
                  <View
                    key={p.id}
                    style={tw`py-4 ${i < hub.partnerships.length - 1 ? 'border-b border-stone-200/80' : ''}`}
                  >
                    <View style={tw`flex-row items-center`}>
                      <AvatarBubble
                        avatar={p.business_avatar}
                        name={p.business_name}
                        size={36}
                      />
                      <View style={tw`ml-3 flex-1`}>
                        <Text style={tw`font-semibold text-stone-900`}>{p.business_name}</Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {partnershipTerms(p)} · {p.status}
                        </Text>
                      </View>
                    </View>
                    {(p.attributed_orders > 0 || p.attributed_revenue > 0) && (
                      <Text style={tw`text-sm text-stone-600 mt-2`}>
                        {p.attributed_orders} referral order
                        {p.attributed_orders === 1 ? '' : 's'} · {formatMoney(p.attributed_revenue)}
                      </Text>
                    )}
                    <View style={tw`flex-row mt-3 flex-wrap items-center`}>
                      {p.status === 'active' ? (
                        <>
                          <TouchableOpacity
                            onPress={() => promotePartnership(p)}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={tw`mr-6 mb-1 py-1`}
                          >
                            <Text style={tw`text-sm font-bold text-emerald-700`}>Promote</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'paused')}
                            disabled={busyId === p.id}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={tw`mr-6 mb-1 py-1`}
                          >
                            <Text style={tw`text-sm font-semibold text-stone-600`}>Pause</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'ended')}
                            disabled={busyId === p.id}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={tw`mb-1 py-1`}
                          >
                            <Text style={tw`text-sm font-semibold text-red-600`}>End</Text>
                          </TouchableOpacity>
                        </>
                      ) : p.status === 'paused' ? (
                        <>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'active')}
                            disabled={busyId === p.id}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={tw`mr-6 py-1`}
                          >
                            <Text style={tw`text-sm font-semibold text-emerald-700`}>Resume</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'ended')}
                            disabled={busyId === p.id}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={tw`py-1`}
                          >
                            <Text style={tw`text-sm font-semibold text-red-600`}>End</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          onPress={() => void onUpdatePartnership(p, 'active')}
                          disabled={busyId === p.id}
                          hitSlop={10}
                          accessibilityRole="button"
                          style={tw`py-1`}
                        >
                          <Text style={tw`text-sm font-semibold text-emerald-700`}>Reactivate</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {!hub && !loading ? (
            <Text style={tw`text-center text-stone-500 mt-8 px-5`}>
              Could not load hub. Pull to refresh.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
