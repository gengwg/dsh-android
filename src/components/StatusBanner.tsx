import { StyleSheet, Text, View } from 'react-native';

export function StatusBanner({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'neutral' | 'error';
}) {
  return (
    <View style={[styles.banner, tone === 'error' && styles.error]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
  },
  error: {
    backgroundColor: '#fee2e2',
  },
  text: {
    color: '#111827',
    fontSize: 13,
  },
});
