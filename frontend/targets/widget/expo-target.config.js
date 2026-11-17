/**
 * Grow! Today — iOS home-screen / Lock Screen widget (WidgetKit + AppIntents).
 *
 * Built by @bacons/apple-targets on `npx expo prebuild -p ios`. Bundle id
 * becomes `app.growl.mobile.widget`; it shares the App Group with the app so
 * src/services/widgetSync.ts can hand it a JSON snapshot (UserDefaults key
 * `grow.widget.today`). Files in ./_shared are compiled into BOTH the widget
 * and the main app — the check-in AppIntent must live in the app too because
 * it sets `openAppWhenRun`.
 *
 * Re-run `npx expo prebuild -p ios --clean` after changing this file.
 */
const APP_GROUP = 'group.app.growl.mobile';

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'GrowWidget',
  displayName: 'Grow! Today',
  bundleIdentifier: '.widget',
  // iOS 17: interactive widgets (Button(intent:)) + containerBackground.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  colors: {
    $accent: '#059669',
    $widgetBackground: { light: '#FFFCF7', dark: '#1D1A17' },
    // Named colours used from SwiftUI (Color("GrowInk") …).
    GrowInk: { light: '#1C1917', dark: '#F5F1EA' },
    GrowMuted: { light: '#57534E', dark: '#C9C1B6' },
    GrowChip: { light: '#EAE4D6', dark: '#26221E' },
    GrowEmerald: { light: '#059669', dark: '#34D399' },
    GrowBackground: { light: '#FFFCF7', dark: '#1D1A17' },
  },
  entitlements: {
    'com.apple.security.application-groups': (config.ios &&
      config.ios.entitlements &&
      config.ios.entitlements['com.apple.security.application-groups']) || [APP_GROUP],
  },
});
