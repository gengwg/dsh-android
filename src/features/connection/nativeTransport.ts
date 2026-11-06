import { fetch as expoFetch } from 'expo/fetch';

import {
  createCookieHeader,
  getSetCookieHeaders,
  mergeCookies,
  parseSetCookieHeaders,
  validateStoredCookies,
} from './cookie';
import type {
  BootstrapDshConnectionOptions,
  DshCookie,
  DshCredentials,
  NativeTransport,
  NativeTransportOptions,
  NativeWebSocketConstructor,
  ServerUrlOptions,
} from './types';

const MAX_SERVER_URL_LENGTH = 2048;
const MAX_LAUNCH_TOKEN_LENGTH = 512;
const MAX_TRANSPORT_URL_LENGTH = 8192;
const MAX_LOCATION_LENGTH = 4096;
const CONNECT_PATH = '/connect';
const CONNECT_TARGET_PATH = '/api/remote.mux';

function invalidServerUrl(): never {
  throw new Error('Invalid DSH server URL');
}

export function parseDshServerUrl(
  input: string,
  options: ServerUrlOptions = {},
): URL {
  if (input.length > MAX_SERVER_URL_LENGTH) {
    throw new Error('DSH server URL is too long');
  }
  let value = input.trim();
  if (value.length === 0 || /\s/.test(value)) invalidServerUrl();
  if (value.includes('?') || value.includes('#')) {
    throw new Error('DSH server URL must not contain a query or fragment');
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidServerUrl();
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.host.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    /^https?:\/\/[^/]*@/i.test(value)
  ) {
    invalidServerUrl();
  }
  if (url.protocol === 'http:' && options.allowInsecureHttp !== true) {
    throw new Error('HTTP requires the explicit allowInsecureHttp option');
  }
  if (url.pathname !== '/') {
    throw new Error('DSH server URL must not contain a path');
  }
  return url;
}

function resolveTransportUrl(input: string | URL, server: URL): URL {
  const value = String(input);
  if (value.length > MAX_TRANSPORT_URL_LENGTH) {
    throw new Error('DSH transport URL is too long');
  }
  let url: URL;
  try {
    url = new URL(value, server);
  } catch {
    throw new Error('Invalid DSH transport URL');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('Invalid DSH transport URL');
  }
  if (url.origin !== server.origin) {
    throw new Error('DSH transport URL authority does not match the server');
  }
  return url;
}

function resolveWebSocketUrl(input: string | URL, server: URL): URL {
  const value = String(input);
  if (value.length > MAX_TRANSPORT_URL_LENGTH) {
    throw new Error('DSH transport URL is too long');
  }
  let url: URL;
  try {
    url = new URL(value, server);
  } catch {
    throw new Error('Invalid DSH WebSocket URL');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('Invalid DSH WebSocket URL');
  }

  const secure = server.protocol === 'https:';
  const expectedProtocol = secure ? 'wss:' : 'ws:';
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (url.protocol !== server.protocol) {
      throw new Error('DSH WebSocket authority does not match the server');
    }
    url.protocol = expectedProtocol;
  }
  if (url.protocol !== expectedProtocol || url.host !== server.host) {
    throw new Error('DSH WebSocket authority does not match the server');
  }
  return url;
}

function validateResponseAuthority(response: Response, server: URL): void {
  if (!response.url) return;
  try {
    if (new URL(response.url).origin !== server.origin) {
      throw new Error('DSH response authority does not match the server');
    }
  } catch {
    throw new Error('DSH response authority does not match the server');
  }
}

function redirectTarget(response: Response, requestUrl: URL, server: URL): URL | null {
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers.get('location');
  if (location === null) return null;
  if (location.length > MAX_LOCATION_LENGTH) {
    throw new Error('DSH redirect location is too long');
  }

  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    throw new Error('Invalid DSH redirect location');
  }
  if (target.origin !== server.origin || target.username || target.password) {
    throw new Error('DSH redirect authority does not match the server');
  }
  return target;
}

function cloneCookies(cookies: readonly DshCookie[]): DshCookie[] {
  return cookies.map((cookie) => ({ ...cookie }));
}

function launchToken(value: string): string {
  if (value.length > MAX_LAUNCH_TOKEN_LENGTH) {
    throw new Error('DSH launch token is too long');
  }
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('Invalid DSH launch token');
  }
  return token;
}

