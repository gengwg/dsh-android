import type {
  SessionReference,
} from '@deepseek-ai/dsh-api-session-controller/client';
import { SessionId } from '@deepseek-ai/dsh-session/types';
import { useEffect, useMemo, useState } from 'react';

import { useDshClient } from '../client/DshClientProvider';
import { useObservable } from '../client/useObservable';
import { useNativeInteractions } from '../interactions/InteractionProvider';
import { SessionQuestionCards } from '../interactions/sessionQuestions';
import { projectConversation } from './conversation';

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    mobileConversation: unknown;
  }
}

export function useConversation(sessionId: string) {
  const { sessions, remote } = useDshClient();
  const interactions = useNativeInteractions();
  const [reference, setReference] = useState<SessionReference>();
  const [questionCards, setQuestionCards] = useState<SessionQuestionCards>();

  useEffect(() => {
    let active = true;
    const next = sessions.retain(SessionId(sessionId), {
      source: 'mobileConversation',
    });
    const cards = new SessionQuestionCards(next.binding.session, interactions, remote.userQuestions);
    void Promise.resolve().then(() => {
      if (active) {
        setReference(next);
        setQuestionCards(cards);
      } else {
        cards.dispose();
      }
    });
    void next.ready.catch(() => {
      // The authoritative session snapshot exposes openState/openError.
    });
    return () => {
      active = false;
      cards.dispose();
      next.release();
      setReference(undefined);
      setQuestionCards(undefined);
    };
  }, [interactions, remote, sessionId, sessions]);

  const session = useObservable(reference?.binding.session);
  const eventWindow = useObservable(reference?.binding.eventSource);
  const questions = useObservable(questionCards);
  const rows = useMemo(
    () => projectConversation(
      eventWindow?.entries ?? [],
      session?.pendingSubmissions ?? [],
    ),
    [eventWindow, session],
  );

  return { reference, session, eventWindow, rows, questionCards, questions };
}
