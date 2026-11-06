import type {
  SessionFace,
  SessionSnapshot,
} from '@deepseek-ai/dsh-api-session-controller/client';

type PromptSession = Pick<SessionFace, 'beginSubmission' | 'prompt'>;

export function hasUnresolvedSubmission(
  snapshot: Pick<SessionSnapshot, 'pendingSubmissions'> | undefined,
): boolean {
  return (snapshot?.pendingSubmissions.length ?? 0) > 0;
}

export async function submitPrompt(
  session: PromptSession,
  text: string,
  signal?: AbortSignal,
) {
  if (!text.trim()) throw new Error('Prompt is empty');
  const submission = session.beginSubmission({
    mode: 'queue',
    text,
    attachments: [],
  });
  return session.prompt(
    [{ type: 'text', text }],
    'queue',
    signal,
    submission.requestId,
  );
}
