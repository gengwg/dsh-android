import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types';

import { NativeInteractionController } from '../interactionController';
import { buildQuestionAnswer } from '../questionAnswer';
import type {
  ApprovalDeliveryRequest,
  QuestionAnswerInput,
  QuestionDeliveryRequest,
  QuestionInteractionCard,
  UserQuestionsRemote,
} from '../types';

const SESSION_ID = 'session-1' as SessionId;
const CALL_ID = 'call-1' as ToolCallId;
const QUESTIONS: AskUserQuestionItem[] = [
  { id: 'permission', question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] },
  {
    id: 'colors',
    question: 'Choose colors',
    options: [{ label: 'Red' }, { label: 'Blue' }],
    multiSelect: true,
  },
  { id: 'notes', question: 'Anything else?' },
];
const VALID_INPUT: QuestionAnswerInput[] = [
  { id: 'permission', selected: ['Yes'] },
  { id: 'colors', selected: ['Red', 'Blue'], custom: 'Green' },
  { id: 'notes', selected: [] },
];
const VALID_ANSWER = buildQuestionAnswer(QUESTIONS, VALID_INPUT);

function approvalRequest(): ApprovalDeliveryRequest {
  return { toolName: 'Bash', callId: CALL_ID, reason: 'Run the test command' };
}

function questionRequest(wait?: QuestionDeliveryRequest['wait']): QuestionDeliveryRequest {
  return { questions: QUESTIONS, ...(wait === undefined ? {} : { wait }) };
}

function approvalNext(): jest.MockedFunction<() => Promise<ApprovalOutcome>> {
  return jest.fn(async () => 'unavailable' as const);
}

function questionNext(): jest.MockedFunction<() => Promise<AskUserQuestionAnswer>> {
  return jest.fn(async () => VALID_ANSWER);
}

function unusedRemote(): Pick<UserQuestionsRemote, 'attachWait'> {
  return { attachWait: jest.fn() } as unknown as Pick<UserQuestionsRemote, 'attachWait'>;
}

function makeClaim(remainingMs = 50): {
  claim: RemoteStreamHandle<{ remainingMs: number }, never>;
  dispose: jest.MockedFunction<() => void>;
} {
  const closed = Promise.withResolvers<IteratorResult<{ remainingMs: number }>>();
  const dispose = jest.fn<void, []>(() => {
    closed.resolve({ done: true, value: undefined });
  });
  const next = jest.fn<Promise<IteratorResult<{ remainingMs: number }>>, []>();
  next.mockResolvedValueOnce({ done: false, value: { remainingMs } });
  next.mockReturnValueOnce(closed.promise);
  return {
    claim: {
      [Symbol.asyncIterator]: () => ({ next }),
      dispose,
      send: (_item: never) => {},
      end: () => {},
    },
    dispose,
  };
}

function timedRemote(claim: RemoteStreamHandle<{ remainingMs: number }, never>): {
  remote: Pick<UserQuestionsRemote, 'attachWait'>;
  attachWait: jest.MockedFunction<UserQuestionsRemote['attachWait']>;
} {
  const attachWait = jest.fn<
    ReturnType<UserQuestionsRemote['attachWait']>,
    Parameters<UserQuestionsRemote['attachWait']>
  >().mockReturnValue(claim);
  return { remote: { attachWait }, attachWait };
}

