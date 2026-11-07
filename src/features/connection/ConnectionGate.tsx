import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DshClientProvider } from '../client/DshClientProvider';
import { InteractionOverlay } from '../interactions/InteractionOverlay';
import { InteractionProvider } from '../interactions/InteractionProvider';
import { useConnection } from './ConnectionProvider';
import { ConnectScreen } from './ConnectScreen';
import { StatusBanner } from '../../components/StatusBanner';

export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const { controller, snapshot } = useConnection();
  const composition = controller.getComposition();

  if (snapshot.status === 'disconnected') return <ConnectScreen />;
  if (!composition) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>{snapshot.status === 'restoring' ? 'Restoring connection…' : 'Connecting to DSH…'}</Text>
      </View>
    );
  }

  return (
    <InteractionProvider controller={composition.interactions}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {snapshot.status === 'reconnecting' && <StatusBanner text="Connection lost. Reconnecting…" />}
        {snapshot.persistenceWarning && (
          <StatusBanner text="The connection works, but credential storage needs attention." tone="error" />
        )}
        <View style={styles.content}>
          <DshClientProvider context={composition.context}>{children}</DshClientProvider>
        </View>
        <InteractionOverlay />
      </SafeAreaView>
    </InteractionProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8, paddingTop: 8 },
  content: { flex: 1 },
  center: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
});
