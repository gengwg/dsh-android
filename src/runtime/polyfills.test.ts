import { installRuntimePolyfills } from './polyfills';

describe('runtime polyfills', () => {
  it('installs secure random values without replacing an existing implementation', () => {
    const root: { crypto?: Partial<Pick<Crypto, 'getRandomValues'>> } = {};
    installRuntimePolyfills(root);
    expect(typeof root.crypto?.getRandomValues).toBe('function');

    const existing = jest.fn();
    root.crypto = { getRandomValues: existing };
    installRuntimePolyfills(root);
    expect(root.crypto?.getRandomValues).toBe(existing);
  });
});
