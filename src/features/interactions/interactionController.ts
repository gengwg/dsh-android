import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';

import { buildQuestionAnswer, createUserQuestionError } from './questionAnswer.ts';
import type {
  ApprovalDecision,
  ApprovalDeliveryRequest,
  ApprovalInteractionCard,
  NativeInteractionCard,
  NativeInteractionSnapshot,
  QuestionAnswerInput,
  QuestionDeliveryRequest,
  QuestionInteractionCard,
  UserQuestionsRemote,
} from './types';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason: unknown) => void;
}

interface Delivery<T> {
  readonly order: number;
  card: NativeInteractionCard;
  readonly deferred: Deferred<T>;
  readonly next: () => Promise<T>;
  readonly cleanups: Set<() => void>;
  settled: boolean;
  visible: boolean;
}

function approvalAbortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('approval request was aborted');
}

/** React-free observable store and one-shot owner of forwarded interaction deliveries. */
export class NativeInteractionController {
  private readonly approvals = new Map<string, Delivery<ApprovalOutcome>>();
  private readonly questions = new Map<string, Delivery<AskUserQuestionAnswer>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: NativeInteractionSnapshot = { pending: [] };
  private nextOrder = 0;
  private disposed = false;

  getSnapshot = (): NativeInteractionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Present one approval delivery. The listener promise settles at most once. */
  receiveApproval(
    sessionId: SessionId,
    request: ApprovalDeliveryRequest,
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> {
    if (this.disposed) return next();
    if (request.callId !== undefined) {
      this.supersede(this.approvals, sessionId, request.callId);
    }
    const order = ++this.nextOrder;
    const key = `approval:${order}`;
    const card: ApprovalInteractionCard = {
      kind: 'approval',
      key,
      correlationId: request.callId === undefined ? key : String(request.callId),
      sessionId,
      ...(request.callId === undefined ? {} : { callId: request.callId }),
      toolName: request.toolName,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.displayReason === undefined ? {} : { displayReason: request.displayReason }),
    };
    const delivery = this.createDelivery(order, card, next);
    this.approvals.set(key, delivery);
    this.observeSignal(delivery, request.signal, approvalAbortReason);
    if (!delivery.settled) {
      delivery.visible = true;
      this.publish();
    }
    return delivery.deferred.promise;
  }

  /** Present one question delivery, claiming a timed wait before starting its timer. */
  receiveQuestions(
    sessionId: SessionId,
    request: QuestionDeliveryRequest,
    remote: Pick<UserQuestionsRemote, 'attachWait'>,
    next: () => Promise<AskUserQuestionAnswer>,
  ): Promise<AskUserQuestionAnswer> {
    if (this.disposed) return next();
    if (request.wait?.callId !== undefined) {
      this.supersede(this.questions, sessionId, request.wait.callId);
    }
    const order = ++this.nextOrder;
    const key = `question:${order}`;
    const callId = request.wait?.callId;
    const timed = request.wait?.timed === true;
    const card: QuestionInteractionCard = {
      kind: 'question',
      key,
      correlationId: callId === undefined ? key : String(callId),
      sessionId,
      ...(callId === undefined ? {} : { callId }),
      questions: request.questions,
      timed,
    };
    const delivery = this.createDelivery(order, card, next);
    this.questions.set(key, delivery);
    this.observeSignal(
      delivery,
      request.signal,
      () => createUserQuestionError('ASK_ABORTED'),
    );
    if (delivery.settled) return delivery.deferred.promise;

    if (timed && callId !== undefined) {
      void this.openTimedClaim(delivery, sessionId, callId, remote);
    } else {
      delivery.visible = true;
      this.publish();
    }
    return delivery.deferred.promise;
  }

  /** Resolve a visible approval. False means the delivery is already settled. */
  answerApproval(key: string, decision: ApprovalDecision): boolean {
    const delivery = this.approvals.get(key);
    if (delivery === undefined || delivery.settled || !delivery.visible) return false;
    return this.resolve(delivery, decision);
  }

  /** Validate and resolve a visible question batch. False means it is already settled. */
  answerQuestions(key: string, answers: readonly QuestionAnswerInput[]): boolean {
    const delivery = this.questions.get(key);
    if (delivery === undefined || delivery.settled || !delivery.visible) return false;
    const answer = buildQuestionAnswer(delivery.card.kind === 'question'
      ? delivery.card.questions
      : [], answers);
    return this.resolve(delivery, answer);
  }

  /** Answer the newest visible delivery for an open projection row. */
  answerQuestionsForCall(
    sessionId: SessionId,
    callId: ToolCallId,
    answers: readonly QuestionAnswerInput[],
  ): boolean {
    let match: Delivery<AskUserQuestionAnswer> | undefined;
    for (const delivery of this.questions.values()) {
      if (delivery.card.kind !== 'question' || delivery.settled || !delivery.visible) continue;
      if (String(delivery.card.sessionId) === String(sessionId)
        && String(delivery.card.callId) === String(callId)) {
        match = delivery;
      }
    }
    return match === undefined ? false : this.answerQuestions(match.card.key, answers);
  }

