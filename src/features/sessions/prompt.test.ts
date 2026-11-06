import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client';

import { hasUnresolvedSubmission, submitPrompt } from './prompt';

function makeSession() {
  const submission: ReturnType<SessionFace['beginSubmission']> = {
    requestId: 'request-1' as ReturnType<SessionFace['beginSubmission']>['requestId'],
    abandon: jest.fn(),
  };
  const beginSubmission = jest.fn<
    ReturnType<SessionFace['beginSubmission']>,
    Parameters<SessionFace['beginSubmission']>
  >().mockReturnValue(submission);
  const prompt = jest.fn<
    ReturnType<SessionFace['prompt']>,
    Parameters<SessionFace['prompt']>
  >();
  return { beginSubmission, prompt, submission };
}

describe('submitPrompt', () => {
  it('uses one official submission identity for the prompt', async () => {
    const session = makeSession();
    session.prompt.mockResolvedValue({ ok: true, value: { accepted: true } });

    await expect(submitPrompt(session, 'Hello')).resolves.toMatchObject({ ok: true });
    expect(session.beginSubmission).toHaveBeenCalledWith({
      mode: 'queue', text: 'Hello', attachments: [],
    });
    expect(session.prompt).toHaveBeenCalledWith(
      [{ type: 'text', text: 'Hello' }],
      'queue',
      undefined,
      session.submission.requestId,
    );
  });

  it('rejects empty input before creating an echo', async () => {
    const session = makeSession();
    await expect(submitPrompt(session, '  ')).rejects.toThrow('Prompt is empty');
    expect(session.beginSubmission).not.toHaveBeenCalled();
  });

  it('does not retry or abandon an uncertain prompt automatically', async () => {
    const session = makeSession();
    session.prompt.mockRejectedValue(new Error('Connection lost'));

    await expect(submitPrompt(session, 'Hello')).rejects.toThrow('Connection lost');
    expect(session.prompt).toHaveBeenCalledTimes(1);
    expect(session.submission.abandon).not.toHaveBeenCalled();
  });

  it('blocks a new send while the official snapshot retains an unresolved echo', () => {
    expect(hasUnresolvedSubmission(undefined)).toBe(false);
    expect(hasUnresolvedSubmission({ pendingSubmissions: [] })).toBe(false);
    expect(hasUnresolvedSubmission({
      pendingSubmissions: [{
        requestId: 'request-1' as ReturnType<SessionFace['beginSubmission']>['requestId'],
        placement: 'transcript', time: 1, text: 'Hello', attachments: [],
      }],
    })).toBe(true);
  });
});
