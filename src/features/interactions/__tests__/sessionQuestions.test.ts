import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import type {
  PendingUserQuestion,
  UserQuestionProjectionView,
} from '@deepseek-ai/dsh-user-questions/types';

import { NativeInteractionController } from '../interactionController';
import { SessionQuestionCards } from '../sessionQuestions';
import type { UserQuestionsRemote } from '../types';

const SESSION_ID = 'session-1' as SessionId;
const CALL_ID = 'call-1' as ToolCallId;
const QUESTION = {
  id: 'choice',
  question: 'Choose one',
  options: [{ label: 'One' }, { label: 'Two' }],
};
const INPUT = [{ id: 'choice', selected: ['One'] }];
const ANSWER = { answers: [{ id: 'choice', selected: ['One'] }] };

class FakeProjection {
  private readonly listeners = new Set<() => void>();

  constructor(private value: UserQuestionProjectionView | undefined) {}

  getSnapshot = (): UserQuestionProjectionView | undefined => this.value;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  publish(value: UserQuestionProjectionView | undefined): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}

function questionRow(state: PendingUserQuestion['state']): PendingUserQuestion {
  return { callId: CALL_ID, questions: [QUESTION], state };
}

function sessionWith(projection: FakeProjection): SessionFace {
  return {
    sessionId: SESSION_ID,
    projections: { faceOf: () => projection },
  } as unknown as SessionFace;
}

function answerRemote(): jest.MockedFunction<UserQuestionsRemote['answer']> {
  return jest.fn<
    ReturnType<UserQuestionsRemote['answer']>,
    Parameters<UserQuestionsRemote['answer']>
  >();
}

describe('SessionQuestionCards', () => {
  it('observes active rows and answers open rows through the waterfall', async () => {
    const projection = new FakeProjection({ active: [questionRow('open')], settled: [] });
    const interactions = new NativeInteractionController();
    const remote = answerRemote();
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      interactions,
      { answer: remote },
    );
    const result = interactions.receiveQuestions(
      SESSION_ID,
      { questions: [QUESTION], wait: { callId: CALL_ID } },
      { attachWait: jest.fn() } as unknown as Pick<UserQuestionsRemote, 'attachWait'>,
      async () => ANSWER,
    );

    expect(cards.getSnapshot()?.active).toEqual([
      expect.objectContaining({
        callId: CALL_ID,
        questions: [QUESTION],
        state: 'open',
        submission: 'answerable',
      }),
    ]);
    expect(cards.answerOpen(CALL_ID, INPUT)).toBe(true);
    await expect(result).resolves.toEqual(ANSWER);
    expect(remote).not.toHaveBeenCalled();
    expect(cards.answerOpen(CALL_ID, INPUT)).toBe(false);
  });

  it('preserves a true continued result and disables a second reply', async () => {
    const projection = new FakeProjection({ active: [questionRow('continued')], settled: [] });
    const remote = answerRemote();
    remote.mockResolvedValue({ ok: true, value: true });
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      new NativeInteractionController(),
      { answer: remote },
    );

    const submission = cards.answerContinued(CALL_ID, INPUT);
    expect(cards.getSnapshot()?.active[0]?.submission).toBe('submitting');
    await expect(submission).resolves.toEqual({ ok: true, value: true });
    expect(remote).toHaveBeenCalledWith(SESSION_ID, CALL_ID, ANSWER);
    expect(cards.getSnapshot()?.active[0]?.submission).toBe('answered');
    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toMatchObject({
      name: 'UserQuestionError',
      code: 'REPLY_QUEUED',
      message: 'a reply is already queued for this question',
    });
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('marks a false continued result as no longer answerable', async () => {
    const projection = new FakeProjection({ active: [questionRow('continued')], settled: [] });
    const remote = answerRemote();
    remote.mockResolvedValue({ ok: true, value: false });
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      new NativeInteractionController(),
      { answer: remote },
    );

    await expect(cards.answerContinued(CALL_ID, INPUT)).resolves.toEqual({
      ok: true,
      value: false,
    });
    expect(cards.getSnapshot()?.active[0]?.submission).toBe('unavailable');
    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toThrow(
      'this question is no longer answerable',
    );
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('keeps a transport-uncertain continued reply non-answerable', async () => {
    const projection = new FakeProjection({ active: [questionRow('continued')], settled: [] });
    const remote = answerRemote();
    remote.mockRejectedValue(new Error('connection lost'));
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      new NativeInteractionController(),
      { answer: remote },
    );

    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toThrow('connection lost');
    expect(cards.getSnapshot()?.active[0]?.submission).toBe('uncertain');
    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toThrow(
      'this question is no longer answerable',
    );
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('treats a gateway carrier result as uncertain rather than answerable', async () => {
    const projection = new FakeProjection({ active: [questionRow('continued')], settled: [] });
    const remote = answerRemote();
    remote.mockResolvedValue({
      ok: false,
      error: new RemoteError('gateway/internal', 'connection lost', {}),
    });
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      new NativeInteractionController(),
      { answer: remote },
    );

    await expect(cards.answerContinued(CALL_ID, INPUT)).resolves.toMatchObject({ ok: false });
    expect(cards.getSnapshot()?.active[0]?.submission).toBe('uncertain');
    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toThrow(
      'this question is no longer answerable',
    );
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('closes a continued card without sending anything', async () => {
    const projection = new FakeProjection({ active: [questionRow('continued')], settled: [] });
    const remote = answerRemote();
    const cards = new SessionQuestionCards(
      sessionWith(projection),
      new NativeInteractionController(),
      { answer: remote },
    );

    cards.closeContinued(CALL_ID);
    expect(cards.getSnapshot()?.active).toEqual([]);
    await expect(cards.answerContinued(CALL_ID, INPUT)).rejects.toThrow(
      'this question is no longer answerable',
    );
    expect(remote).not.toHaveBeenCalled();
  });
});