  /** Explicit user cancellation, distinct from delivery abort and timeout. */
  cancelQuestions(key: string): boolean {
    const delivery = this.questions.get(key);
    if (delivery === undefined || delivery.settled || !delivery.visible) return false;
    return this.reject(delivery, createUserQuestionError('ASK_CANCELLED'));
  }

  /** Delegate every outstanding waterfall and release all claims without waiting. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const delivery of [...this.approvals.values()]) this.delegate(delivery);
    for (const delivery of [...this.questions.values()]) this.delegate(delivery);
    this.listeners.clear();
  }

  private supersede<T>(
    deliveries: Map<string, Delivery<T>>,
    sessionId: SessionId,
    callId: ToolCallId,
  ): void {
    for (const delivery of deliveries.values()) {
      if (!delivery.settled
        && String(delivery.card.sessionId) === String(sessionId)
        && String(delivery.card.callId) === String(callId)) {
        this.delegate(delivery);
      }
    }
  }

  private createDelivery<T>(
    order: number,
    card: NativeInteractionCard,
    next: () => Promise<T>,
  ): Delivery<T> {
    return {
      order,
      card,
      deferred: Promise.withResolvers<T>(),
      next,
      cleanups: new Set(),
      settled: false,
      visible: false,
    };
  }

  private observeSignal<T>(
    delivery: Delivery<T>,
    signal: AbortSignal | undefined,
    reason: (signal: AbortSignal) => unknown,
  ): void {
    if (signal === undefined) return;
    const onAbort = (): void => { this.reject(delivery, reason(signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    this.addCleanup(delivery, () => { signal.removeEventListener('abort', onAbort); });
    if (signal.aborted) onAbort();
  }

  private addCleanup<T>(delivery: Delivery<T>, cleanup: () => void): void {
    if (delivery.settled) cleanup();
    else delivery.cleanups.add(cleanup);
  }

  private async openTimedClaim(
    delivery: Delivery<AskUserQuestionAnswer>,
    sessionId: SessionId,
    callId: ToolCallId,
    remote: Pick<UserQuestionsRemote, 'attachWait'>,
  ): Promise<void> {
    const lifetime = new AbortController();
    this.addCleanup(delivery, () => { lifetime.abort(); });
    try {
      const claim = remote.attachWait(sessionId, callId, lifetime.signal);
      this.addCleanup(delivery, () => { claim.dispose(); });
      const iterator = claim[Symbol.asyncIterator]();
      const opening = await iterator.next();
      if (delivery.settled) return;
      if (opening.done) {
        this.delegate(delivery);
        return;
      }

      const remainingMs = Math.max(0, opening.value.remainingMs);
      if (delivery.card.kind === 'question') {
        delivery.card = { ...delivery.card, deadline: Date.now() + remainingMs };
      }
      const timer = setTimeout(() => {
        this.reject(delivery, createUserQuestionError('ASK_TIMED_OUT'));
      }, remainingMs);
      this.addCleanup(delivery, () => { clearTimeout(timer); });
      delivery.visible = true;
      this.publish();
      void this.watchClaim(delivery, iterator);
    } catch (error) {
      if (!delivery.settled) this.reject(delivery, error);
    }
  }

  private async watchClaim(
    delivery: Delivery<AskUserQuestionAnswer>,
    iterator: AsyncIterator<{ remainingMs: number }>,
  ): Promise<void> {
    try {
      await iterator.next();
      if (!delivery.settled) {
        this.reject(delivery, new Error('the foreground question wait ended'));
      }
    } catch (error) {
      if (!delivery.settled) this.reject(delivery, error);
    }
  }

  private resolve<T>(delivery: Delivery<T>, value: T): boolean {
    return this.finish(delivery, () => { delivery.deferred.resolve(value); });
  }

  private reject<T>(delivery: Delivery<T>, reason: unknown): boolean {
    return this.finish(delivery, () => { delivery.deferred.reject(reason); });
  }

  private delegate<T>(delivery: Delivery<T>): boolean {
    return this.finish(delivery, () => {
      try {
        delivery.deferred.resolve(delivery.next());
      } catch (error) {
        delivery.deferred.reject(error);
      }
    });
  }

  private finish<T>(delivery: Delivery<T>, settle: () => void): boolean {
    if (delivery.settled) return false;
    delivery.settled = true;
    const wasVisible = delivery.visible;
    delivery.visible = false;
    if (delivery.card.kind === 'approval') this.approvals.delete(delivery.card.key);
    else this.questions.delete(delivery.card.key);
    for (const cleanup of delivery.cleanups) cleanup();
    delivery.cleanups.clear();
    settle();
    if (wasVisible) this.publish();
    return true;
  }

  private publish(): void {
    const deliveries: (
      Delivery<ApprovalOutcome> | Delivery<AskUserQuestionAnswer>
    )[] = [...this.approvals.values(), ...this.questions.values()];
    this.snapshot = {
      pending: deliveries
        .filter(delivery => delivery.visible)
        .sort((left, right) => left.order - right.order)
        .map(delivery => delivery.card),
    };
    for (const listener of this.listeners) listener();
  }
}
