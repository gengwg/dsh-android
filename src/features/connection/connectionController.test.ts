import { Context } from '@deepseek-ai/cordis';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';

import { NativeInteractionController } from '../interactions';
import { DshConnectionController } from './connectionController';
import { createNativeTransport } from './nativeTransport';
import type { CredentialStoreOptions, DshCredentials, NativeTransport } from './types';

function credentials(serverUrl = 'https://dsh.example.com'): DshCredentials {
  return {
    version: 1,
    serverUrl,
    cookies: [{
      name: 'dsh_session',
      value: 'test-only-cookie',
      domain: new URL(serverUrl).hostname,
      path: '/',
      hostOnly: true,
      secure: true,
      httpOnly: true,
    }],
  };
}

function composition() {
  const context = new Context();
  installConnection(context, {
    interactions: 'answer',
    transport: {
      streamBaseUrl: 'https://dsh.example.com',
      createWebSocket: () => {
        throw new Error('No socket expected in controller tests');
      },
    },
  });
  const interactions = new NativeInteractionController();
  return {
    context,
    interactions,
    dispose: jest.fn(async () => {
      interactions.dispose();
      await context.fiber.dispose();
    }),
  };
}

describe('DshConnectionController', () => {
  it('restores no saved connection', async () => {
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => null),
    });

    await controller.restore();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'disconnected',
      persistenceWarning: false,
    });
    expect(controller.getComposition()).toBeUndefined();
    await controller.dispose();
  });

  it('restores credentials and disposes them on sign-out', async () => {
    const saved = credentials();
    const created = composition();
    const saveCredentials = jest.fn(async () => {});
    const clearCredentials = jest.fn(async () => {});
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => saved),
      saveCredentials,
      clearCredentials,
      createDshComposition: jest.fn(async () => created),
    });

    await controller.restore();
    expect(saveCredentials).toHaveBeenCalled();
    expect(controller.getComposition()).toBe(created);
    expect(controller.getSnapshot().serverUrl).toBe(saved.serverUrl);

    await controller.signOut();
    expect(clearCredentials).toHaveBeenCalledTimes(1);
    expect(created.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe('disconnected');
    await controller.dispose();
  });

  it('fences an older bootstrap behind the latest connect', async () => {
    let resolveFirst: ((value: DshCredentials) => void) | undefined;
    const first = new Promise<DshCredentials>((resolve) => {
      resolveFirst = resolve;
    });
    const secondCredentials = credentials('https://second.example.com');
    const bootstrapDshConnection = jest.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(secondCredentials);
    const created = composition();
    const createDshComposition = jest.fn(async () => created);
    const controller = new DshConnectionController({
      bootstrapDshConnection,
      createDshComposition,
      saveCredentials: jest.fn(async () => {}),
    });

    const connectingFirst = controller.connect({ serverUrl: 'https://first.example.com', launchToken: 'first' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(bootstrapDshConnection).toHaveBeenCalledTimes(1);
    const connectingSecond = controller.connect({ serverUrl: secondCredentials.serverUrl, launchToken: 'second' });
    resolveFirst?.(credentials('https://first.example.com'));
    await Promise.all([connectingFirst, connectingSecond]);

    expect(createDshComposition).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().serverUrl).toBe(secondCredentials.serverUrl);
    await controller.dispose();
  });

  it('persists the latest transport cookie after an establishment-time refresh', async () => {
    const saveCredentials = jest.fn<
      Promise<void>,
      [DshCredentials, CredentialStoreOptions?]
    >(async () => {});
    const created = composition();
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => credentials()),
      saveCredentials,
      createNativeTransport: options => createNativeTransport({
        ...options,
        fetch: async () => {
          const result = new Response(null, { status: 200 });
          Object.defineProperty(result, '_rawHeaders', {
            value: [[
              'Set-Cookie',
              'dsh_session=refreshed-test-cookie; Path=/; Secure; HttpOnly',
            ]],
          });
          return result;
        },
      }),
      createDshComposition: jest.fn(async ({ transport }) => {
        if (!transport.fetch) throw new Error('Expected native fetch');
        await transport.fetch('api/refresh', {});
        return created;
      }),
    });

    await controller.restore();
    const initialWrite = saveCredentials.mock.calls.at(-1)?.[0];
    expect(initialWrite?.cookies[0]?.value).toBe('refreshed-test-cookie');
    await controller.dispose();
  });

  it('serializes a pending credential refresh behind sign-out', async () => {
    const order: string[] = [];
    let finishSave: (() => void) | undefined;
    const saveCredentials = jest.fn(() => new Promise<void>((resolve) => {
      order.push('save-started');
      finishSave = () => {
        order.push('save-finished');
        resolve();
      };
    }));
    const clearCredentials = jest.fn(async () => {
      order.push('cleared');
    });
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => credentials()),
      saveCredentials,
      clearCredentials,
      createDshComposition: jest.fn(async () => composition()),
    });

    const restoring = controller.restore();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saveCredentials).toHaveBeenCalledTimes(1);
    const signingOut = controller.signOut();
    finishSave?.();
    await Promise.all([restoring, signingOut]);

    expect(order).toEqual(['save-started', 'save-finished', 'cleared']);
    expect(controller.getSnapshot().status).toBe('disconnected');
    await controller.dispose();
  });

  it('clears credentials on sign-out even if connection disposal fails', async () => {
    const created = composition();
    created.dispose.mockRejectedValue(new Error('stream cleanup failed'));
    const clearCredentials = jest.fn(async () => {});
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => credentials()),
      clearCredentials,
      createDshComposition: jest.fn(async () => created),
    });

    await controller.restore();
    await controller.signOut();

    expect(clearCredentials).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'disconnected',
      error: 'Credentials cleared, but connection cleanup failed. Restart the app.',
    });
    await controller.dispose();
  });

  it('expires authentication, clears credentials, and tears down the client', async () => {
    const saved = credentials();
    const created = composition();
    const clearCredentials = jest.fn(async () => {});
    let transport: NativeTransport | undefined;
    const controller = new DshConnectionController({
      loadCredentials: jest.fn(async () => saved),
      clearCredentials,
      createNativeTransport: (options) => {
        transport = createNativeTransport({
          ...options,
          fetch: async () => new Response(null, { status: 401 }),
        });
        return transport;
      },
      createDshComposition: jest.fn(async () => created),
    });

    await controller.restore();
    await transport?.fetch('api/test', {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clearCredentials).toHaveBeenCalledTimes(1);
    expect(created.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'disconnected',
      error: 'Authentication expired. Connect again.',
    });
    await controller.dispose();
  });
});
