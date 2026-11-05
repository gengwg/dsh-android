import { StyleSheet, Text, View } from 'react-native';

import { createDshComposition } from '../features/connection/dshComposition';

export default function CompatibilityScreen() {
  const compositionAvailable = typeof createDshComposition === 'function';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DSH Android</Text>
      <Text>
        {compositionAvailable
          ? 'Official client artifacts loaded. Native connection is not configured yet.'
          : 'Official client artifacts are unavailable.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
});
