import { useMemo, useState } from 'react';
import type { MapStyleId } from '../../shared/types';

const storageKey = (owner: string) => `manzil-local-map-style-v1:${owner}`;
function readStyle(owner: string): MapStyleId {
  try {
    const saved = localStorage.getItem(storageKey(owner));
    if (saved === 'minimal' || saved === 'outdoors' || saved === 'night') return saved;
  } catch { /* A browser that blocks storage can still keep a session choice. */ }
  return 'minimal';
}

/** Local's browser preference is independent of the account's driving-map style. */
export function useLocalMapStyle(userId?: string) {
  const owner = userId ? `user:${userId}` : 'guest';
  const stored = useMemo(() => readStyle(owner), [owner]);
  const [choices, setChoices] = useState<Record<string, MapStyleId>>({});
  const style = choices[owner] ?? stored;
  function changeStyle(next: MapStyleId) {
    if (next !== 'minimal' && next !== 'outdoors' && next !== 'night') return;
    try { localStorage.setItem(storageKey(owner), next); } catch { /* Session fallback. */ }
    setChoices(previous => ({ ...previous, [owner]: next }));
  }
  return [style, changeStyle] as const;
}
