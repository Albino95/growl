import React, { memo, useMemo } from 'react';
import { Text, Linking, type StyleProp, type TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../lib/tw';
import { haptic } from '../../theme/haptics';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { resolveMentionUsername } from '../../services/api/mentions';
import { toast } from '../../state/useToastStore';
import { tokenizeRichText } from './richTextTokens';

type Props = {
  text: string | null | undefined;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Rendered before the text inside the same <Text> (e.g. a leading space). */
  prefix?: string;
  /** Called before navigating away (e.g. close the comments sheet). */
  onNavigate?: () => void;
  /** Override colours on dark media (composer preview). */
  mentionColor?: string;
  tagColor?: string;
  linkColor?: string;
};

/**
 * Caption / comment text with tappable @mentions (→ profile), #tags (→ Explore
 * search) and links. Scheme-aware colours; each token is an accessible link.
 */
function RichText({
  text,
  style,
  numberOfLines,
  prefix,
  onNavigate,
  mentionColor,
  tagColor,
  linkColor,
}: Props) {
  const navigation = useNavigation();
  const tokens = useMemo(() => tokenizeRichText(text), [text]);
  const hasRich = tokens.some((t) => t.type !== 'text');

  if (!hasRich) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {prefix}
        {text}
      </Text>
    );
  }

  const openMention = async (username: string) => {
    haptic('tapLight');
    const user = await resolveMentionUsername(username);
    if (!user) {
      toast.info(`We couldn’t find @${username}`);
      return;
    }
    onNavigate?.();
    navigateFromRoot(navigation, 'PublicProfile', {
      userId: user.id,
      preview: {
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
  };

  const openTag = (tag: string) => {
    haptic('tapLight');
    onNavigate?.();
    navigateFromRoot(navigation, 'Individual', { screen: 'Explore', params: { query: `#${tag}` } });
  };

  const openLink = (url: string) => {
    haptic('tapLight');
    void Linking.openURL(url).catch(() => undefined);
  };

  const ink = mentionColor ?? theme.colors.ink;
  const leaf = tagColor ?? theme.colors.leafInk;
  const link = linkColor ?? theme.colors.leafInk;

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {prefix}
      {tokens.map((t, i) => {
        switch (t.type) {
          case 'mention':
            return (
              <Text
                key={i}
                onPress={() => void openMention(t.username)}
                suppressHighlighting={false}
                accessibilityRole="link"
                accessibilityLabel={`${t.text}, open profile`}
                style={{ color: ink, fontWeight: '600' }}
              >
                {t.text}
              </Text>
            );
          case 'tag':
            return (
              <Text
                key={i}
                onPress={() => openTag(t.tag)}
                accessibilityRole="link"
                accessibilityLabel={`${t.text}, search posts`}
                style={{ color: leaf, fontWeight: '600' }}
              >
                {t.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                onPress={() => openLink(t.url)}
                accessibilityRole="link"
                accessibilityLabel={`Link, ${t.text}`}
                style={{ color: link, textDecorationLine: 'underline' }}
              >
                {t.text}
              </Text>
            );
          default:
            return <React.Fragment key={i}>{t.text}</React.Fragment>;
        }
      })}
    </Text>
  );
}

export default memo(RichText);
