import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import KeyboardInsetView from '../../components/ui/KeyboardInsetView';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { alertMessage } from '../../utils/confirmDialog';
import { scrollInputIntoView } from '../../utils/scrollInputIntoView';
import { ApiError } from '../../services/api/http';
import { newIdempotencyKey } from '../../services/api/idempotency';
import {
  getWeeklyCurrent,
  listWeeklyCheckins,
  submitWeeklyCheckin,
  type WeeklyAnswer,
  type WeeklyAnswers,
  type WeeklyCheckin,
  type WeeklyCurrent,
  type WeeklyQuestion,
} from '../../services/api/weekly';
import { cleanAnswers, hasAnswer, windowLabel } from '../../components/weekly/weeklyMeta';
import { listProofs, type Proof } from '../../services/api/proofs';
import ProofSheet from '../../components/proof/ProofSheet';
import ProofChip from '../../components/proof/ProofChip';

type Load = 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * Sunday check-in: up to 5 quick questions (< 2 minutes), open Saturday 12:00 →
 * Monday 12:00 local, editable until it closes. With an active coach the answers
 * are shared with them (clearly stated on screen).
 */
export default function WeeklyCheckinScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<Load>('loading');
  const [data, setData] = useState<WeeklyCurrent | null>(null);
  const [past, setPast] = useState<WeeklyCheckin | null>(null);
  const [answers, setAnswers] = useState<WeeklyAnswers>({});
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [proofsOk, setProofsOk] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const cur = await getWeeklyCurrent();
      if (!cur) {
        setState('unavailable');
        return;
      }
      setData(cur);
      setAnswers(cur.checkin?.answers ?? {});
      // Weekly proofs are optional; an older server without /proofs hides the button.
      listProofs({ context_type: 'weekly', context_id: cur.window.week, limit: 20 })
        .then((list) => {
          setProofs(list);
          setProofsOk(true);
        })
        .catch(() => setProofsOk(false));
      if (!cur.window.open) {
        const prev = await listWeeklyCheckins({ week: cur.window.latest_week, limit: 1 }).catch(() => []);
        setPast(prev[0] ?? null);
      }
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setAnswer = (id: string, a: WeeklyAnswer | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (a === undefined) delete next[id];
      else next[id] = a;
      return next;
    });
  };

  const questions = data?.form.questions ?? [];
  const answeredCount = questions.filter((q) => hasAnswer(answers[q.id])).length;

  const save = async () => {
    if (!data || saving) return;
    const clean = cleanAnswers(questions, answers);
    if (!Object.keys(clean).length) {
      void alertMessage('Answer one question', 'Even one quick answer is enough.');
      return;
    }
    setSaving(true);
    try {
      const res = await submitWeeklyCheckin(data.window.week, clean, newIdempotencyKey());
      haptic('success');
      toast.success(res.created ? 'Your week is saved' : 'Changes saved', { icon: 'checkmark-circle-outline' });
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WINDOW_CLOSED') {
        void alertMessage('This week has closed', 'The next check-in opens Saturday at noon.');
        void load();
      } else {
        void alertMessage('Couldn’t save your week', e instanceof Error ? e.message : undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const header = <ScreenHeader title="Your week" onBack={() => navigation.goBack()} backIcon="arrow-back" />;

  if (state !== 'ready' || !data) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        {state === 'loading' ? (
          <View style={tw`px-gutter pt-4 gap-3`}>
            <Skeleton style={tw`h-6 w-2/3 rounded-control`} />
            <Skeleton style={tw`h-24 rounded-card`} />
            <Skeleton style={tw`h-24 rounded-card`} />
          </View>
        ) : state === 'unavailable' ? (
          <EmptyState icon="calendar-outline" title="Not available yet" description="Weekly check-ins are coming soon." />
        ) : (
          <ErrorState onRetry={() => void load()} />
        )}
      </SafeAreaView>
    );
  }

  if (!data.window.open) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <ScrollView contentContainerStyle={tw`px-gutter pt-4 pb-10`}>
          <View style={tw`px-4 py-4 rounded-card bg-card border border-line`}>
            <Ionicons name="calendar-outline" size={22} color={theme.colors.brand} />
            <Text style={tw`text-callout font-bold text-ink mt-2`}>{windowLabel(false)}</Text>
            <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>
              Every weekend you get a few quick questions to close your week. We’ll remind you.
            </Text>
          </View>
          {past ? <PastAnswers checkin={past} /> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const coachName = data.form.coach?.username;

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      <KeyboardInsetView restingBottom={insets.bottom}>
        <ScrollView
          ref={scrollRef}
          style={tw`flex-1`}
          contentContainerStyle={tw`px-gutter pt-4 pb-6`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text accessibilityRole="header" style={tw`text-title font-bold text-ink`}>
            Your week in 2 minutes
          </Text>
          <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>
            Skip anything you like. {windowLabel(true)}.
          </Text>

          {data.has_coach ? (
            <View
              accessible
              accessibilityLabel={`Your coach${coachName ? ` ${coachName}` : ''} will see this`}
              style={tw`flex-row items-center mt-3 px-3 py-2.5 rounded-card bg-raised border border-line`}
            >
              <Ionicons name="eye-outline" size={16} color={theme.colors.brand} />
              <Text style={tw`flex-1 ml-2 text-footnote text-ink-2`}>
                Your coach{coachName ? ` ${coachName}` : ''} will see this
              </Text>
            </View>
          ) : null}

          {proofsOk ? (
            <View style={tw`mt-3 flex-row flex-wrap items-center gap-2`}>
              {proofs.map((p) => (
                <ProofChip
                  key={p.id}
                  proof={p}
                  showSummary
                  onDeleted={(id) => setProofs((prev) => prev.filter((x) => x.id !== id))}
                  onChanged={(next) => setProofs((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                />
              ))}
              <PressableScale
                feedback="selection"
                onPress={() => setProofOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add proof to your week. Optional"
                style={tw`flex-row items-center px-3 py-2 rounded-chip bg-card border border-line`}
              >
                <Ionicons name="add-circle-outline" size={16} color={theme.colors.brand} />
                <Text style={tw`ml-1.5 text-footnote font-semibold text-ink-2`}>
                  {proofs.length ? 'Add more proof' : 'Add proof'}
                </Text>
              </PressableScale>
            </View>
          ) : null}

          <View style={tw`mt-4 gap-3`}>
            {questions.map((q, i) => (
              <QuestionBlock
                key={q.id}
                index={i}
                question={q}
                value={answers[q.id]}
                onChange={(a) => setAnswer(q.id, a)}
                onInputFocus={(input) => scrollInputIntoView(scrollRef, { current: input })}
              />
            ))}
          </View>
        </ScrollView>
        <View style={tw`px-gutter pt-2 pb-3 bg-page border-t border-line`}>
          <PrimaryButton
            label={data.checkin ? 'Save changes' : 'Save my week'}
            loading={saving}
            disabled={answeredCount === 0}
            onPress={() => void save()}
            accessibilityLabel={
              answeredCount === 0 ? 'Save my week. Answer at least one question first' : undefined
            }
          />
        </View>
      </KeyboardInsetView>
      <ProofSheet
        visible={proofOpen}
        onClose={() => setProofOpen(false)}
        context={{ type: 'weekly', id: data.window.week }}
        shareWithCoachDefault={!!data.has_coach}
        title="Add proof to your week"
        onSaved={(p) => {
          setProofs((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
          setProofOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

type BlockProps = {
  index: number;
  question: WeeklyQuestion;
  value: WeeklyAnswer | undefined;
  onChange: (a: WeeklyAnswer | undefined) => void;
  onInputFocus: (input: TextInput | null) => void;
};

function QuestionBlock({ index, question: q, value, onChange, onInputFocus }: BlockProps) {
  const textRef = useRef<TextInput>(null);
  return (
    <View style={tw`px-4 py-4 rounded-card bg-card border border-line`}>
      <Text style={tw`text-caption text-ink-3 font-semibold`}>{index + 1}</Text>
      <Text style={tw`text-body font-semibold text-ink mt-0.5`}>{q.prompt}</Text>

      {q.type === 'scale' ? (
        <View style={tw`mt-3`}>
          <View style={tw`flex-row gap-2`} accessibilityRole="radiogroup" accessibilityLabel={q.prompt}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = value === n;
              return (
                <PressableScale
                  key={n}
                  feedback="chip"
                  onPress={() => onChange(on ? undefined : n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${n} of 5${n === 1 && q.low_label ? `, ${q.low_label}` : ''}${
                    n === 5 && q.high_label ? `, ${q.high_label}` : ''
                  }`}
                  style={tw`flex-1 items-center py-2.5 rounded-control border ${
                    on ? 'bg-emerald-600 border-emerald-600' : 'bg-raised border-line'
                  }`}
                >
                  <Text style={tw`text-callout font-bold ${on ? 'text-white' : 'text-ink'}`}>{n}</Text>
                </PressableScale>
              );
            })}
          </View>
          {q.low_label || q.high_label ? (
            <View style={tw`flex-row justify-between mt-1.5`}>
              <Text style={tw`text-caption text-ink-3`}>{q.low_label ?? ''}</Text>
              <Text style={tw`text-caption text-ink-3`}>{q.high_label ?? ''}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {q.type === 'text' ? (
        <TextInput
          ref={textRef}
          value={typeof value === 'string' ? value : ''}
          onChangeText={(t) => onChange(t ? t : undefined)}
          onFocus={() => onInputFocus(textRef.current)}
          placeholder="A line or two"
          placeholderTextColor={theme.colors.placeholder}
          multiline
          maxLength={280}
          accessibilityLabel={q.prompt}
          style={[
            tw`mt-3 px-3 py-2.5 rounded-control bg-raised border border-line text-body text-ink`,
            { minHeight: 64, textAlignVertical: 'top' },
          ]}
        />
      ) : null}

      {q.type === 'chips' ? <ChipsAnswer q={q} value={value} onChange={onChange} onInputFocus={onInputFocus} /> : null}
    </View>
  );
}

function ChipsAnswer({
  q,
  value,
  onChange,
  onInputFocus,
}: {
  q: WeeklyQuestion;
  value: WeeklyAnswer | undefined;
  onChange: (a: WeeklyAnswer | undefined) => void;
  onInputFocus: (input: TextInput | null) => void;
}) {
  const ref = useRef<TextInput>(null);
  const cur = value && typeof value === 'object' ? value : { chips: [] as string[], text: '' };
  const update = (chips: string[], text: string | undefined) => {
    if (!chips.length && !text) onChange(undefined);
    else onChange(text ? { chips, text } : { chips });
  };
  return (
    <View style={tw`mt-3`}>
      <View style={tw`flex-row flex-wrap gap-2`}>
        {(q.options ?? []).map((o) => {
          const on = cur.chips.includes(o);
          return (
            <PressableScale
              key={o}
              feedback="chip"
              onPress={() => update(on ? cur.chips.filter((c) => c !== o) : [...cur.chips, o], cur.text)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o}
              style={tw`px-3.5 py-2 rounded-chip border ${
                on ? 'bg-emerald-600 border-emerald-600' : 'bg-raised border-line'
              }`}
            >
              <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>{o}</Text>
            </PressableScale>
          );
        })}
      </View>
      {q.allow_text ? (
        <TextInput
          ref={ref}
          value={cur.text ?? ''}
          onChangeText={(t) => update(cur.chips, t || undefined)}
          onFocus={() => onInputFocus(ref.current)}
          placeholder="Anything to add? (optional)"
          placeholderTextColor={theme.colors.placeholder}
          maxLength={140}
          accessibilityLabel={`${q.prompt}, more detail`}
          style={tw`mt-2.5 px-3 py-2.5 rounded-control bg-raised border border-line text-body text-ink`}
        />
      ) : null}
    </View>
  );
}

function answerText(q: WeeklyQuestion, a: WeeklyAnswer | undefined): string | null {
  if (a === undefined || a === null) return null;
  if (typeof a === 'number') return `${a} of 5`;
  if (typeof a === 'string') return a;
  return [a.chips.join(', '), a.text].filter(Boolean).join(' — ') || null;
}

function PastAnswers({ checkin }: { checkin: WeeklyCheckin }) {
  const rows = checkin.questions
    .map((q) => ({ q, text: answerText(q, checkin.answers[q.id]) }))
    .filter((r) => r.text);
  if (!rows.length) return null;
  return (
    <View style={tw`mt-4 px-4 py-4 rounded-card bg-card border border-line`}>
      <Text style={tw`text-caption uppercase tracking-[1.5px] text-ink-3 font-semibold`}>Last weekend</Text>
      {rows.map(({ q, text }) => (
        <View key={q.id} style={tw`mt-3`}>
          <Text style={tw`text-footnote text-ink-3`}>{q.prompt}</Text>
          <Text style={tw`text-body text-ink mt-0.5`}>{text}</Text>
        </View>
      ))}
      {checkin.shared_with_coach ? (
        <Text style={tw`text-caption text-ink-3 mt-3`}>Shared with your coach</Text>
      ) : null}
    </View>
  );
}
