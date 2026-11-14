/**
 * React Navigation deep-link config for growth-system links.
 *
 *   growl://invite/<code>            → InviteRedeem
 *   https://letsgrow.lu/i/<code>     → InviteRedeem (universal link, once associated domains are set up)
 *   growl://challenge/<id>           → ChallengeDetail
 *
 * Everything else (growl://checkout/…, growl://reset-password…, other web
 * paths) is filtered out so App.tsx's manual checkout handler keeps owning it
 * and unknown URLs never reset the navigation state.
 *
 * Widget links (growl://home, growl://checkin?mood=…) are also filtered out
 * here but handed to services/widgetLinks, which navigates + checks in itself
 * once auth has hydrated (cold start via getInitialURL, warm via subscribe).
 *
 * App.tsx keys <NavigationContainer> by auth token, so it remounts on sign
 * in/out. `getInitialURL` therefore hands out the cold-start URL only once per
 * process — otherwise every remount would re-open the same invite.
 */
import { Linking } from 'react-native';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';
import { handleWidgetUrl } from '../../services/widgetLinks';

export const LINK_PREFIXES = ['growl://', 'https://letsgrow.lu', 'https://www.letsgrow.lu'];

const HANDLED = /^(?:growl:\/\/|https:\/\/(?:www\.)?letsgrow\.lu\/)(?:invite|i|challenge)\/[^/?#]+/i;

/** True for URLs this config routes (invite / challenge). */
export function isGrowthDeepLink(url: string | null | undefined): url is string {
  return !!url && HANDLED.test(url);
}

let initialConsumed = false;

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: LINK_PREFIXES,
  filter: (url) => isGrowthDeepLink(url),
  async getInitialURL() {
    if (initialConsumed) return null;
    initialConsumed = true;
    try {
      const url = await Linking.getInitialURL();
      if (handleWidgetUrl(url)) return null;
      return isGrowthDeepLink(url) ? url : null;
    } catch {
      return null;
    }
  },
  subscribe(listener) {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (handleWidgetUrl(url)) return;
      if (isGrowthDeepLink(url)) listener(url);
    });
    return () => sub.remove();
  },
  config: {
    screens: {
      InviteRedeem: {
        // Both the app scheme path and the short web path share one screen.
        path: 'invite/:code',
        alias: ['i/:code'],
        parse: { code: (c: string) => decodeURIComponent(c).trim().toUpperCase() },
      },
      ChallengeDetail: {
        path: 'challenge/:challengeId',
        parse: { challengeId: (id: string) => decodeURIComponent(id) },
      },
    },
  },
};

export default linking;
