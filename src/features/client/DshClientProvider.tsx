import type { Context } from '@deepseek-ai/cordis';
import { createContext, useContext, type PropsWithChildren } from 'react';

import { useObservable } from './useObservable';

const DshClientContext = createContext<Context | undefined>(undefined);

export function DshClientProvider({
  context,
  children,
}: PropsWithChildren<{ context: Context }>) {
  return (
    <DshClientContext.Provider value={context}>
      {children}
    </DshClientContext.Provider>
  );
}

export function useDshClient(): Context {
  const context = useContext(DshClientContext);
  if (!context) {
    throw new Error('DSH client is not available');
  }
  return context;
}

export function useWorkspaceSnapshot() {
  return useObservable(useDshClient().workspaces.list);
}

export function useSessionListSnapshot() {
  return useObservable(useDshClient().sessions.list);
}
