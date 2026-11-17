/** Locally hidden insight ids (per device). */
import { getLocalItem, setLocalItem } from '../../services/storage/localStore';
import { parseHiddenIds } from './insightsMath';

const KEY = 'insights-hidden-v1';

export async function loadHiddenInsights(): Promise<Set<string>> {
  return parseHiddenIds(await getLocalItem(KEY));
}

export async function saveHiddenInsights(ids: ReadonlySet<string>): Promise<void> {
  await setLocalItem(KEY, JSON.stringify([...ids].slice(-200)));
}
