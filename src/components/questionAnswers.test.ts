import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types';

import {
  buildQuestionAnswers,
  emptyQuestionDraft,
  setQuestionCustom,
  toggleQuestionOption,
} from './questionAnswers';

const single: AskUserQuestionItem = {
  id: 'single', question: 'Choose one', options: [{ label: 'A' }, { label: 'B' }],
};
const multiple: AskUserQuestionItem = {
  id: 'multiple', question: 'Choose many', multiSelect: true,
  options: [{ label: 'A' }, { label: 'B' }],
};

describe('question answer drafts', () => {
  it('uses one selection or custom text for a single-select question', () => {
    const selected = toggleQuestionOption(single, emptyQuestionDraft, 'A');
    expect(selected).toEqual({ selected: ['A'], custom: '' });
    expect(setQuestionCustom(single, selected, 'Other')).toEqual({ selected: [], custom: 'Other' });
    expect(toggleQuestionOption(single, { selected: [], custom: 'Other' }, 'B'))
      .toEqual({ selected: ['B'], custom: '' });
  });

  it('toggles multiple selections without discarding custom text', () => {
    const first = toggleQuestionOption(multiple, { selected: [], custom: 'Extra' }, 'A');
    const second = toggleQuestionOption(multiple, first, 'B');
    expect(second.selected).toEqual(['A', 'B']);
    expect(toggleQuestionOption(multiple, second, 'A')).toEqual({
      selected: ['B'], custom: 'Extra',
    });
  });

  it('maps every question id exactly once and preserves explicit skips', () => {
    expect(buildQuestionAnswers([single, multiple], {
      single: { selected: [], custom: '' },
      multiple: { selected: ['B'], custom: 'Extra' },
    })).toEqual({
      answers: [
        { id: 'single', selected: [] },
        { id: 'multiple', selected: ['B'], custom: 'Extra' },
      ],
    });
  });
});
