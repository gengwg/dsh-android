import { createContext, useContext, type PropsWithChildren } from 'react';

import { useObservable } from '../client/useObservable';
import type { NativeInteractionController } from './interactionController';

const InteractionContext = createContext<NativeInteractionController | undefined>(undefined);

export function InteractionProvider({
  controller,
  children,
}: PropsWithChildren<{ controller: NativeInteractionController }>) {
  return <InteractionContext.Provider value={controller}>{children}</InteractionContext.Provider>;
}

export function useNativeInteractions(): NativeInteractionController {
  const controller = useContext(InteractionContext);
  if (!controller) throw new Error('Native interactions are not available');
  return controller;
}

export function useInteractionSnapshot() {
  return useObservable(useNativeInteractions());
}
