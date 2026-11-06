import type { ConnectionWebSocket } from '@deepseek-ai/dsh-client-connection/client';

import {
  bootstrapDshConnection,
  createNativeTransport,
  parseDshServerUrl,
} from '../nativeTransport';
import type {
  DshCredentials,
  NativeFetch,
  NativeTransportOptions,
} from '../types';

const NOW = Date.parse('2026-11-04T20:00:00Z');
const COOKIE =
  'dsh-auth-test=test-cookie-value; Max-Age=3600; Path=/; Expires=Wed, 04 Nov 2026 21:00:00 GMT; HttpOnly; SameSite=Strict; Secure';

function response(
  status: number,
  options: { location?: string; setCookie?: string[] } = {},
): Response {
  const result = new Response(null, {
    status,
    headers: options.location ? { Location: options.location } : undefined,
  });
  Object.defineProperty(result, '_rawHeaders', {
    value: (options.setCookie ?? []).map((value) => ['Set-Cookie', value]),
  });
  return result;
}

function credentials(): DshCredentials {
  return {
    version: 1,
    serverUrl: 'https://dsh.test',
    cookies: [
      {
        name: 'dsh-auth-test',
        value: 'test-cookie-value',
        domain: 'dsh.test',
        path: '/',
        hostOnly: true,
        secure: true,
        httpOnly: true,
        sameSite: 'Strict',
        expiresAt: NOW + 3_600_000,
      },
    ],
  };
}

class FakeWebSocket {
  static last:
    | {
        url: string;
        protocols: string[] | null;
        options: { headers: Record<string, string> };
      }
    | undefined;

  readyState = 0;

  constructor(
    url: string,
    protocols: string[] | null,
    options: { headers: Record<string, string> },
  ) {
    FakeWebSocket.last = { url, protocols, options };
  }

  send(_data: string): void {}
  close(_code?: number, _reason?: string): void {}
  addEventListener: ConnectionWebSocket['addEventListener'] = () => {};
  removeEventListener: ConnectionWebSocket['removeEventListener'] = () => {};
}

function transportOptions(
  fetch: NativeFetch,
  overrides: Partial<NativeTransportOptions> = {},
): NativeTransportOptions {
  return {
    serverUrl: 'https://dsh.test',
    credentials: credentials(),
    fetch,
    webSocket: FakeWebSocket,
    now: () => NOW,
    ...overrides,
  };
}

