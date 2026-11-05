import { Stack } from 'expo-router';

import { ConnectionGate } from '../features/connection/ConnectionGate';
import { ConnectionProvider } from '../features/connection/ConnectionProvider';

export default function RootLayout() {
  return (
    <ConnectionProvider>
      <ConnectionGate>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'DSH Sessions' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </ConnectionGate>
    </ConnectionProvider>
  );
}
