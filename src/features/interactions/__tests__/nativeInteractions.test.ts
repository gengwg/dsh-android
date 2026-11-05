import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';

import { NativeInteractionController } from '../interactionController';
import { apply } from '../nativeInteractions';
import type { ApprovalDeliveryRequest, QuestionDeliveryRequest } from '../types';

const SESSION_ID = 'session-1' as SessionId;
type ApprovalListener = (
  this: Context,
  request: ApprovalDeliveryRequest,
  next: () => Promise<ApprovalOutcome>,
) => Promise<ApprovalOutcome>;
type QuestionListener = (
  this: Context,
  request: QuestionDeliveryRequest,
  next: () => Promise<AskUserQuestionAnswer>,
) => Promise<AskUserQuestionAnswer>;

describe('nativeInteractions Cordis plugin', () => {
  it('scopes both waterfalls, delegates unscoped requests, and disposes registrations', async () => {
    const listeners = new Map<string, (...args: never[]) => unknown>();
    const stopApproval = jest.fn();
    const stopQuestions = jest.fn();
    const scopeOf = jest.fn((owner: Context): SessionId | undefined => (
      Reflect.get(owner, 'scoped') === true ? SESSION_ID : undefined
    ));
    let cleanup: (() => void) | undefined;
    const ctx = {
      sessions: { scopeOf },
      remote: {
        userQuestions: { attachWait: jest.fn() },
        $on: jest.fn((event: string, listener: (...args: never[]) => unknown) => {
          listeners.set(event, listener);
          return event === 'approval/request' ? stopApproval : stopQuestions;
        }),
      },
      effect: jest.fn((execute: () => () => void) => {
        cleanup = execute();
        return jest.fn();
      }),
    } as unknown as Context;
    const controller = new NativeInteractionController();
    apply(ctx, controller);

    const scoped = { scoped: true } as unknown as Context;
    const approval = listeners.get('approval/request') as ApprovalListener;
    const approvalNext = jest.fn(async (): Promise<ApprovalOutcome> => 'unavailable');
    const approvalResult = approval.call(scoped, { toolName: 'Bash' }, approvalNext);
    const approvalCard = controller.getSnapshot().pending[0]!;
    expect(controller.answerApproval(approvalCard.key, 'allowed-once')).toBe(true);
    await expect(approvalResult).resolves.toBe('allowed-once');
    await expect(approval.call({} as Context, { toolName: 'Bash' }, approvalNext))
      .resolves.toBe('unavailable');
    expect(approvalNext).toHaveBeenCalledTimes(1);

    const questions = listeners.get('user-questions/request') as QuestionListener;
    const questionNext = jest.fn(async (): Promise<AskUserQuestionAnswer> => ({
      answers: [{ id: 'q', selected: [] }],
    }));
    const questionResult = questions.call(
      scoped,
      { questions: [{ id: 'q', question: 'Skip?' }] },
      questionNext,
    );
    const questionCard = controller.getSnapshot().pending[0]!;
    expect(controller.answerQuestions(questionCard.key, [{ id: 'q', selected: [] }])).toBe(true);
    await expect(questionResult).resolves.toEqual({ answers: [{ id: 'q', selected: [] }] });
    expect(questionNext).not.toHaveBeenCalled();

    cleanup?.();
    expect(stopApproval).toHaveBeenCalledTimes(1);
    expect(stopQuestions).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().pending).toEqual([]);
  });
});
