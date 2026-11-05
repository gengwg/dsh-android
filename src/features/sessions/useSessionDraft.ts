import { useCallback, useEffect, useState } from 'react';

import { loadDraft, saveDraft } from './drafts';

export function useSessionDraft(sessionId: string) {
  const [draft, setDraft] = useState('');
  const [loadedFor, setLoadedFor] = useState<string>();
  const [persistence, setPersistence] = useState<'saved' | 'memory-only'>('saved');
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let active = true;
    void loadDraft(sessionId).then((text) => {
      if (!active) return;
      setDraft(text);
      setLoadedFor(sessionId);
    }).catch(() => {
      if (!active) return;
      setStorageError(true);
      setLoadedFor(sessionId);
    });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const persistDraft = useCallback(async (text: string) => {
    if (loadedFor !== sessionId) return;
    try {
      const result = await saveDraft(sessionId, text);
      setPersistence(result);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [loadedFor, sessionId]);

  useEffect(() => {
    if (loadedFor !== sessionId) return;
    const timeout = setTimeout(() => {
      void persistDraft(draft);
    }, 500);
    return () => clearTimeout(timeout);
  }, [draft, loadedFor, persistDraft, sessionId]);

  return {
    draft,
    setDraft,
    loading: loadedFor !== sessionId,
    persistence,
    persistDraft,
    storageError,
  };
}
