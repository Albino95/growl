import React, { useEffect, useState } from 'react';
import { View, Text, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { toast } from '../../state/useToastStore';
import { feedback } from '../../utils/interactionFeedback';
import { copyText } from '../../screens/Invite/inviteHelpers';
import { listMyPartnerLinks, type PartnerLink } from '../../services/api/bizInsights';

/**
 * Instructor Hub → Partners: links businesses made for you, with taps and saves.
 * Renders nothing until there is at least one link (or on servers without the feature).
 */
export default function MyPartnerLinksCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [links, setLinks] = useState<PartnerLink[]>([]);

  useEffect(() => {
    let alive = true;
    listMyPartnerLinks()
      .then((res) => {
        if (alive) setLinks(res ?? []);
      })
      .catch(() => {
        /* optional card */
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!links.length) return null;

  const copy = async (link: PartnerLink) => {
    if (await copyText(link.url)) {
      feedback.success();
      toast.success('Link copied');
    }
  };

  const share = async (link: PartnerLink) => {
    try {
      await Share.share({
        message: `Gear I trust from ${link.business?.name ?? 'my partner'} on Grow!: ${link.url}`,
        url: link.url,
      });
    } catch {
      /* dismissed */
    }
  };

  return (
    <View style={tw`mb-6`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`} accessibilityRole="header">
        Your partner links
      </Text>
      <Text style={tw`text-footnote text-ink-3 mb-2 leading-5`}>
        Share these with your people. Taps and saves within 7 days count for you.
      </Text>
      {links.map((link, i) => (
        <View key={link.id} style={tw`py-3 ${i < links.length - 1 ? 'border-b border-line/80' : ''}`}>
          <View style={tw`flex-row items-center`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`text-sm font-semibold text-ink`} numberOfLines={1}>
                {link.business?.name ?? 'Partner'}
                {link.product_name ? ` · ${link.product_name}` : ''}
              </Text>
              <Text style={[tw`text-xs text-ink-3 mt-0.5`, { fontVariant: ['tabular-nums'] }]}>
                {link.clicks} tap{link.clicks === 1 ? '' : 's'} · {link.saves_attributed} save
                {link.saves_attributed === 1 ? '' : 's'}
              </Text>
            </View>
            <PressableScale onPress={() => void copy(link)} hitSlop={8} accessibilityLabel="Copy link" style={tw`p-1.5`}>
              <Ionicons name="copy-outline" size={17} color={theme.colors.ink2} />
            </PressableScale>
            <PressableScale onPress={() => void share(link)} hitSlop={8} accessibilityLabel="Share link" style={tw`p-1.5 ml-1`}>
              <Ionicons name="share-outline" size={17} color={theme.colors.ink2} />
            </PressableScale>
          </View>
        </View>
      ))}
    </View>
  );
}
