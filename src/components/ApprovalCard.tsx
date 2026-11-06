import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types';
import { Button, StyleSheet, Text, View } from 'react-native';

export function ApprovalCard({
  toolName,
  reason,
  busy,
  onDecision,
}: {
  toolName: string;
  reason?: string;
  busy?: boolean;
  onDecision: (outcome: Extract<ApprovalOutcome, 'allowed-once' | 'rejected'>) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Allow {toolName}?</Text>
      {reason ? <Text selectable>{reason}</Text> : null}
      <View style={styles.actions}>
        <Button title="Allow once" disabled={busy} onPress={() => onDecision('allowed-once')} />
        <Button title="Reject" color="#b91c1c" disabled={busy} onPress={() => onDecision('rejected')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fef3c7', borderRadius: 12, gap: 12,
    margin: 12, padding: 16,
  },
  title: { fontSize: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
});
