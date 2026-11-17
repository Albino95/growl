import React, { useState } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { Proof } from '../../services/api/proofs';
import ProofMedia from './ProofMedia';
import ProofViewer from './ProofViewer';
import { KIND_META, proofSummary } from './proofDefaults';

type Props = {
  proof: Proof;
  /** More proofs for the same item ("✓ with proof · 2"). */
  count?: number;
  /** Show the summary text after the mark (e.g. "20 min focused"). */
  showSummary?: boolean;
  style?: StyleProp<ViewStyle>;
  onDeleted?: (id: string) => void;
  onChanged?: (p: Proof) => void;
};

/**
 * Small "✓ with proof" mark + kind icon + photo thumbnail. Tap opens the
 * full-screen ProofViewer (delete for the owner, cheer for others).
 */
export default function ProofChip({ proof, count, showSummary = false, style, onDeleted, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const meta = KIND_META[proof.kind];
  const summary = proofSummary(proof);
  return (
    <>
      <PressableScale
        feedback="selection"
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`With proof: ${meta.label}. ${summary}. Opens the proof`}
        style={[tw`flex-row items-center self-start pl-1 pr-2.5 py-1 rounded-chip bg-card border border-emerald-200/80`, style]}
      >
        {proof.kind === 'photo' && proof.media_url ? (
          <ProofMedia proof={proof} style={tw`w-5 h-5 rounded-full overflow-hidden`} />
        ) : (
          <View style={tw`w-5 h-5 rounded-full bg-emerald-50 items-center justify-center`}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={12} color={theme.colors.leafInk} />
          </View>
        )}
        <Text style={tw`text-caption font-semibold text-emerald-800 ml-1.5`} numberOfLines={1}>
          ✓ with proof{count && count > 1 ? ` · ${count}` : ''}
          {showSummary ? ` · ${summary}` : ''}
        </Text>
      </PressableScale>
      <ProofViewer
        visible={open}
        proof={proof}
        onClose={() => setOpen(false)}
        onDeleted={onDeleted}
        onChanged={onChanged}
      />
    </>
  );
}