describe('DSH server and bootstrap validation', () => {
  it('defaults schemeless servers to HTTPS and normalizes the root URL', () => {
    expect(parseDshServerUrl('dsh.test').href).toBe('https://dsh.test/');
    expect(parseDshServerUrl('https://dsh.test:443').origin).toBe(
      'https://dsh.test',
    );
  });

  it('requires explicit opt-in for HTTP', () => {
    expect(() => parseDshServerUrl('http://localhost:8080')).toThrow(
      'HTTP requires the explicit allowInsecureHttp option',
    );
    expect(
      parseDshServerUrl('http://localhost:8080', { allowInsecureHttp: true })
        .href,
    ).toBe('http://localhost:8080/');
  });

  it.each([
    'https://user:password@dsh.test',
    'https://dsh.test/api',
    'https://dsh.test?token=input',
    'https://dsh.test#fragment',
    'ws://dsh.test',
    'https://dsh.test/path with-space',
  ])('rejects unsafe or unexpected server URL %s', (value) => {
    expect(() => parseDshServerUrl(value)).toThrow();
  });

  it('bounds server and launch-token inputs', () => {
    expect(() => parseDshServerUrl(`https://${'a'.repeat(3000)}`)).toThrow(
      'DSH server URL is too long',
    );
    expect(() =>
      bootstrapDshConnection({
        serverUrl: 'dsh.test',
        launchToken: 'x'.repeat(513),
        fetch: jest.fn(),
      }),
    ).rejects.toThrow('DSH launch token is too long');
    expect(() =>
      bootstrapDshConnection({
        serverUrl: 'dsh.test',
        launchToken: 'not a token',
        fetch: jest.fn(),
      }),
    ).rejects.toThrow('Invalid DSH launch token');
  });

  it('uses the rc.5 GET exchange without following into remote.mux', async () => {
    const fetch: jest.MockedFunction<NativeFetch> = jest.fn();
    fetch.mockResolvedValue(
      response(302, {
        location: './api/remote.mux',
        setCookie: [COOKIE],
      }),
    );

    const result = await bootstrapDshConnection({
      serverUrl: 'https://dsh.test',
      launchToken: 'test-launch-token',
      interactions: 'answer',
      fetch,
      now: NOW,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    expect(String(input)).toBe(
      'https://dsh.test/connect?token=test-launch-token&interactions=answer',
    );
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
    });
    expect(new Headers(init?.headers).get('Origin')).toBe('https://dsh.test');
    expect(result).toEqual(credentials());
    expect(JSON.stringify(result)).not.toContain('test-launch-token');
  });

  it('rejects a cross-authority bootstrap redirect', async () => {
    const fetch: NativeFetch = async () =>
      response(302, {
        location: 'https://evil.test/api/remote.mux',
        setCookie: [COOKIE],
      });

    await expect(
      bootstrapDshConnection({
        serverUrl: 'dsh.test',
        launchToken: 'test-launch-token',
        fetch,
        now: NOW,
      }),
    ).rejects.toThrow('DSH redirect authority does not match the server');
  });

  it('redacts token-bearing native fetch failures', async () => {
    const fetch: NativeFetch = async () => {
      throw new Error(
        'failed https://dsh.test/connect?token=test-launch-token',
      );
    };

    let message = '';
    try {
      await bootstrapDshConnection({
        serverUrl: 'dsh.test',
        launchToken: 'test-launch-token',
        fetch,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('DSH bootstrap request failed');
    expect(message).not.toContain('test-launch-token');
  });
});

describe('authenticated native transport', () => {
  beforeEach(() => {
    FakeWebSocket.last = undefined;
  });

  it('resolves document-relative RPC routes and injects authentication', async () => {
    const fetch: jest.MockedFunction<NativeFetch> = jest.fn();
    fetch.mockResolvedValue(response(200));
    const transport = createNativeTransport(transportOptions(fetch));

    await transport.fetch('api/workspace.list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const [input, init] = fetch.mock.calls[0];
    expect(String(input)).toBe('https://dsh.test/api/workspace.list');
    expect(init).toMatchObject({
      method: 'POST',
      body: '{}',
      credentials: 'omit',
      redirect: 'manual',
    });
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('Origin')).toBe('https://dsh.test');
    expect(headers.get('Cookie')).toBe('dsh-auth-test=test-cookie-value');
    expect(transport.streamBaseUrl).toBe('https://dsh.test/');
  });

  it('rejects cross-authority RPC URLs and redirects before exposing a response', async () => {
    const fetch: jest.MockedFunction<NativeFetch> = jest.fn();
    fetch.mockResolvedValue(
      response(302, { location: 'https://evil.test/api/remote.mux' }),
    );
    const transport = createNativeTransport(transportOptions(fetch));

    await expect(
      transport.fetch('https://evil.test/api/workspace.list', {}),
    ).rejects.toThrow('DSH transport URL authority does not match the server');
    expect(fetch).not.toHaveBeenCalled();

    await expect(transport.fetch('api/workspace.list', {})).rejects.toThrow(
      'DSH redirect authority does not match the server',
    );
  });

  it('constructs an EventTarget-compatible WebSocket with headers', () => {
    const fetch: NativeFetch = async () => response(200);
    const transport = createNativeTransport(transportOptions(fetch));

    const socket = transport.createWebSocket(
      'https://dsh.test/api/remote.mux',
    );

    expect(socket.readyState).toBe(0);
    expect(FakeWebSocket.last).toEqual({
      url: 'wss://dsh.test/api/remote.mux',
      protocols: [],
      options: {
        headers: {
          Origin: 'https://dsh.test',
          Cookie: 'dsh-auth-test=test-cookie-value',
        },
      },
    });
    expect(() =>
      transport.createWebSocket('wss://evil.test/api/remote.mux'),
    ).toThrow('DSH WebSocket authority does not match the server');
    expect(() =>
      transport.createWebSocket('http://dsh.test/api/remote.mux'),
    ).toThrow('DSH WebSocket authority does not match the server');
    expect(FakeWebSocket.last?.url).toBe('wss://dsh.test/api/remote.mux');
  });

  it('refreshes in-memory cookies from RPC Set-Cookie headers', async () => {
    const fetch: jest.MockedFunction<NativeFetch> = jest.fn();
    fetch
      .mockResolvedValueOnce(
        response(200, {
          setCookie: [
            'dsh-auth-test=refreshed-test-value; Max-Age=120; Path=/; Secure; HttpOnly',
          ],
        }),
      )
      .mockResolvedValueOnce(response(200));
    const onCredentialsChange = jest.fn();
    const transport = createNativeTransport(
      transportOptions(fetch, { onCredentialsChange }),
    );

    await transport.fetch('api/workspace.list', {});
    expect(transport.getCredentials().cookies[0]).toMatchObject({
      value: 'refreshed-test-value',
      expiresAt: NOW + 120_000,
    });
    expect(onCredentialsChange).toHaveBeenCalledWith(
      transport.getCredentials(),
    );

    await transport.fetch('api/workspace.list', {});
    const headers = new Headers(fetch.mock.calls[1][1]?.headers);
    expect(headers.get('Cookie')).toBe(
      'dsh-auth-test=refreshed-test-value',
    );
  });

  it('reports HTTP 401 to the connection owner', async () => {
    const onAuthenticationFailure = jest.fn();
    const transport = createNativeTransport(transportOptions(
      async () => response(401),
      { onAuthenticationFailure },
    ));

    await transport.fetch('api/workspace.list', {});
    expect(onAuthenticationFailure).toHaveBeenCalledTimes(1);
  });

  it('reports server-side credential deletion to the connection owner', async () => {
    const onAuthenticationFailure = jest.fn();
    const onCredentialsChange = jest.fn();
    const transport = createNativeTransport(transportOptions(
      async () => response(200, {
        setCookie: ['dsh-auth-test=; Max-Age=0; Path=/; Secure; HttpOnly'],
      }),
      { onAuthenticationFailure, onCredentialsChange },
    ));

    await transport.fetch('api/workspace.list', {});
    expect(onCredentialsChange).toHaveBeenCalledWith({
      version: 1,
      serverUrl: 'https://dsh.test',
      cookies: [],
    });
    expect(onAuthenticationFailure).toHaveBeenCalledTimes(1);
  });
});
