import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { DshConnectionController, type ConnectionSnapshot } from './connectionController';
import { useObservable } from '../client/useObservable';

interface ConnectionContextValue {
  controller: DshConnectionController;
  snapshot: ConnectionSnapshot;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export function ConnectionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new DshConnectionController());
  const snapshot = useObservable(controller) ?? controller.getSnapshot();

  useEffect(() => {
    void controller.restore();
    return () => {
      void controller.dispose();
    };
  }, [controller]);

  const value = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error('Connection provider is not available');
  return value;
}
