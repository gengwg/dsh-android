import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StatusBanner } from '../../components/StatusBanner';
import { useConnection } from './ConnectionProvider';

export function ConnectScreen() {
  const { controller, snapshot } = useConnection();
  const [serverUrl, setServerUrl] = useState(snapshot.serverUrl ?? '');
  const [launchToken, setLaunchToken] = useState('');
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false);
  const connecting = snapshot.status === 'connecting';

  async function connect() {
    const token = launchToken;
    try {
      await controller.connect({ serverUrl, launchToken: token, allowInsecureHttp });
    } finally {
      setLaunchToken('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Connect to DSH' }} />
      <Text style={styles.title}>Connect to DSH</Text>
      <Text>Use your DSH base URL and a launch token from its connection link.</Text>
      {snapshot.error && <StatusBanner text={snapshot.error} tone="error" />}
      <TextInput
        accessibilityLabel="DSH server URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={setServerUrl}
        placeholder="https://dsh.example.com"
        style={styles.input}
        value={serverUrl}
      />
      <TextInput
        accessibilityLabel="DSH launch token"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setLaunchToken}
        placeholder="Launch token"
        secureTextEntry
        style={styles.input}
        value={launchToken}
      />
      <View style={styles.insecureRow}>
        <Text style={styles.insecureText}>Allow HTTP for development</Text>
        <Switch value={allowInsecureHttp} onValueChange={setAllowInsecureHttp} />
      </View>
      {allowInsecureHttp && (
        <StatusBanner text="HTTP can expose prompts and credentials on the network. Android may still block cleartext traffic." tone="error" />
      )}
      <Button
        title={connecting ? 'Connecting…' : 'Connect'}
        disabled={connecting || !serverUrl.trim() || !launchToken.trim()}
        onPress={() => void connect()}
      />
      <Text style={styles.note}>
        The launch token is used once and is not saved. Reusable cookies are encrypted with Expo Secure Store.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 16, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '600' },
  input: { borderColor: '#d1d5db', borderRadius: 10, borderWidth: 1, padding: 12 },
  insecureRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  insecureText: { flexShrink: 1 },
  note: { color: '#4b5563', fontSize: 13, lineHeight: 19 },
});
