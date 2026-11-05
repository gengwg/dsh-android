import type {
  PendingSubmission,
  SessionEventLikeEntry,
} from '@deepseek-ai/dsh-api-session-controller/client';

export type ConversationRow = {
  id: string;
  kind: 'message';
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  interrupted?: boolean;
} | {
  id: string;
  kind: 'activity';
  label: string;
  status: 'running' | 'done' | 'error';
};

type ContentPart = {
  readonly type: string;
  readonly text?: unknown;
};

function textFromContent(content: readonly ContentPart[]): string {
  return content.flatMap(part => (
    part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
  )).join('\n');
}

export function projectConversation(
  entries: readonly SessionEventLikeEntry[],
  pendingSubmissions: readonly PendingSubmission[] = [],
): ConversationRow[] {
  const rows: ConversationRow[] = [];
  const transientRows = new Map<string, number>();
  const toolRows = new Map<string, number>();
  const observedRequestIds = new Set<string>();

  for (const entry of entries) {
    if (entry.type === 'transient') {
      const event = entry.event;
      const attemptId = String(event.data.attemptId);
      const chunk = event.data.chunk;
      if (chunk.type === 'text-delta') {
        const key = `${attemptId}:${chunk.index}:text`;
        const existing = transientRows.get(key);
        if (existing === undefined) {
          transientRows.set(key, rows.length);
          rows.push({
            id: `live:${key}`,
            kind: 'message',
            role: 'assistant',
            text: chunk.text,
          });
        } else {
          const row = rows[existing];
          if (row.kind === 'message') rows[existing] = { ...row, text: row.text + chunk.text };
        }
      } else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
        const key = `${attemptId}:${chunk.index}:text`;
        const existing = transientRows.get(key);
        if (existing === undefined) {
          transientRows.set(key, rows.length);
          rows.push({
            id: `live:${key}`,
            kind: 'message',
            role: 'assistant',
            text: chunk.block.text,
          });
        } else {
          const row = rows[existing];
          if (row.kind === 'message') rows[existing] = { ...row, text: chunk.block.text };
        }
      } else if (chunk.type === 'tool-call-delta') {
        const key = `${attemptId}:${chunk.index}:tool`;
        if (!transientRows.has(key)) {
          transientRows.set(key, rows.length);
          toolRows.set(String(chunk.id), rows.length);
          rows.push({
            id: `live:${key}`,
            kind: 'activity',
            label: chunk.name ?? 'Tool call',
            status: 'running',
          });
        }
      }
      continue;
    }

    const event = entry.event;
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      if ('rpcId' in event.data.source) {
        observedRequestIds.add(String(event.data.source.rpcId));
      }
      const text = textFromContent(event.data.content);
      if (text) {
        rows.push({
          id: `event:${event.seq}`,
          kind: 'message',
          role: 'user',
          text,
        });
      }
    } else if (event.type === 'assistant/message') {
      const text = textFromContent(event.data.message.content);
      if (text) {
        rows.push({
          id: `event:${event.seq}`,
          kind: 'message',
          role: 'assistant',
          text,
          ...(event.data.interrupted ? { interrupted: true } : {}),
        });
      }
    } else if (event.type === 'tool/call') {
      toolRows.set(String(event.data.callId), rows.length);
      rows.push({
        id: `event:${event.seq}`,
        kind: 'activity',
        label: event.data.name,
        status: 'running',
      });
    } else if (event.type === 'tool/result') {
      const index = toolRows.get(String(event.data.message.toolCallId));
      const row = index === undefined ? undefined : rows[index];
      if (index !== undefined && row?.kind === 'activity') {
        rows[index] = {
          ...row,
          status: event.data.message.isError ? 'error' : 'done',
        };
      }
    }
  }

  for (const pending of pendingSubmissions) {
    if (observedRequestIds.has(String(pending.requestId))) continue;
    rows.push({
      id: `pending:${String(pending.requestId)}`,
      kind: 'message',
      role: 'user',
      text: pending.text,
      pending: true,
    });
  }
  return rows;
}
