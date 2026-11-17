import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import FormTextInput from '../ui/FormTextInput';
import CATEGORIES from '../../data/categories';
import { createCohort, type Cohort } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';
import { alertMessage } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';
import { CAPACITY_PRESETS, COHORT_LIMITS, formatDay, startChoices } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (cohort: Cohort) => void;
};

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix: string;
}) {
  const btn = (delta: number, icon: 'remove' | 'add') => {
    const next = Math.min(max, Math.max(min, value + delta));
    const disabled = next === value;
    return (
      <PressableScale
        feedback={disabled ? false : 'selection'}
        disabled={disabled}
        onPress={() => onChange(next)}
        accessibilityRole="button"
        accessibilityLabel={`${icon === 'add' ? 'More' : 'Fewer'} ${label.toLowerCase()}`}
        style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center ${disabled ? 'opacity-40' : ''}`}
      >
        <Ionicons name={icon} size={18} color={theme.colors.ink} />
      </PressableScale>
    );
  };
  return (
    <View
      style={tw`flex-row items-center justify-between py-2`}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value} ${suffix}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}
    >
      <Text style={tw`text-body text-ink`}>{label}</Text>
      <View style={tw`flex-row items-center gap-3`}>
        {btn(-1, 'remove')}
        <Text style={tw`text-callout font-semibold text-ink min-w-16 text-center`}>
          {value} {suffix}
        </Text>
        {btn(1, 'add')}
      </View>
    </View>
  );
}

function ChipRow<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2 py-1`}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={String(o.key)}
            feedback="chip"
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: on }}
            style={tw`px-3 py-1.5 rounded-chip border ${on ? 'bg-emerald-600 border-emerald-600' : 'bg-card border-line'}`}
          >
            <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** Coach: start a group plan (title, path, weeks, start date, capacity). Invite-only. */
export default function CohortCreateSheet({ visible, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [capacity, setCapacity] = useState(12);
  const starts = useMemo(() => startChoices(new Date()), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [start, setStart] = useState<string | null>(starts[1]?.key ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setPath(null);
      setDescription('');
      setWeeks(4);
      setCapacity(12);
      setStart(starts[1]?.key ?? null);
    }
  }, [visible, starts]);

  const valid = title.trim().length >= COHORT_LIMITS.title.min && !!start;

  const submit = async () => {
    if (!valid || busy || !start) return;
    setBusy(true);
    try {
      const cohort = await createCohort({
        title: title.trim(),
        path,
        description: description.trim() || null,
        weeks,
        start_date: start,
        capacity,
      });
      haptic('success');
      onCreated(cohort);
    } catch (e) {
      void alertMessage('Couldn’t create the group', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pathOptions: { key: string | null; label: string }[] = [
    { key: null, label: 'Any path' },
    ...CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
  ];

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} keyboardAware maxHeightRatio={0.92}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={tw`px-gutter pt-1 pb-8`}
        showsVerticalScrollIndicator={false}
      >
        <Text style={tw`text-title font-bold text-ink`}>New group plan</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1 leading-5`}>
          One plan, many people. Post updates once, assign homework to everyone, and see who needs you.
        </Text>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-5 mb-1.5`}>Name</Text>
        <FormTextInput
          value={title}
          onChangeText={setTitle}
          maxLength={COHORT_LIMITS.title.max}
          placeholder="e.g. 4-week strength basics"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Group name"
          style={tw`bg-raised rounded-control px-3.5 py-3 text-body text-ink`}
        />

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-4 mb-1`}>Path</Text>
        <ChipRow label="Path" options={pathOptions} value={path} onChange={setPath} />

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-4 mb-1.5`}>
          What you’ll do together
        </Text>
        <FormTextInput
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          multiline
          placeholder="A short note members see before they join (optional)"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Group description"
          style={tw`bg-raised rounded-control px-3.5 py-3 text-body text-ink min-h-20`}
        />

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-4 mb-1`}>Starts</Text>
        <ChipRow label="Start date" options={starts} value={start} onChange={setStart} />
        {start ? <Text style={tw`text-footnote text-ink-3 mt-1`}>{formatDay(start)}</Text> : null}

        <View style={tw`mt-3 bg-card border border-line rounded-card px-3.5 py-1`}>
          <Stepper
            label="Length"
            value={weeks}
            min={COHORT_LIMITS.weeks.min}
            max={COHORT_LIMITS.weeks.max}
            onChange={setWeeks}
            suffix={weeks === 1 ? 'week' : 'weeks'}
          />
          <View style={tw`h-px bg-line`} />
          <Stepper
            label="Spots"
            value={capacity}
            min={COHORT_LIMITS.capacity.min}
            max={COHORT_LIMITS.capacity.max}
            onChange={setCapacity}
            suffix="people"
          />
          <View style={tw`pb-2`}>
            <ChipRow
              label="Spots"
              options={CAPACITY_PRESETS.map((n) => ({ key: n, label: String(n) }))}
              value={capacity}
              onChange={(n) => setCapacity(n)}
            />
          </View>
        </View>

        <View style={tw`mt-4 flex-row items-start`}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.colors.ink3} style={tw`mt-0.5`} />
          <Text style={tw`flex-1 ml-1.5 text-footnote text-ink-3 leading-5`}>
            Invite-only: people join with your code or your invite. Members see each other’s names and your
            updates — never each other’s homework or check-ins.
          </Text>
        </View>
        <Text style={tw`text-footnote text-ink-3 mt-2 leading-5`}>{COACHING_BILLING_NOTE}</Text>

        <PrimaryButton
          label="Create group"
          onPress={() => void submit()}
          disabled={!valid}
          loading={busy}
          style={tw`mt-5`}
          accessibilityLabel="Create group plan"
        />
      </ScrollView>
    </AnimatedBottomSheet>
  );
}
