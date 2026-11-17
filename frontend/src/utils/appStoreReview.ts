import { Linking, Platform } from 'react-native';
import { feedback } from './interactionFeedback';
import { alertMessage } from './confirmDialog';

const APP_ID = '6809046287';
const ITUNES = `itms-apps://itunes.apple.com/app/id${APP_ID}?action=write-review`;
const HTTPS = `https://apps.apple.com/app/id${APP_ID}?action=write-review`;

/** Open the App Store write-review sheet. iOS only in product copy. */
export async function openAppStoreReview() {
  feedback.send();
  const preferred = Platform.OS === 'ios' ? ITUNES : HTTPS;
  try {
    const can = await Linking.canOpenURL(preferred);
    await Linking.openURL(can ? preferred : HTTPS);
  } catch {
    alertMessage('Could not open', 'Search Grow! on the App Store when you have a second.');
  }
}
