import type {
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client';
import type {
  WorkspaceSnapshot,
  WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client';

import {
  selectInitialWorkspaceId,
  selectWorkspaceSessions,
} from './workspaceSelectors';

const workspaceId = 'workspace-1' as WorkspaceView['workspaceId'];
const otherWorkspaceId = 'workspace-2' as WorkspaceView['workspaceId'];
const firstId = 'session-1' as SessionListState['ids'][number];
const secondId = 'session-2' as SessionListState['ids'][number];

function summary(id: SessionListState['ids'][number]): SessionSummary {
  return {
    id,
    displayTitle: id,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 1,
  };
}

const workspaces: WorkspaceSnapshot = {
  items: [{
    workspaceId,
    path: '/work/one',
    title: 'One',
    sessionIds: [secondId, firstId, 'missing' as SessionListState['ids'][number]],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }],
  archivedSessionIds: [firstId],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
};

const sessions: SessionListState = {
  ids: [firstId, secondId],
  byId: {
    [firstId]: summary(firstId),
    [secondId]: summary(secondId),
  },
  phase: 'ready',
  projectionsBySession: {},
};

describe('workspace selectors', () => {
  it('preserves Host order and skips missing or archived sessions', () => {
    expect(selectWorkspaceSessions(workspaces, sessions, workspaceId)).toEqual([
      sessions.byId[secondId],
    ]);
  });

  it('honors an existing preference and otherwise uses the first workspace', () => {
    expect(selectInitialWorkspaceId(workspaces, workspaceId)).toBe(workspaceId);
    expect(selectInitialWorkspaceId(workspaces, otherWorkspaceId)).toBe(workspaceId);
  });
});
