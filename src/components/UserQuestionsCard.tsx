import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types';
import { useState } from 'react';
import {
  Button,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  buildQuestionAnswers,
  emptyQuestionDraft,
  setQuestionCustom,
  toggleQuestionOption,
  type QuestionDraft,
} from './questionAnswers';

export function UserQuestionsCard({
  questions,
  busy,
  onSubmit,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  questions: readonly AskUserQuestionItem[];
  busy?: boolean;
  onSubmit: (answer: AskUserQuestionAnswer) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});

  function update(question: AskUserQuestionItem, draft: QuestionDraft) {
    setDrafts(current => ({ ...current, [question.id]: draft }));
  }

  return (
    <View style={styles.card}>
      {questions.map((question) => {
        const draft = drafts[question.id] ?? emptyQuestionDraft;
        return (
          <View key={question.id} style={styles.question}>
            {question.header ? <Text style={styles.header}>{question.header}</Text> : null}
            <Text style={styles.title}>{question.question}</Text>
            {question.detail ? <Text selectable>{question.detail}</Text> : null}
            {question.options?.map(option => {
              const selected = draft.selected.includes(option.label);
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => update(question, toggleQuestionOption(question, draft, option.label))}
                  style={[styles.option, selected && styles.selectedOption]}
                >
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {option.description ? <Text>{option.description}</Text> : null}
                </Pressable>
              );
            })}
            <TextInput
              accessibilityLabel={`Other answer for ${question.question}`}
              editable={!busy}
              onChangeText={text => update(question, setQuestionCustom(question, draft, text))}
              placeholder="Other answer (optional)"
              style={styles.input}
              value={draft.custom}
            />
          </View>
        );
      })}
      <View style={styles.actions}>
        {onCancel ? <Button title={cancelLabel} color="#4b5563" disabled={busy} onPress={onCancel} /> : null}
        <Button title="Submit" disabled={busy} onPress={() => onSubmit(buildQuestionAnswers(questions, drafts))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#e0e7ff', borderRadius: 12, gap: 16,
    margin: 12, padding: 16,
  },
  question: { gap: 10 },
  header: { color: '#374151', fontSize: 13, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '600' },
  option: { backgroundColor: '#fff', borderRadius: 8, gap: 4, padding: 12 },
  selectedOption: { backgroundColor: '#bfdbfe' },
  optionLabel: { fontWeight: '500' },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 10 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
});
