import { getRandomValues } from 'expo-crypto';

type RuntimeGlobal = {
  crypto?: Partial<Pick<Crypto, 'getRandomValues'>>;
};

export function installRuntimePolyfills(root: RuntimeGlobal = globalThis): void {
  if (typeof root.crypto?.getRandomValues !== 'function') {
    Object.defineProperty(root, 'crypto', {
      value: { ...root.crypto, getRandomValues },
      configurable: true,
      writable: true,
    });
  }
  if (typeof Symbol.dispose !== 'symbol') {
    Object.defineProperty(Symbol, 'dispose', {
      value: Symbol.for('Symbol.dispose'),
    });
  }
}
