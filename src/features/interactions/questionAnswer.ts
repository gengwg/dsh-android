import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types';

import type { QuestionAnswerInput } from './types';

export type UserQuestionErrorCode =
  | 'ASK_ABORTED'
  | 'ASK_CANCELLED'
  | 'ASK_TIMED_OUT'
  | 'REPLY_QUEUED';

const ERROR_MESSAGES: Record<UserQuestionErrorCode, string> = {
  ASK_ABORTED: 'ask_user_question was aborted before the user answered',
  ASK_CANCELLED: 'the user cancelled ask_user_question',
  ASK_TIMED_OUT: 'ask_user_question timed out before the user answered',
  REPLY_QUEUED: 'a reply is already queued for this question',
};

/** Create the wire-preserved error shape restored by the Host question service. */
export function createUserQuestionError(
  code: UserQuestionErrorCode,
): Error & { code: UserQuestionErrorCode } {
  const error = new Error(ERROR_MESSAGES[code]) as Error & {
    code: UserQuestionErrorCode;
  };
  error.name = 'UserQuestionError';
  error.code = code;
  return error;
}

/** Validate and normalize one complete batch in the request's question order. */
export function buildQuestionAnswer(
  questions: readonly AskUserQuestionItem[],
  answers: readonly QuestionAnswerInput[],
): AskUserQuestionAnswer {
  const questionIds = new Set(questions.map(question => question.id));
  if (questionIds.size !== questions.length) {
    throw new Error('Question ids must be unique within a batch');
  }

  const byId = new Map<string, QuestionAnswerInput>();
  for (const answer of answers) {
    if (!questionIds.has(answer.id)) {
      throw new Error(`Unknown question id: ${answer.id}`);
    }
    if (byId.has(answer.id)) {
      throw new Error(`Question ${answer.id} was answered more than once`);
    }
    byId.set(answer.id, answer);
  }
  if (byId.size !== questions.length || answers.length !== questions.length) {
    throw new Error('Every question must be answered exactly once');
  }

  return {
    answers: questions.map((question) => {
      const answer = byId.get(question.id) as QuestionAnswerInput;
      const labels = new Set((question.options ?? []).map(option => option.label));
      if (answer.selected.some(label => !labels.has(label))) {
        throw new Error(`Question ${question.id} contains an unknown option label`);
      }
      if (new Set(answer.selected).size !== answer.selected.length) {
        throw new Error(`Question ${question.id} contains a duplicate option label`);
      }

      const custom = answer.custom?.trim() ?? '';
      if (question.multiSelect !== true && custom === '' && answer.selected.length > 1) {
        throw new Error(`Question ${question.id} accepts only one selected option`);
      }

      return {
        id: question.id,
        selected: custom !== '' && question.multiSelect !== true
          ? []
          : [...answer.selected],
        ...(custom === '' ? {} : { custom }),
      };
    }),
  };
}
