import { SessionId } from '@deepseek-ai/dsh-session/types';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StatusBanner } from '../../components/StatusBanner';
import { UserQuestionsCard } from '../../components/UserQuestionsCard';
import { useSessionListSnapshot } from '../../features/client/DshClientProvider';
import type { SessionQuestionRow } from '../../features/interactions';
import type { ConversationRow } from '../../features/sessions/conversation';
import { hasUnresolvedSubmission, submitPrompt } from '../../features/sessions/prompt';
import { useConversation } from '../../features/sessions/useConversation';
import { useSessionDraft } from '../../features/sessions/useSessionDraft';

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Array.isArray(id) ? id[0] : id;
  if (!sessionId) return <StatusBanner text="Missing session id" tone="error" />;
  return <SessionScreen key={sessionId} sessionId={sessionId} />;
}

function SessionScreen({ sessionId }: { sessionId: string }) {
  const list = useSessionListSnapshot();
  const { reference, session, eventWindow, rows, questionCards, questions } = useConversation(sessionId);
  const {
    draft,
    setDraft,
    loading: draftLoading,
    persistence,
    persistDraft,
    storageError,
  } = useSessionDraft(sessionId);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [questionBusy, setQuestionBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const listRef = useRef<FlatList<ConversationRow>>(null);
  const lastRowId = rows.at(-1)?.id;

  useEffect(() => {
    if (lastRowId && eventWindow?.change.kind !== 'prepend') {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [eventWindow, lastRowId]);

  async function send() {
    if (!reference || sending || draftLoading || hasUnresolvedSubmission(session) || !draft.trim()) return;
    setSending(true);
    setActionError(undefined);
    try {
      const result = await submitPrompt(reference.binding.session, draft);
      if (result.ok) {
        setDraft('');
      } else {
        setActionError(`Prompt was not accepted (${result.error.code}). Your draft was preserved.`);
      }
    } catch {
      setActionError('Prompt outcome is uncertain. Reconnect and review the session before retrying.');
    } finally {
      setSending(false);
    }
  }

  async function stop() {
    if (!reference || stopping) return;
    setStopping(true);
    setActionError(undefined);
    try {
      const result = await reference.binding.session.cancel();
      if (!result.ok) setActionError(`Cancellation failed (${result.error.code}).`);
    } catch {
      setActionError('Cancellation outcome is uncertain. Reconnect and review the session.');
    } finally {
      setStopping(false);
    }
  }

  async function answerContinued(row: SessionQuestionRow, answer: AskUserQuestionAnswer) {
    const key = String(row.callId);
    if (!questionCards || questionBusy) return;
    setQuestionBusy(key);
    setActionError(undefined);
    try {
      const result = await questionCards.answerContinued(row.callId, answer.answers);
      if (!result.ok) {
        const uncertain = result.error.code === 'gateway/internal'
          || result.error.code === 'gateway/cancelled';
        setActionError(uncertain
          ? 'Answer outcome is uncertain. Wait for the session to reconcile before reviewing it again.'
          : `Answer failed (${result.error.code}).`);
      } else if (!result.value) {
        setActionError('This question is no longer available.');
      }
    } catch {
      setActionError('Answer outcome is uncertain. Wait for the session to reconcile before reviewing it again.');
    } finally {
      setQuestionBusy(undefined);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: list?.byId[SessionId(sessionId)]?.displayTitle ?? 'Session' }} />
      {session?.openState === 'error' && (
        <StatusBanner
          text={`Could not open this session${session.openError ? ` (${session.openError.code})` : ''}.`}
          tone="error"
        />
      )}
      {session?.lastAgentError && <StatusBanner text={session.lastAgentError} tone="error" />}
      {session?.promptError && (
        <StatusBanner
          text={`${session.promptError.op === 'send' ? 'Prompt' : 'Cancellation'} failed (${session.promptError.error.code}).`}
          tone="error"
        />
      )}
      {actionError && <StatusBanner text={actionError} tone="error" />}
      {(persistence === 'memory-only' || storageError) && (
        <StatusBanner text="This draft is available only until you leave the app." />
      )}
      {questions?.active.filter(row => row.state === 'continued').map((row) => {
        const busy = questionBusy === String(row.callId)
          || row.submission === 'submitting'
          || row.submission === 'answered'
          || row.submission === 'uncertain';
        return (
          <View key={String(row.callId)}>
            <UserQuestionsCard
              questions={row.questions}
              busy={busy}
              cancelLabel="Close"
              onCancel={() => questionCards?.closeContinued(row.callId)}
              onSubmit={answer => void answerContinued(row, answer)}
            />
            {row.submission === 'answered' && <Text style={styles.messageMeta}>Answer queued.</Text>}
            {row.submission === 'uncertain' && <Text style={styles.messageMeta}>Answer outcome uncertain; awaiting reconciliation.</Text>}
            {row.submission === 'unavailable' && <Text style={styles.messageMeta}>No longer answerable.</Text>}
          </View>
        );
      })}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={row => row.id}
        renderItem={({ item }) => <ConversationItem row={item} />}
        contentContainerStyle={styles.transcript}
        initialNumToRender={20}
        maxToRenderPerBatch={30}
        windowSize={10}
        ListHeaderComponent={eventWindow?.hasMore ? (
          <Button
            title={session?.loadingOlder ? 'Loading older messages…' : 'Load older messages'}
            disabled={session?.loadingOlder}
            onPress={() => void reference?.binding.session.loadOlder()}
          />
        ) : undefined}
        ListEmptyComponent={(
          <View style={styles.empty}>
            {session?.openState === 'loading' || !session ? (
              <ActivityIndicator />
            ) : (
              <Text>No messages yet.</Text>
            )}
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => void persistDraft(draft)}
          placeholder="Message DSH"
          multiline
          style={styles.input}
          editable={!sending && !draftLoading}
        />
        <View style={styles.actions}>
          <Button
            title={sending ? 'Sending…' : 'Send'}
            disabled={sending || draftLoading || hasUnresolvedSubmission(session) || !draft.trim() || !reference || session?.openState === 'error'}
            onPress={() => void send()}
          />
          {session?.running && (
            <Button
              title={stopping ? 'Stopping…' : 'Stop'}
              color="#b91c1c"
              disabled={stopping}
              onPress={() => void stop()}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function ConversationItem({ row }: { row: ConversationRow }) {
  if (row.kind === 'activity') {
    return (
      <Text style={styles.activity}>
        {row.label}: {row.status === 'running' ? 'running' : row.status === 'done' ? 'finished' : 'failed'}
      </Text>
    );
  }
  return (
    <View style={[styles.message, row.role === 'user' ? styles.user : styles.assistant]}>
      <Text selectable style={styles.messageText}>{row.text}</Text>
      {(row.pending || row.interrupted) && (
        <Text style={styles.messageMeta}>{row.pending ? 'Sending…' : 'Interrupted'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8, padding: 12 },
  transcript: { flexGrow: 1, gap: 10, paddingVertical: 8 },
  empty: { alignItems: 'center', padding: 32 },
  message: { borderRadius: 12, maxWidth: '92%', padding: 12 },
  user: { alignSelf: 'flex-end', backgroundColor: '#dbeafe' },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6' },
  messageText: { color: '#111827', fontSize: 16, lineHeight: 22 },
  messageMeta: { color: '#4b5563', fontSize: 12, marginTop: 6 },
  activity: { color: '#4b5563', fontSize: 13, fontStyle: 'italic', paddingLeft: 4 },
  composer: { gap: 8 },
  input: {
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderWidth: 1,
    maxHeight: 140,
    minHeight: 48,
    padding: 12,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
});