async function flushClaim(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('question answer mapping', () => {
  it('maps every id once in request order and applies custom/select rules', () => {
    const answer = buildQuestionAnswer(QUESTIONS, [
      { id: 'colors', selected: ['Red', 'Blue'], custom: '  Green  ' },
      { id: 'notes', selected: [] },
      { id: 'permission', selected: ['Yes'], custom: '  Use a custom answer  ' },
    ]);

    expect(answer).toEqual({
      answers: [
        { id: 'permission', selected: [], custom: 'Use a custom answer' },
        { id: 'colors', selected: ['Red', 'Blue'], custom: 'Green' },
        { id: 'notes', selected: [] },
      ],
    });
  });

  it('rejects incomplete, duplicate, unknown, and invalid selections', () => {
    expect(() => buildQuestionAnswer(QUESTIONS, VALID_INPUT.slice(1)))
      .toThrow('Every question must be answered exactly once');
    expect(() => buildQuestionAnswer(QUESTIONS, [
      ...VALID_INPUT,
      { id: 'notes', selected: [] },
    ])).toThrow('answered more than once');
    expect(() => buildQuestionAnswer(QUESTIONS, [
      ...VALID_INPUT.slice(1),
      { id: 'unknown', selected: [] },
    ])).toThrow('Unknown question id');
    expect(() => buildQuestionAnswer(QUESTIONS, [
      { ...VALID_INPUT[0]!, selected: ['yes'] },
      ...VALID_INPUT.slice(1),
    ])).toThrow('unknown option label');
    expect(() => buildQuestionAnswer(QUESTIONS, [
      { ...VALID_INPUT[0]!, selected: ['Yes', 'No'] },
      ...VALID_INPUT.slice(1),
    ])).toThrow('only one selected option');
    expect(() => buildQuestionAnswer(QUESTIONS, [
      VALID_INPUT[0]!,
      { ...VALID_INPUT[1]!, selected: ['Red', 'Red'] },
      VALID_INPUT[2]!,
    ])).toThrow('duplicate option label');
  });
});

describe('NativeInteractionController', () => {
  it('allows and rejects approvals with one-shot late-answer suppression', async () => {
    const controller = new NativeInteractionController();
    const firstNext = approvalNext();
    const first = controller.receiveApproval(SESSION_ID, approvalRequest(), firstNext);
    const card = controller.getSnapshot().pending[0]!;

    expect(card).toMatchObject({
      kind: 'approval',
      correlationId: String(CALL_ID),
      callId: CALL_ID,
      toolName: 'Bash',
    });
    expect(controller.answerApproval(card.key, 'allowed-once')).toBe(true);
    expect(controller.answerApproval(card.key, 'rejected')).toBe(false);
    await expect(first).resolves.toBe('allowed-once');
    expect(firstNext).not.toHaveBeenCalled();

    const second = controller.receiveApproval(SESSION_ID, approvalRequest(), approvalNext());
    const secondCard = controller.getSnapshot().pending[0]!;
    expect(controller.answerApproval(secondCard.key, 'rejected')).toBe(true);
    await expect(second).resolves.toBe('rejected');
    expect(controller.getSnapshot().pending).toEqual([]);
  });

  it('validates and resolves a complete question batch only once', async () => {
    const controller = new NativeInteractionController();
    const result = controller.receiveQuestions(
      SESSION_ID,
      questionRequest(),
      unusedRemote(),
      questionNext(),
    );
    const card = controller.getSnapshot().pending[0]!;

    expect(card.correlationId).toBe(card.key);
    expect(controller.answerQuestions(card.key, VALID_INPUT)).toBe(true);
    expect(controller.answerQuestions(card.key, VALID_INPUT)).toBe(false);
    expect(controller.cancelQuestions(card.key)).toBe(false);
    await expect(result).resolves.toEqual(VALID_ANSWER);
  });

  it('delegates an older approval delivery before presenting its replay', async () => {
    const controller = new NativeInteractionController();
    const firstNext = approvalNext();
    const firstCardKey = 'approval:1';
    const first = controller.receiveApproval(SESSION_ID, approvalRequest(), firstNext);
    const secondNext = approvalNext();
    const second = controller.receiveApproval(SESSION_ID, approvalRequest(), secondNext);

    expect(controller.getSnapshot().pending).toHaveLength(1);
    expect(controller.answerApproval(firstCardKey, 'rejected')).toBe(false);
    await expect(first).resolves.toBe('unavailable');
    expect(firstNext).toHaveBeenCalledTimes(1);
    const secondCard = controller.getSnapshot().pending[0]!;
    expect(controller.answerApproval(secondCard.key, 'allowed-once')).toBe(true);
    await expect(second).resolves.toBe('allowed-once');
    expect(secondNext).not.toHaveBeenCalled();
  });

  it('delegates reconnect replay and permits only the new question delivery to answer', async () => {
    const controller = new NativeInteractionController();
    const wait = { callId: CALL_ID };
    const firstNext = questionNext();
    const first = controller.receiveQuestions(
      SESSION_ID,
      questionRequest(wait),
      unusedRemote(),
      firstNext,
    );
    const firstKey = controller.getSnapshot().pending[0]!.key;
    const secondNext = questionNext();
    const second = controller.receiveQuestions(
      SESSION_ID,
      questionRequest(wait),
      unusedRemote(),
      secondNext,
    );

    expect(controller.getSnapshot().pending).toHaveLength(1);
    const secondCard = controller.getSnapshot().pending[0]!;
    expect(secondCard.key).not.toBe(firstKey);
    expect(secondCard.correlationId).toBe(String(CALL_ID));
    expect(controller.answerQuestions(firstKey, VALID_INPUT)).toBe(false);
    await expect(first).resolves.toEqual(VALID_ANSWER);
    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(controller.answerQuestions(secondCard.key, VALID_INPUT)).toBe(true);
    await expect(second).resolves.toEqual(VALID_ANSWER);
    expect(secondNext).not.toHaveBeenCalled();
  });

  it('aborts deliveries promptly and suppresses their late UI answers', async () => {
    const controller = new NativeInteractionController();
    const approvalAbort = new AbortController();
    const approval = controller.receiveApproval(
      SESSION_ID,
      { ...approvalRequest(), signal: approvalAbort.signal },
      approvalNext(),
    );
    const approvalCard = controller.getSnapshot().pending[0]!;
    const approvalRejection = expect(approval).rejects.toThrow('delivery stopped');
    approvalAbort.abort(new Error('delivery stopped'));
    await approvalRejection;
    expect(controller.answerApproval(approvalCard.key, 'allowed-once')).toBe(false);

    const questionAbort = new AbortController();
    const question = controller.receiveQuestions(
      SESSION_ID,
      { ...questionRequest(), signal: questionAbort.signal },
      unusedRemote(),
      questionNext(),
    );
    const questionCard = controller.getSnapshot().pending[0]!;
    const questionRejection = expect(question).rejects.toMatchObject({
      name: 'UserQuestionError',
      code: 'ASK_ABORTED',
      message: 'ask_user_question was aborted before the user answered',
    });
    questionAbort.abort();
    await questionRejection;
    expect(controller.answerQuestions(questionCard.key, VALID_INPUT)).toBe(false);
    expect(controller.getSnapshot().pending).toEqual([]);
  });

  it('delegates every outstanding delivery on dispose without hanging', async () => {
    const controller = new NativeInteractionController();
    const nextApproval = approvalNext();
    const nextQuestion = questionNext();
    const approval = controller.receiveApproval(SESSION_ID, approvalRequest(), nextApproval);
    const question = controller.receiveQuestions(
      SESSION_ID,
      questionRequest(),
      unusedRemote(),
      nextQuestion,
    );
    const [approvalCard, questionCard] = controller.getSnapshot().pending;

    expect(controller.dispose()).toBeUndefined();
    await expect(approval).resolves.toBe('unavailable');
    await expect(question).resolves.toEqual(VALID_ANSWER);
    expect(nextApproval).toHaveBeenCalledTimes(1);
    expect(nextQuestion).toHaveBeenCalledTimes(1);
    expect(controller.answerApproval(approvalCard!.key, 'rejected')).toBe(false);
    expect(controller.answerQuestions(questionCard!.key, VALID_INPUT)).toBe(false);
    expect(controller.getSnapshot().pending).toEqual([]);
  });

  it('uses ASK_CANCELLED for explicit user cancellation', async () => {
    const controller = new NativeInteractionController();
    const result = controller.receiveQuestions(
      SESSION_ID,
      questionRequest(),
      unusedRemote(),
      questionNext(),
    );
    const card = controller.getSnapshot().pending[0]!;
    const rejection = expect(result).rejects.toMatchObject({
      name: 'UserQuestionError',
      code: 'ASK_CANCELLED',
      message: 'the user cancelled ask_user_question',
    });

    expect(controller.cancelQuestions(card.key)).toBe(true);
    await rejection;
    expect(controller.cancelQuestions(card.key)).toBe(false);
  });

  it('consumes the first claim frame, times out with the standard error, and cleans up', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    try {
      const controller = new NativeInteractionController();
      const { claim, dispose } = makeClaim(50);
      const { remote, attachWait } = timedRemote(claim);
      const result = controller.receiveQuestions(
        SESSION_ID,
        questionRequest({ callId: CALL_ID, timed: true }),
        remote,
        questionNext(),
      );
      const rejection = expect(result).rejects.toMatchObject({
        name: 'UserQuestionError',
        code: 'ASK_TIMED_OUT',
        message: 'ask_user_question timed out before the user answered',
      });

      expect(controller.getSnapshot().pending).toEqual([]);
      await flushClaim();
      const card = controller.getSnapshot().pending[0] as QuestionInteractionCard;
      expect(card.deadline).toBe(1_050);
      expect(attachWait).toHaveBeenCalledWith(SESSION_ID, CALL_ID, expect.any(AbortSignal));
      await jest.advanceTimersByTimeAsync(49);
      expect(dispose).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await rejection;
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(controller.getSnapshot().pending).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('disposes timed claims on answer, user cancellation, and controller cleanup', async () => {
    const controller = new NativeInteractionController();
    const first = makeClaim();
    const firstResult = controller.receiveQuestions(
      SESSION_ID,
      questionRequest({ callId: CALL_ID, timed: true }),
      timedRemote(first.claim).remote,
      questionNext(),
    );
    await flushClaim();
    const firstCard = controller.getSnapshot().pending[0]!;
    expect(controller.answerQuestions(firstCard.key, VALID_INPUT)).toBe(true);
    await expect(firstResult).resolves.toEqual(VALID_ANSWER);
    expect(first.dispose).toHaveBeenCalledTimes(1);

    const second = makeClaim();
    const secondResult = controller.receiveQuestions(
      SESSION_ID,
      questionRequest({ callId: 'call-2' as ToolCallId, timed: true }),
      timedRemote(second.claim).remote,
      questionNext(),
    );
    const secondRejection = expect(secondResult).rejects.toMatchObject({ code: 'ASK_CANCELLED' });
    await flushClaim();
    const secondCard = controller.getSnapshot().pending[0]!;
    expect(controller.cancelQuestions(secondCard.key)).toBe(true);
    await secondRejection;
    expect(second.dispose).toHaveBeenCalledTimes(1);

    const third = makeClaim();
    const thirdNext = questionNext();
    const thirdResult = controller.receiveQuestions(
      SESSION_ID,
      questionRequest({ callId: 'call-3' as ToolCallId, timed: true }),
      timedRemote(third.claim).remote,
      thirdNext,
    );
    await flushClaim();
    controller.dispose();
    await expect(thirdResult).resolves.toEqual(VALID_ANSWER);
    expect(third.dispose).toHaveBeenCalledTimes(1);
    expect(thirdNext).toHaveBeenCalledTimes(1);
  });

  it('settles disposal while a timed claim is still awaiting its first frame', async () => {
    const opening = Promise.withResolvers<IteratorResult<{ remainingMs: number }>>();
    const dispose = jest.fn(() => {
      opening.resolve({ done: true, value: undefined });
    });
    const claim: RemoteStreamHandle<{ remainingMs: number }, never> = {
      [Symbol.asyncIterator]: () => ({ next: () => opening.promise }),
      dispose,
      send: (_item: never) => {},
      end: () => {},
    };
    const next = questionNext();
    const controller = new NativeInteractionController();
    const result = controller.receiveQuestions(
      SESSION_ID,
      questionRequest({ callId: CALL_ID, timed: true }),
      timedRemote(claim).remote,
      next,
    );

    controller.dispose();
    await expect(result).resolves.toEqual(VALID_ANSWER);
    await flushClaim();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().pending).toEqual([]);
  });
});
