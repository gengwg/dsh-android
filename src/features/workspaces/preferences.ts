import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
import * as SecureStore from 'expo-secure-store';

const WORKSPACE_KEY = 'dsh.android.workspace';

export async function loadPreferredWorkspaceId() {
  const value = await SecureStore.getItemAsync(WORKSPACE_KEY);
  return value ? value as WorkspaceId : undefined;
}

export async function savePreferredWorkspaceId(workspaceId: WorkspaceId | undefined) {
  if (workspaceId) {
    await SecureStore.setItemAsync(WORKSPACE_KEY, workspaceId);
  } else {
    await SecureStore.deleteItemAsync(WORKSPACE_KEY);
  }
}
