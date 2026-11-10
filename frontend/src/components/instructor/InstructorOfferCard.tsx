import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { StarRow } from './StarRating';
import { formatCurrency } from '../../utils/money';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';

type Offer = {
  weekly_fee_eur?: number | null;
  sessions_per_week?: number | null;
  typical_weeks?: number | null;
  trial_days?: number | null;
  accepting?: boolean;
  currency?: string | null;
};

export default function InstructorOfferCard({
  offer,
  completedPlans = 0,
  endorsements = 0,
  rating,
}: {
  offer?: Offer | null;
  completedPlans?: number;
  endorsements?: number;
  rating?: { avg: number; count: number } | null;
}) {
  const paused = offer?.accepting === false;
  const fee = offer?.weekly_fee_eur;
  const sessions = offer?.sessions_per_week;
  const weeks = offer?.typical_weeks;
  const total =
    fee != null && weeks != null ? Math.round(fee * weeks * 100) / 100 : null;
  const currency = offer?.currency || 'EUR';
  const showRating = !!(rating && rating.count > 0);

  return (
    <View style={tw`mb-3 px-4 py-4 rounded-3xl bg-emerald-50 border border-emerald-100`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Weekly plan
          </Text>
          {fee != null ? (
            <Text style={tw`text-[28px] font-bold text-stone-900 mt-0.5`}>
              {formatCurrency(fee, currency)}
              <Text style={tw`text-sm font-semibold text-stone-500`}> / week</Text>
            </Text>
          ) : (
            <Text style={tw`text-[17px] font-bold text-stone-900 mt-1`}>Ask about a plan</Text>
          )}
        </View>
        {showRating ? (
          <View style={tw`items-end`}>
            <StarRow value={rating!.avg} />
            <Text style={tw`text-[11px] text-stone-500 mt-0.5`}>
              {rating!.avg} · {rating!.count}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={tw`flex-row flex-wrap mt-2`}>
        {sessions ? (
          <Chip icon="repeat-outline" label={`${sessions}× / week`} />
        ) : null}
        {weeks ? <Chip icon="calendar-outline" label={`${weeks} weeks`} /> : null}
        {total != null ? <Chip icon="cash-outline" label={`${formatCurrency(total, currency)} total`} /> : null}
        {offer?.trial_days ? (
          <Chip icon="hourglass-outline" label={`${offer.trial_days}-day trial`} />
        ) : null}
      </View>

      <Text style={tw`text-[13px] text-stone-600 mt-2.5 leading-5`}>
        Talk first. Then a written proposal. {COACHING_BILLING_NOTE}
      </Text>

      <View style={tw`flex-row flex-wrap mt-2.5 pt-2 border-t border-emerald-100`}>
        {paused ? (
          <View style={tw`flex-row items-center mr-3 mt-1`}>
            <Ionicons name="pause-circle" size={13} color="#B45309" />
            <Text style={tw`text-xs text-amber-800 font-semibold ml-1`}>Not taking new plans</Text>
          </View>
        ) : null}
        <View style={tw`flex-row items-center mr-3 mt-1`}>
          <Ionicons name="ribbon-outline" size={13} color="#059669" />
          <Text style={tw`text-xs text-emerald-800 ml-1`}>
            {endorsements} endorsement{endorsements === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={tw`flex-row items-center mt-1`}>
          <Ionicons name="checkmark-done-outline" size={13} color="#059669" />
          <Text style={tw`text-xs text-emerald-800 ml-1`}>
            {completedPlans} completed plan{completedPlans === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Chip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={tw`flex-row items-center mr-2 mb-1.5 px-2 py-1 rounded-full bg-[#FFFcf7] border border-emerald-100`}>
      <Ionicons name={icon} size={11} color="#059669" />
      <Text style={tw`text-[11px] font-semibold text-emerald-800 ml-1`}>{label}</Text>
    </View>
  );
}
