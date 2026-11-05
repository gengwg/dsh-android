import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol';
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types';
import type {} from '@deepseek-ai/dsh-user-questions/remote';
import type {
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequestEvent,
  PendingUserQuestion,
  SettledUserQuestion,
} from '@deepseek-ai/dsh-user-questions/types';

export type ApprovalDeliveryRequest = Omit<ApprovalRequestEvent, 'agent'>;
export type QuestionDeliveryRequest = Omit<AskUserQuestionRequestEvent, 'agent'>;
export type ApprovalDecision = 'allowed-once' | 'rejected';
export type UserQuestionsRemote = TypertRemoteNamespace<'userQuestions'>;

interface InteractionCardBase {
  /** Unique delivery identity used by answer methods. */
  readonly key: string;
  /** Business call correlation when supplied; otherwise the delivery key. */
  readonly correlationId: string;
  readonly sessionId: SessionId;
  readonly callId?: ToolCallId;
}

export interface ApprovalInteractionCard extends InteractionCardBase {
  readonly kind: 'approval';
  readonly toolName: string;
  readonly reason?: string;
  readonly displayReason?: ApprovalDeliveryRequest['displayReason'];
}

export interface QuestionInteractionCard extends InteractionCardBase {
  readonly kind: 'question';
  readonly questions: readonly AskUserQuestionItem[];
  readonly timed: boolean;
  /** Client-clock deadline claimed from the Host, when this is a timed request. */
  readonly deadline?: number;
}

export type NativeInteractionCard = ApprovalInteractionCard | QuestionInteractionCard;

export interface NativeInteractionSnapshot {
  readonly pending: readonly NativeInteractionCard[];
}

export type QuestionAnswerInput = Omit<AskUserQuestionAnswerItem, 'selected'> & {
  readonly selected: readonly string[];
};

export type SessionQuestionSubmission =
  | 'answerable'
  | 'submitting'
  | 'answered'
  | 'uncertain'
  | 'unavailable';

export interface SessionQuestionRow extends PendingUserQuestion {
  readonly submission: SessionQuestionSubmission;
}

export interface SessionQuestionView {
  readonly active: readonly SessionQuestionRow[];
  readonly settled: readonly SettledUserQuestion[];
}
