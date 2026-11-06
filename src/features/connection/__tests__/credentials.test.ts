import * as SecureStore from 'expo-secure-store';

import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '../credentials';
import type { DshCredentials } from '../types';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const NOW = Date.parse('2026-11-04T20:00:00Z');
const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);

function credentials(): DshCredentials {
  return {
    version: 1,
    serverUrl: 'https://dsh.test',
    cookies: [
      {
        name: 'dsh-auth-test',
        value: 'test-cookie-value',
        domain: 'dsh.test',
        path: '/',
        hostOnly: true,
        secure: true,
        httpOnly: true,
        sameSite: 'Strict',
        expiresAt: NOW + 60_000,
      },
    ],
  };
}

describe('DSH credential storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setItem.mockResolvedValue(undefined);
    deleteItem.mockResolvedValue(undefined);
  });

  it('saves, loads, and clears reusable server cookies only', async () => {
    const withLaunchToken = {
      ...credentials(),
      launchToken: 'test-token-that-must-not-be-persisted',
    };
    await saveCredentials(withLaunchToken, { now: NOW });

    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, serialized] = setItem.mock.calls[0];
    expect(key).toBe('dsh.connection.credentials.v1');
    expect(serialized).not.toContain('test-token-that-must-not-be-persisted');
    getItem.mockResolvedValue(serialized);

    await expect(loadCredentials({ now: NOW + 1000 })).resolves.toEqual(
      credentials(),
    );
    await clearCredentials();
    expect(deleteItem).toHaveBeenCalledWith(key);
  });

  it('returns null for missing or expired credentials', async () => {
    getItem.mockResolvedValueOnce(null);
    await expect(loadCredentials({ now: NOW })).resolves.toBeNull();

    getItem.mockResolvedValueOnce(JSON.stringify(credentials()));
    await expect(loadCredentials({ now: NOW + 61_000 })).resolves.toBeNull();
  });

  it('rejects malformed persisted data without echoing its contents', async () => {
    getItem.mockResolvedValue('{"version":1,"serverUrl":42}');
    await expect(loadCredentials({ now: NOW })).rejects.toThrow(
      'Stored DSH credentials are invalid',
    );

    getItem.mockResolvedValue(`not-json-test-cookie-value`);
    await expect(loadCredentials({ now: NOW })).rejects.toThrow(
      'Stored DSH credentials are invalid',
    );
  });

  it('redacts native SecureStore failures', async () => {
    setItem.mockRejectedValue(
      new Error('native failure containing test-cookie-value'),
    );

    let message = '';
    try {
      await saveCredentials(credentials(), { now: NOW });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Could not store DSH credentials');
    expect(message).not.toContain('test-cookie-value');
  });

  it('requires the explicit HTTP option when loading HTTP credentials', async () => {
    const insecure = {
      ...credentials(),
      serverUrl: 'http://localhost:8080',
      cookies: credentials().cookies.map((cookie) => ({
        ...cookie,
        domain: 'localhost',
        secure: false,
      })),
    };
    getItem.mockResolvedValue(JSON.stringify(insecure));

    await expect(loadCredentials({ now: NOW })).rejects.toThrow(
      'Stored DSH credentials are invalid',
    );
    await expect(
      loadCredentials({ now: NOW, allowInsecureHttp: true }),
    ).resolves.toEqual(insecure);
  });
});