/** Implements the installed 0.2.1-rc.5 exchange; 0.2.2-alpha.2 has the same fields. */
export async function bootstrapDshConnection(
  options: BootstrapDshConnectionOptions,
): Promise<DshCredentials> {
  const server = parseDshServerUrl(options.serverUrl, options);
  const token = launchToken(options.launchToken);
  const interactions = options.interactions ?? 'answer';
  if (interactions !== 'answer' && interactions !== 'none') {
    throw new Error('Invalid DSH interactions value');
  }

  const connectUrl = new URL(CONNECT_PATH, server);
  connectUrl.searchParams.set('token', token);
  connectUrl.searchParams.set('interactions', interactions);
  const doFetch = options.fetch ?? expoFetch;
  let response: Response;
  try {
    response = await doFetch(connectUrl, {
      method: 'GET',
      headers: { Origin: server.origin },
      credentials: 'omit',
      redirect: 'manual',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    // Native errors can contain the token-bearing request URL.
    throw new Error('DSH bootstrap request failed');
  }

  validateResponseAuthority(response, server);
  if (response.status !== 302) {
    throw new Error(`DSH bootstrap returned HTTP ${response.status}`);
  }
  const target = redirectTarget(response, connectUrl, server);
  if (
    target === null ||
    target.pathname !== CONNECT_TARGET_PATH ||
    target.search ||
    target.hash
  ) {
    throw new Error('Invalid DSH bootstrap redirect');
  }

  const parsed = parseSetCookieHeaders(getSetCookieHeaders(response), {
    url: server,
    now: options.now,
  });
  const cookies = mergeCookies([], parsed, options.now);
  if (cookies.length === 0) {
    throw new Error('DSH bootstrap did not return reusable credentials');
  }
  return { version: 1, serverUrl: server.origin, cookies };
}

export function createNativeTransport(options: NativeTransportOptions): NativeTransport {
  const server = parseDshServerUrl(options.serverUrl, options);
  if (options.credentials.version !== 1) {
    throw new Error('Unsupported DSH credential version');
  }
  let credentialServer: URL;
  try {
    credentialServer = parseDshServerUrl(options.credentials.serverUrl, options);
  } catch {
    throw new Error('Invalid stored DSH credentials');
  }
  if (credentialServer.origin !== server.origin) {
    throw new Error('Stored credentials belong to a different DSH server');
  }

  const now = options.now ?? Date.now;
  let cookies = validateStoredCookies(options.credentials.cookies, {
    url: server,
    now: now(),
  });
  if (cookies.length === 0) {
    throw new Error('DSH authentication credentials are missing or expired');
  }
  const doFetch = options.fetch ?? expoFetch;
  const WebSocketImpl =
    options.webSocket ?? (globalThis.WebSocket as NativeWebSocketConstructor);

  const snapshot = (): DshCredentials => ({
    version: 1,
    serverUrl: server.origin,
    cookies: cloneCookies(cookies),
  });
  const cookieHeader = (url: URL): string => {
    const header = createCookieHeader(cookies, url, now());
    if (!header) {
      options.onAuthenticationFailure?.();
      throw new Error('DSH authentication credentials are missing or expired');
    }
    return header;
  };
  const refreshCookies = (response: Response, requestUrl: URL): void => {
    const headers = getSetCookieHeaders(response);
    if (headers.length === 0) return;
    const updates = parseSetCookieHeaders(headers, { url: requestUrl, now: now() });
    cookies = mergeCookies(cookies, updates, now());
    options.onCredentialsChange?.(snapshot());
    if (cookies.length === 0) options.onAuthenticationFailure?.();
  };

  const authenticatedFetch = async (
    input: string | URL,
    init: RequestInit,
  ): Promise<Response> => {
    const requestUrl = resolveTransportUrl(input, server);
    const headers = new Headers(init.headers);
    headers.set('Origin', server.origin);
    headers.set('Cookie', cookieHeader(requestUrl));

    let response: Response;
    try {
      response = await doFetch(requestUrl, {
        ...init,
        headers,
        credentials: 'omit',
        redirect: 'manual',
      });
    } catch {
      throw new Error('DSH request failed');
    }
    validateResponseAuthority(response, server);
    redirectTarget(response, requestUrl, server);
    if (response.status === 401) options.onAuthenticationFailure?.();
    refreshCookies(response, requestUrl);
    return response;
  };

  return {
    streamBaseUrl: server.href,
    fetch: authenticatedFetch,
    createWebSocket(input) {
      const url = resolveWebSocketUrl(input, server);
      const headers = { Origin: server.origin, Cookie: cookieHeader(url) };
      try {
        return new WebSocketImpl(url.href, [], { headers });
      } catch {
        throw new Error('DSH WebSocket could not be created');
      }
    },
    getCredentials: snapshot,
  };
}
