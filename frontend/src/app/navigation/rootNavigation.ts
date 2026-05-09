import { CommonActions } from '@react-navigation/native';

/** Walk up to the tree root (e.g. from a tab inside Business → Business stack → root). */
export function getRootNavigator(navigation: { getParent?: () => any } | null | undefined): any {
  let current: any = navigation;
  while (current?.getParent?.()) {
    current = current.getParent();
  }
  return current;
}

export function resetNavigationToAuth(navigation: { getParent?: () => any } | null | undefined): void {
  const root = getRootNavigator(navigation);
  root?.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    })
  );
}

export function navigateFromRoot(
  navigation: { getParent?: () => any } | null | undefined,
  routeName: string,
  params?: object
): void {
  const root = getRootNavigator(navigation);
  root?.navigate(routeName as never, params as never);
}
