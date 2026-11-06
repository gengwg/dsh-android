import * as SecureStore from 'expo-secure-store';

import { loadDraft, MAX_SAVED_DRAFT_CHARS, saveDraft } from './drafts';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const setItemAsync = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

describe('draft storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads a per-session draft', async () => {
    getItemAsync.mockResolvedValue('Saved draft');
    await expect(loadDraft('session-1')).resolves.toBe('Saved draft');
    expect(getItemAsync).toHaveBeenCalledWith('dsh.android.draft.session-1');
  });

  it('deletes an empty draft and saves a bounded nonempty draft', async () => {
    await expect(saveDraft('session-1', '')).resolves.toBe('saved');
    expect(deleteItemAsync).toHaveBeenCalledWith('dsh.android.draft.session-1');

    await expect(saveDraft('session-1', 'Next prompt')).resolves.toBe('saved');
    expect(setItemAsync).toHaveBeenCalledWith('dsh.android.draft.session-1', 'Next prompt');
  });

  it('keeps oversized drafts in memory instead of risking native storage failure', async () => {
    const text = 'x'.repeat(MAX_SAVED_DRAFT_CHARS + 1);
    await expect(saveDraft('session-1', text)).resolves.toBe('memory-only');
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('waits for a pending write before reading a reopened draft', async () => {
    let resolveWrite: (() => void) | undefined;
    const order: string[] = [];
    setItemAsync.mockImplementation(() => new Promise<void>((resolve) => {
      resolveWrite = () => {
        order.push('write');
        resolve();
      };
    }));
    getItemAsync.mockImplementation(async () => {
      order.push('read');
      return 'new';
    });

    const saving = saveDraft('session-1', 'new');
    const loading = loadDraft('session-1');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getItemAsync).not.toHaveBeenCalled();

    resolveWrite?.();
    await saving;
    await expect(loading).resolves.toBe('new');
    expect(order).toEqual(['write', 'read']);
  });

  it('serializes an older write behind a newer deletion', async () => {
    let resolveWrite: (() => void) | undefined;
    setItemAsync.mockImplementation(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));

    const saving = saveDraft('session-1', 'old');
    const deleting = saveDraft('session-1', '');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(deleteItemAsync).not.toHaveBeenCalled();

    resolveWrite?.();
    await saving;
    await deleting;
    expect(setItemAsync).toHaveBeenCalledWith('dsh.android.draft.session-1', 'old');
    expect(deleteItemAsync).toHaveBeenCalledWith('dsh.android.draft.session-1');
  });
});
