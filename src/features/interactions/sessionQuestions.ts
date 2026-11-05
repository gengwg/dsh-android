import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type {
  PendingUserQuestion,
  UserQuestionProjectionView,
} from '@deepseek-ai/dsh-user-questions/types';

import type { NativeInteractionController } from './interactionController';
import { buildQuestionAnswer, createUserQuestionError } from './questionAnswer';
import type {
  QuestionAnswerInput,
  SessionQuestionSubmission,
  SessionQuestionView,
  UserQuestionsRemote,
} from './types';

interface LocalQuestionState {
  readonly submission: SessionQuestionSubmission;
  readonly hidden: boolean;
}

/** Observable question projection plus answer routing for one retained SessionFace. */
export class SessionQuestionCards implements ObservableSnapshot<SessionQuestionView | undefined> {
  private readonly source: ObservableSnapshot<unknown>;
  private readonly stopSource: () => void;
  private readonly listeners = new Set<() => void>();
  private readonly local = new Map<string, LocalQuestionState>();
  private view: UserQuestionProjectionView | undefined;
  private snapshot: SessionQuestionView | undefined;

  constructor(
    private readonly session: SessionFace,
    private readonly interactions: NativeInteractionController,
    private readonly remote: Pick<UserQuestionsRemote, 'answer'>,
  ) {
    this.source = session.projections.faceOf('userQuestions');
    this.stopSource = this.source.subscribe(this.reconcile);
    this.reconcile();
  }

  getSnapshot = (): SessionQuestionView | undefined => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Answer an open projection row through its current forwarded waterfall. */
  answerOpen(callId: ToolCallId, answers: readonly QuestionAnswerInput[]): boolean {
    const row = this.activeRow(callId);
    if (row?.state !== 'open') return false;
    return this.interactions.answerQuestionsForCall(
      this.session.sessionId,
      callId,
      answers,
    );
  }

  /** Answer a continued row through the Remote method, preserving its result. */
  async answerContinued(
    callId: ToolCallId,
    answers: readonly QuestionAnswerInput[],
  ): Promise<RemoteResult<boolean>> {
    const row = this.activeRow(callId);
    const local = this.local.get(String(callId));
    if (row?.state !== 'continued'
      || local?.hidden
      || local?.submission === 'unavailable'
      || local?.submission === 'uncertain') {
      throw new Error('this question is no longer answerable');
    }
    if (local?.submission === 'submitting' || local?.submission === 'answered') {
      throw createUserQuestionError('REPLY_QUEUED');
    }

    const answer = buildQuestionAnswer(row.questions, answers);
    this.setSubmission(callId, 'submitting');
    try {
      const result = await this.remote.answer(this.session.sessionId, callId, answer);
      if (result.ok) {
        this.setSubmission(callId, result.value ? 'answered' : 'unavailable');
      } else {
        const uncertain = result.error.code === 'gateway/internal'
          || result.error.code === 'gateway/cancelled';
        this.setSubmission(callId, uncertain ? 'uncertain' : 'answerable');
      }
      return result;
    } catch (error) {
      this.setSubmission(callId, 'uncertain');
      throw error;
    }
  }

  /** Hide a continued card locally. Closing never sends a reply or cancellation. */
  closeContinued(callId: ToolCallId): void {
    if (this.activeRow(callId)?.state !== 'continued') return;
    const current = this.local.get(String(callId));
    this.local.set(String(callId), {
      submission: current?.submission ?? 'answerable',
      hidden: true,
    });
    this.reconcile();
  }

  dispose(): void {
    this.stopSource();
    this.listeners.clear();
    this.local.clear();
  }

  private activeRow(callId: ToolCallId): PendingUserQuestion | undefined {
    return this.view?.active.find(row => String(row.callId) === String(callId));
  }

  private setSubmission(
    callId: ToolCallId,
    submission: SessionQuestionSubmission,
  ): void {
    if (this.activeRow(callId) === undefined) return;
    const current = this.local.get(String(callId));
    this.local.set(String(callId), {
      submission,
      hidden: current?.hidden ?? false,
    });
    this.reconcile();
  }

  private reconcile = (): void => {
    this.view = this.source.getSnapshot() as UserQuestionProjectionView | undefined;
    const active = new Set(this.view?.active.map(row => String(row.callId)) ?? []);
    for (const key of this.local.keys()) {
      if (!active.has(key)) this.local.delete(key);
    }
    this.snapshot = this.view === undefined ? undefined : {
      active: this.view.active.flatMap((row) => {
        const local = this.local.get(String(row.callId));
        if (local?.hidden) return [];
        return [{ ...row, submission: local?.submission ?? 'answerable' }];
      }),
      settled: this.view.settled,
    };
    for (const listener of this.listeners) listener();
  };
}
