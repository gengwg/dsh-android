import * as SecureStore from 'expo-secure-store';

import { validateStoredCookies } from './cookie';
import { parseDshServerUrl } from './nativeTransport';
import type {
  CredentialStoreOptions,
  DshCredentials,
} from './types';

const STORAGE_KEY = 'dsh.connection.credentials.v1';
const MAX_STORED_LENGTH = 32768;

function normalizeCredentials(
  value: unknown,
  options: CredentialStoreOptions,
): DshCredentials {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid DSH credentials');
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.serverUrl !== 'string') {
    throw new Error('Invalid DSH credentials');
  }
  const server = parseDshServerUrl(record.serverUrl, options);
  const cookies = validateStoredCookies(record.cookies, {
    url: server,
    now: options.now,
  });
  return { version: 1, serverUrl: server.origin, cookies };
}

export async function loadCredentials(
  options: CredentialStoreOptions = {},
): Promise<DshCredentials | null> {
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    throw new Error('Could not read stored DSH credentials');
  }
  if (stored === null) return null;
  if (stored.length > MAX_STORED_LENGTH) {
    throw new Error('Stored DSH credentials are too large');
  }

  try {
    const credentials = normalizeCredentials(JSON.parse(stored), options);
    return credentials.cookies.length === 0 ? null : credentials;
  } catch {
    throw new Error('Stored DSH credentials are invalid');
  }
}

export async function saveCredentials(
  credentials: DshCredentials,
  options: CredentialStoreOptions = {},
): Promise<void> {
  let serialized: string;
  try {
    const normalized = normalizeCredentials(credentials, options);
    if (normalized.cookies.length === 0) {
      throw new Error('No reusable cookies');
    }
    serialized = JSON.stringify(normalized);
    if (serialized.length > MAX_STORED_LENGTH) {
      throw new Error('Credentials too large');
    }
  } catch {
    throw new Error('Invalid DSH credentials');
  }

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, serialized);
  } catch {
    // Native errors must not propagate a value containing authentication data.
    throw new Error('Could not store DSH credentials');
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    throw new Error('Could not clear stored DSH credentials');
  }
}
