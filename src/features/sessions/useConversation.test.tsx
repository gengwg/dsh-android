import type { Context } from '@deepseek-ai/cordis';
import { act } from 'react';
import { createRoot } from 'test-renderer';

import { DshClientProvider } from '../client/DshClientProvider';
import type { NativeInteractionController } from '../interactions/interactionController';
import { InteractionProvider } from '../interactions/InteractionProvider';
import { useConversation } from './useConversation';

function observable<T>(value: T) {
  return {
    getSnapshot: () => value,
    subscribe: () => () => {},
  };
}

describe('useConversation', () => {
  it('retains once when traced remote services change identity', async () => {
    const release = jest.fn();
    const stopProjection = jest.fn();
    const projection = {
      getSnapshot: () => undefined,
      subscribe: () => stopProjection,
    };
    const reference = {
      binding: {
        session: {
          ...observable({ pendingSubmissions: [] }),
          projections: { faceOf: () => projection },
        },
        eventSource: observable({
          entries: [],
          hasMore: false,
          change: { kind: 'replace', entries: [] },
        }),
      },
      ready: Promise.resolve(),
      release,
    };
    const retain = jest.fn(() => reference);
    const client = {} as Context;
    Object.defineProperties(client, {
      sessions: { value: { retain } },
      remote: {
        get: () => ({ userQuestions: { answer: jest.fn() } }),
      },
    });
    const interactions = {} as NativeInteractionController;

    function Probe() {
      useConversation('session-1');
      return null;
    }

    function tree() {
      return (
        <InteractionProvider controller={interactions}>
          <DshClientProvider context={client}>
            <Probe />
          </DshClientProvider>
        </InteractionProvider>
      );
    }

    const renderer = createRoot();
    await act(async () => {
      renderer.render(tree());
    });
    expect(retain).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.render(tree());
    });
    expect(retain).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(stopProjection).toHaveBeenCalledTimes(1);
  });
});
