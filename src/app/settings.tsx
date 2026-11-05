import { Stack } from 'expo-router';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

import { StatusBanner } from '../components/StatusBanner';
import { useConnection } from '../features/connection/ConnectionProvider';

export default function SettingsScreen() {
  const { controller, snapshot } = useConnection();

  function confirmSignOut() {
    Alert.alert(
      'Sign out',
      'Remove saved DSH credentials from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void controller.signOut() },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Text style={styles.heading}>Connection</Text>
      <Text>Status: {snapshot.status}</Text>
      <Text selectable>Server: {snapshot.serverUrl ?? 'Not configured'}</Text>
      {snapshot.error && <StatusBanner text={snapshot.error} tone="error" />}
      {snapshot.persistenceWarning && (
        <StatusBanner text="Credential storage needs attention. Connect again if the problem persists." tone="error" />
      )}
      <Button
        title="Reconnect"
        disabled={!controller.getComposition() || snapshot.status === 'reconnecting'}
        onPress={() => controller.reconnect()}
      />
      <Button
        title={snapshot.status === 'signing-out' ? 'Signing out…' : 'Sign out'}
        color="#b91c1c"
        disabled={snapshot.status === 'signing-out'}
        onPress={confirmSignOut}
      />
      <Text style={styles.note}>
        Sign-out closes local streams and deletes saved cookies on this device. It does not revoke other clients or server-side sessions.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 20 },
  heading: { fontSize: 24, fontWeight: '600' },
  note: { color: '#4b5563', fontSize: 13, lineHeight: 19 },
});
