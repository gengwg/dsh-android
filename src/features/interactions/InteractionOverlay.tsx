import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApprovalCard } from '../../components/ApprovalCard';
import { StatusBanner } from '../../components/StatusBanner';
import { UserQuestionsCard } from '../../components/UserQuestionsCard';
import { useInteractionSnapshot, useNativeInteractions } from './InteractionProvider';

export function InteractionOverlay() {
  const controller = useNativeInteractions();
  const snapshot = useInteractionSnapshot();
  const [error, setError] = useState<string>();
  if (!snapshot?.pending.length) return null;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {error && <StatusBanner text={error} tone="error" />}
      {snapshot.pending.map((card) => {
        if (card.kind === 'approval') {
          return (
            <ApprovalCard
              key={card.key}
              toolName={card.toolName}
              reason={card.displayReason?.en ?? card.reason}
              onDecision={(outcome) => {
                setError(undefined);
                if (!controller.answerApproval(card.key, outcome)) {
                  setError('This approval is no longer available.');
                }
              }}
            />
          );
        }
        return (
          <UserQuestionsCard
            key={card.key}
            questions={card.questions}
            onCancel={() => {
              setError(undefined);
              if (!controller.cancelQuestions(card.key)) {
                setError('This question is no longer available.');
              }
            }}
            onSubmit={(answer) => {
              setError(undefined);
              try {
                if (!controller.answerQuestions(card.key, answer.answers)) {
                  setError('This question is no longer available.');
                }
              } catch {
                setError('The answer could not be validated. Review the selections and try again.');
              }
            }}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0, maxHeight: 480 },
});
