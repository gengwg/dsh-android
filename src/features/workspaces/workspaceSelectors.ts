import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type {
  WorkspaceSnapshot,
} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types';

export function selectWorkspaceSessions(
  workspaces: WorkspaceSnapshot,
  sessions: SessionListState,
  workspaceId: WorkspaceId | undefined,
) {
  const workspace = workspaces.items.find(item => item.workspaceId === workspaceId);
  if (!workspace) return [];
  const archived = new Set(workspaces.archivedSessionIds);
  return workspace.sessionIds.flatMap((sessionId) => {
    const summary = sessions.byId[sessionId];
    return summary && !archived.has(sessionId) ? [summary] : [];
  });
}

export function selectInitialWorkspaceId(
  workspaces: WorkspaceSnapshot,
  preferredId: WorkspaceId | undefined,
): WorkspaceId | undefined {
  if (workspaces.items.some(item => item.workspaceId === preferredId)) {
    return preferredId;
  }
  return workspaces.items[0]?.workspaceId;
}
