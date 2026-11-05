import * as SecureStore from 'expo-secure-store';

const DRAFT_KEY_PREFIX = 'dsh.android.draft.';
export const MAX_SAVED_DRAFT_CHARS = 16_000;

const writes = new Map<string, Promise<void>>();

function draftKey(sessionId: string): string {
  return `${DRAFT_KEY_PREFIX}${sessionId}`;
}

export async function loadDraft(sessionId: string): Promise<string> {
  await writes.get(sessionId)?.catch(() => {});
  return await SecureStore.getItemAsync(draftKey(sessionId)) ?? '';
}

async function writeDraft(sessionId: string, text: string): Promise<'saved' | 'memory-only'> {
  if (!text) {
    await SecureStore.deleteItemAsync(draftKey(sessionId));
    return 'saved';
  }
  if (text.length > MAX_SAVED_DRAFT_CHARS) return 'memory-only';
  await SecureStore.setItemAsync(draftKey(sessionId), text);
  return 'saved';
}

export function saveDraft(
  sessionId: string,
  text: string,
): Promise<'saved' | 'memory-only'> {
  const previous = writes.get(sessionId) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => writeDraft(sessionId, text));
  const tail = result.then(() => {}, () => {});
  writes.set(sessionId, tail);
  return result.finally(() => {
    if (writes.get(sessionId) === tail) writes.delete(sessionId);
  });
}
