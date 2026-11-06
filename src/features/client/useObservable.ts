import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import { useCallback, useSyncExternalStore } from 'react';

const NOOP_UNSUBSCRIBE = () => {};

export function useObservable<T>(
  source: ObservableSnapshot<T> | undefined,
): T | undefined {
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? NOOP_UNSUBSCRIBE,
    [source],
  );
  const getSnapshot = useCallback(() => source?.getSnapshot(), [source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
