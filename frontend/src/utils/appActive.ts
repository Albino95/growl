import { AppState } from 'react-native';

let active = AppState.currentState === 'active';

AppState.addEventListener('change', (next) => {
  active = next === 'active';
});

/** True when the app is in the foreground — skip background polls. */
export function isAppActive(): boolean {
  return active;
}
