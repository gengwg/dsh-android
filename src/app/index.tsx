import { Link, router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StatusBanner } from '../components/StatusBanner';
import {
  useDshClient,
  useSessionListSnapshot,
  useWorkspaceSnapshot,
} from '../features/client/DshClientProvider';
import {
  loadPreferredWorkspaceId,
  savePreferredWorkspaceId,
} from '../features/workspaces/preferences';
import {
  selectInitialWorkspaceId,
  selectWorkspaceSessions,
} from '../features/workspaces/workspaceSelectors';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';

export default function SessionsScreen() {
  const context = useDshClient();
  const workspaces = useWorkspaceSnapshot();
  const sessions = useSessionListSnapshot();
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>();
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadPreferredWorkspaceId().then((preferred) => {
      if (active) setWorkspaceId(preferred);
    }).catch(() => {
      if (active) setActionError('Saved workspace preference could not be read.');
    }).finally(() => {
      if (active) setPreferenceLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const effectiveWorkspaceId = workspaces
    ? selectInitialWorkspaceId(workspaces, workspaceId)
    : workspaceId;

  useEffect(() => {
    if (preferenceLoaded) void savePreferredWorkspaceId(effectiveWorkspaceId).catch(() => {
      setActionError('Workspace preference could not be saved.');
    });
  }, [effectiveWorkspaceId, preferenceLoaded]);

  const rows = useMemo(
    () => workspaces && sessions
      ? selectWorkspaceSessions(workspaces, sessions, effectiveWorkspaceId)
      : [],
    [effectiveWorkspaceId, sessions, workspaces],
  );

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setActionError(undefined);
    try {
      await context.sessions.refresh();
    } catch {
      setActionError('Session list could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function initializeDefault() {
    setActionError(undefined);
    try {
      await context.workspaces.initializeDefault();
    } catch {
      setActionError('Default workspace could not be initialized.');
    }
  }

  async function createSession() {
    if (!effectiveWorkspaceId || creating) return;
    setCreating(true);
    setActionError(undefined);
    try {
      const sessionId = await context.sessions.create({ workspaceId: effectiveWorkspaceId });
      router.push({ pathname: '/session/[id]', params: { id: sessionId } });
    } catch {
      setActionError('Session could not be created. Check the connection and try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'DSH Sessions' }} />
      <View style={styles.toolbar}>
        <Link href="/settings" style={styles.settingsLink}>Settings</Link>
        <Button title={refreshing ? 'Refreshing…' : 'Refresh'} disabled={refreshing} onPress={() => void refresh()} />
      </View>
      {workspaces?.error && <StatusBanner text={`Workspace sync failed (${workspaces.error.code}).`} tone="error" />}
      {actionError && <StatusBanner text={actionError} tone="error" />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceList}>
        {workspaces?.items.map(workspace => (
          <Pressable
            key={workspace.workspaceId}
            onPress={() => setWorkspaceId(workspace.workspaceId)}
            style={[styles.workspaceChip, workspace.workspaceId === effectiveWorkspaceId && styles.selectedWorkspace]}
          >
            <Text numberOfLines={1} style={styles.workspaceText}>{workspace.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!workspaces || workspaces.phase === 'pending' ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : workspaces.items.length === 0 ? (
        <View style={styles.center}>
          <Text>No workspaces yet.</Text>
          <Button title="Initialize default workspace" onPress={() => void initializeDefault()} />
        </View>
      ) : (
        <>
          <View style={styles.createRow}>
            <Button
              title={creating ? 'Creating…' : 'New session'}
              disabled={!effectiveWorkspaceId || creating}
              onPress={() => void createSession()}
            />
          </View>
          <FlatList
            data={rows}
            keyExtractor={item => item.id}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            contentContainerStyle={rows.length === 0 ? styles.emptyList : undefined}
            renderItem={({ item }) => (
              <Pressable
                style={styles.sessionRow}
                onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
              >
                <Text style={styles.sessionTitle}>{item.displayTitle}</Text>
                <Text style={styles.sessionMeta}>
                  {item.running ? 'Running' : `Updated ${new Date(item.updatedAt).toLocaleDateString()}`}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={(
              <View style={styles.center}>
                {sessions?.phase === 'pending' ? <ActivityIndicator /> : <Text>No sessions in this workspace.</Text>}
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 16 },
  toolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  settingsLink: { color: '#1d4ed8', fontSize: 16 },
  workspaceList: { gap: 8, minHeight: 40 },
  workspaceChip: {
    backgroundColor: '#e5e7eb', borderRadius: 18, maxWidth: 220,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  selectedWorkspace: { backgroundColor: '#bfdbfe' },
  workspaceText: { color: '#111827' },
  createRow: { alignItems: 'flex-end' },
  sessionRow: {
    borderBottomColor: '#e5e7eb', borderBottomWidth: 1,
    gap: 4, paddingHorizontal: 4, paddingVertical: 14,
  },
  sessionTitle: { color: '#111827', fontSize: 16, fontWeight: '500' },
  sessionMeta: { color: '#6b7280', fontSize: 13 },
  center: { alignItems: 'center', gap: 16, justifyContent: 'center', padding: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
});
