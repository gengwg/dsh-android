import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types';

export interface QuestionDraft {
  selected: string[];
  custom: string;
}

export const emptyQuestionDraft: QuestionDraft = { selected: [], custom: '' };

export function toggleQuestionOption(
  question: AskUserQuestionItem,
  draft: QuestionDraft,
  label: string,
): QuestionDraft {
  if (question.multiSelect) {
    return {
      ...draft,
      selected: draft.selected.includes(label)
        ? draft.selected.filter(value => value !== label)
        : [...draft.selected, label],
    };
  }
  return { selected: [label], custom: '' };
}

export function setQuestionCustom(
  question: AskUserQuestionItem,
  draft: QuestionDraft,
  custom: string,
): QuestionDraft {
  return question.multiSelect
    ? { ...draft, custom }
    : { selected: [], custom };
}

export function buildQuestionAnswers(
  questions: readonly AskUserQuestionItem[],
  drafts: Readonly<Record<string, QuestionDraft>>,
): AskUserQuestionAnswer {
  return {
    answers: questions.map(question => {
      const draft = drafts[question.id] ?? emptyQuestionDraft;
      return {
        id: question.id,
        selected: [...draft.selected],
        ...(draft.custom ? { custom: draft.custom } : {}),
      };
    }),
  };
}
