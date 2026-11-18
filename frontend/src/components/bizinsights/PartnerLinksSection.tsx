import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import ErrorState from '../ui/ErrorState';
import { toast } from '../../state/useToastStore';
import { confirmAsync } from '../../utils/confirmDialog';
import { feedback } from '../../utils/interactionFeedback';
import { copyText } from '../../screens/Invite/inviteHelpers';
import {
  createPartnerLink,
  deletePartnerLink,
  listPartnerLinks,
  type PartnerLink,
} from '../../services/api/bizInsights';
import type { PartnershipRecord } from '../../services/api/business';

type Props = {
  /** Active partnerships; one tracked link can be made per partner. */
  partnerships: PartnershipRecord[];
  refreshKey?: number;
};

/** Business → Grow → Partners: tracked links per partner with clicks and saves. */
export default function PartnerLinksSection({ partnerships, refreshKey = 0 }: Props) {
  const [links, setLinks] = useState<PartnerLink[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listPartnerLinks();
      if (res === null) {
        setState('unavailable');
        return;
      }
      setLinks(res);
      setState('ready');
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const active = partnerships.filter((p) => p.status === 'active');
  if (state === 'unavailable' || active.length === 0) return null;

  const create = async (p: PartnershipRecord) => {
    setBusy(p.id);
    try {
      const res = await createPartnerLink({ partnership_id: p.id });
      setLinks(res.links);
      feedback.success();
      toast.success(`Link ready for ${p.instructor_name}`);
    } catch (e) {
      toast.info(e instanceof Error ? e.message : 'Couldn’t create the link. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (link: PartnerLink) => {
    if (await copyText(link.url)) {
      feedback.success();
      toast.success('Link copied');
    }
  };

  const share = async (link: PartnerLink, name: string) => {
    try {
      await Share.share({
        message: `Here's your Grow! partner link — share it with your clients: ${link.url}`,
        url: link.url,
        title: `Partner link for ${name}`,
      });
    } catch {
      /* dismissed */
    }
  };

  const remove = async (link: PartnerLink, name: string) => {
    const ok = await confirmAsync(
      'Remove this link?',
      `The link for ${name} will stop working. Its numbers so far stay in your insights.`,
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!ok) return;
    setBusy(link.id);
    try {
      await deletePartnerLink(link.id);
      setLinks((cur) => (cur ? cur.filter((l) => l.id !== link.id) : cur));
      toast.success('Link removed');
    } catch (e) {
      toast.info(e instanceof Error ? e.message : 'Couldn’t remove the link.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={tw`mt-6`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`} accessibilityRole="header">
        Partner links
      </Text>
      <Text style={tw`text-footnote text-ink-3 mb-3 leading-5`}>
        Give each partner their own link to your shop. You'll see how many people tapped it, and saves they made
        within 7 days.
      </Text>

      {state === 'loading' && !links ? (
        <ActivityIndicator color={theme.colors.brand} />
      ) : state === 'error' && !links ? (
        <ErrorState compact title="Couldn’t load partner links" onRetry={() => void load()} />
      ) : (
        active.map((p) => {
          const partnerLinks = (links || []).filter((l) => l.instructor?.id === p.instructor_id);
          const general = partnerLinks.find((l) => !l.product_id);
          return (
            <View key={p.id} style={tw`bg-card rounded-card border border-line p-3.5 mb-2.5`}>
              <View style={tw`flex-row items-center justify-between`}>
                <Text style={tw`text-sm font-semibold text-ink flex-1 pr-2`} numberOfLines={1}>
                  {p.instructor_name}
                </Text>
                {!general ? (
                  <PressableScale
                    onPress={() => void create(p)}
                    disabled={busy === p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Create a partner link for ${p.instructor_name}`}
                    style={tw`px-3 py-1.5 rounded-chip bg-emerald-50 border border-emerald-200 ${busy === p.id ? 'opacity-60' : ''}`}
                  >
                    <Text style={tw`text-xs font-semibold text-emerald-800`}>
                      {busy === p.id ? 'Creating…' : 'Create link'}
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
              {partnerLinks.map((link) => (
                <View key={link.id} style={tw`mt-2.5`}>
                  <Text style={tw`text-xs text-ink-2`} numberOfLines={1} selectable>
                    {link.url}
                    {link.product_name ? ` · ${link.product_name}` : ''}
                  </Text>
                  <View style={tw`flex-row items-center mt-1.5`}>
                    <Text style={[tw`text-xs text-ink-3 flex-1`, { fontVariant: ['tabular-nums'] }]}>
                      {link.clicks} tap{link.clicks === 1 ? '' : 's'} · {link.saves_attributed} save
                      {link.saves_attributed === 1 ? '' : 's'}
                    </Text>
                    <PressableScale onPress={() => void copy(link)} hitSlop={8} accessibilityLabel="Copy link" style={tw`p-1.5`}>
                      <Ionicons name="copy-outline" size={17} color={theme.colors.ink2} />
                    </PressableScale>
                    <PressableScale
                      onPress={() => void share(link, p.instructor_name)}
                      hitSlop={8}
                      accessibilityLabel="Share link"
                      style={tw`p-1.5 ml-1`}
                    >
                      <Ionicons name="share-outline" size={17} color={theme.colors.ink2} />
                    </PressableScale>
                    <PressableScale
                      onPress={() => void remove(link, p.instructor_name)}
                      disabled={busy === link.id}
                      hitSlop={8}
                      accessibilityLabel="Remove link"
                      style={tw`p-1.5 ml-1`}
                    >
                      <Ionicons name="trash-outline" size={17} color={theme.colors.ink3} />
                    </PressableScale>
                  </View>
                </View>
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}
