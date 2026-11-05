import type {
  PendingSubmission,
  SessionEventLikeEntry,
} from '@deepseek-ai/dsh-api-session-controller/client';

import { projectConversation } from './conversation';

type DurableEvent = Extract<SessionEventLikeEntry, { type: 'event' }>['event'];
type TransientEvent = Extract<SessionEventLikeEntry, { type: 'transient' }>['event'];
type UserEvent = Extract<DurableEvent, { type: 'user/message' }>;
type ToolCallEvent = Extract<DurableEvent, { type: 'tool/call' }>;
type ToolResultEvent = Extract<DurableEvent, { type: 'tool/result' }>;

const seq = (value: number) => value as DurableEvent['seq'];
const messageId = (value: string) => value as UserEvent['data']['id'];
const toolCallId = (value: string) => value as ToolCallEvent['data']['callId'];
const attemptId = (value: string) => value as TransientEvent['data']['attemptId'];

function userEvent(sequence: number, kind: 'user' | 'system-prompt', text: string): UserEvent {
  return {
    type: 'user/message', seq: seq(sequence), time: sequence, surfaceOp: 'append',
    data: {
      id: messageId(kind === 'user' ? 'user-1' : 'system-1'),
      role: 'user',
      source: kind === 'user'
        ? { kind: 'user', rpcId: 'request-1' as PendingSubmission['requestId'] }
        : { kind: 'system-prompt' },
      content: [{ type: 'text', text }],
    },
  };
}

function liveText(sequence: number, text: string): TransientEvent {
  return {
    type: 'assistant/live-chunk', seq: seq(sequence), time: sequence,
    data: {
      attemptId: attemptId('attempt-1'), turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text },
    },
  };
}

const toolCall: ToolCallEvent = {
  type: 'tool/call', seq: seq(5), time: 5,
  data: { turn: 1, step: 1, callId: toolCallId('call-1'), name: 'read_file', arguments: '{}' },
};

const toolResult: ToolResultEvent = {
  type: 'tool/result', seq: seq(6), time: 6, surfaceOp: 'append',
  data: {
    turn: 1, step: 1,
    message: {
      id: messageId('tool-1'), role: 'tool',
      source: { kind: 'tool', callId: toolCallId('call-1') },
      toolCallId: toolCallId('call-1'), content: [], isError: false,
    },
  },
};

const entries: SessionEventLikeEntry[] = [
  { type: 'event', event: userEvent(1, 'user', 'Hello') },
  { type: 'event', event: userEvent(2, 'system-prompt', 'Hidden instructions') },
  { type: 'transient', event: liveText(3, 'Hel') },
  { type: 'transient', event: liveText(4, 'lo') },
  { type: 'event', event: toolCall },
  { type: 'event', event: toolResult },
];

describe('conversation projection', () => {
  it('shows direct messages, coalesces live text, and summarizes tools', () => {
    expect(projectConversation(entries)).toEqual([
      { id: 'event:1', kind: 'message', role: 'user', text: 'Hello' },
      { id: 'live:attempt-1:0:text', kind: 'message', role: 'assistant', text: 'Hello' },
      { id: 'event:5', kind: 'activity', label: 'read_file', status: 'done' },
    ]);
  });

  it('uses the complete text block instead of duplicating deltas', () => {
    const blockEnd: TransientEvent = {
      type: 'assistant/live-chunk', seq: seq(7), time: 7,
      data: {
        attemptId: attemptId('attempt-1'), turn: 1, step: 1,
        chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'Complete' } },
      },
    };
    const rows = projectConversation([
      { type: 'transient', event: liveText(3, 'Hel') },
      { type: 'transient', event: liveText(4, 'lo') },
      { type: 'transient', event: blockEnd },
    ]);
    expect(rows).toEqual([
      { id: 'live:attempt-1:0:text', kind: 'message', role: 'assistant', text: 'Complete' },
    ]);
  });

  it('suppresses a pending echo once its durable user message arrives', () => {
    const pending: PendingSubmission = {
      requestId: 'request-1' as PendingSubmission['requestId'],
      placement: 'transcript', time: 1, text: 'Hello', attachments: [],
    };
    expect(projectConversation(entries.slice(0, 1), [pending])).toEqual([
      { id: 'event:1', kind: 'message', role: 'user', text: 'Hello' },
    ]);
  });

  it('appends pending prompts only while the official snapshot retains them', () => {
    const pending: PendingSubmission = {
      requestId: 'request-1' as PendingSubmission['requestId'],
      placement: 'transcript', time: 1, text: 'Pending', attachments: [],
    };
    expect(projectConversation([], [pending]).at(-1)).toMatchObject({
      role: 'user', text: 'Pending', pending: true,
    });
    expect(projectConversation(entries.slice(0, 1), [])
      .some(row => row.kind === 'message' && row.pending)).toBe(false);
  });
});
