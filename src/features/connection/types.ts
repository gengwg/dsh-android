import type {
  ClientTransportHooks,
  ConnectionInteractions,
  ConnectionWebSocket,
  ConnectionWebSocketFactory,
} from '@deepseek-ai/dsh-client-connection/client';

export interface ServerUrlOptions {
  /** Allows http:// URLs without changing native cleartext policy. */
  allowInsecureHttp?: boolean;
}

export type CookieSameSite = 'Strict' | 'Lax' | 'None';

export interface DshCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  httpOnly: boolean;
  expiresAt?: number;
  sameSite?: CookieSameSite;
}

export interface DshCredentials {
  version: 1;
  serverUrl: string;
  cookies: DshCookie[];
}

export interface CookieContext {
  url: URL;
  now?: number;
}

export interface ResponseHeaderSource {
  readonly headers: Headers;
  readonly _rawHeaders?: unknown;
}

export type NativeFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface NativeWebSocketConstructor {
  new (
    url: string,
    protocols: string[] | null,
    options: { headers: Record<string, string> },
  ): ConnectionWebSocket;
}

export interface BootstrapDshConnectionOptions extends ServerUrlOptions {
  serverUrl: string;
  launchToken: string;
  interactions?: ConnectionInteractions;
  signal?: AbortSignal;
  fetch?: NativeFetch;
  now?: number;
}

export interface NativeTransportOptions extends ServerUrlOptions {
  serverUrl: string;
  credentials: DshCredentials;
  fetch?: NativeFetch;
  webSocket?: NativeWebSocketConstructor;
  now?: () => number;
  onCredentialsChange?: (credentials: DshCredentials) => void;
  onAuthenticationFailure?: () => void;
}

export interface NativeTransport extends ClientTransportHooks {
  fetch: NonNullable<ClientTransportHooks['fetch']>;
  createWebSocket: ConnectionWebSocketFactory;
  streamBaseUrl: string;
  getCredentials(): DshCredentials;
}

export interface CredentialStoreOptions extends ServerUrlOptions {
  now?: number;
}
