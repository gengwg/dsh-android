import { createDshComposition, type DshComposition } from './dshComposition';
import { clearCredentials, loadCredentials, saveCredentials } from './credentials';
import { bootstrapDshConnection, createNativeTransport } from './nativeTransport';
import type { DshCredentials } from './types';

export type ConnectionStatus =
  | 'idle'
  | 'restoring'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'signing-out';

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  serverUrl?: string;
  error?: string;
  persistenceWarning: boolean;
}

interface ConnectionControllerDependencies {
  loadCredentials: typeof loadCredentials;
  saveCredentials: typeof saveCredentials;
  clearCredentials: typeof clearCredentials;
  bootstrapDshConnection: typeof bootstrapDshConnection;
  createNativeTransport: typeof createNativeTransport;
  createDshComposition: typeof createDshComposition;
}

const DEFAULT_DEPENDENCIES: ConnectionControllerDependencies = {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  bootstrapDshConnection,
  createNativeTransport,
  createDshComposition,
};

export class DshConnectionController {
  private readonly dependencies: ConnectionControllerDependencies;
  private readonly listeners = new Set<() => void>();
  private snapshot: ConnectionSnapshot = {
    status: 'idle',
    persistenceWarning: false,
  };
  private composition?: DshComposition;
  private unsubscribeConnection?: () => void;
  private operation = 0;
  private abort?: AbortController;
  private credentialWrites: Promise<void> = Promise.resolve();

  constructor(dependencies: Partial<ConnectionControllerDependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getComposition(): DshComposition | undefined {
    return this.composition;
  }

  private publish(update: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }

  private begin(status: ConnectionStatus): number {
    this.operation += 1;
    this.abort?.abort();
    this.abort = new AbortController();
    this.publish({ status, error: undefined, persistenceWarning: false });
    return this.operation;
  }

  private isCurrent(operation: number): boolean {
    return this.operation === operation;
  }

  private async disposeComposition(): Promise<boolean> {
    this.unsubscribeConnection?.();
    this.unsubscribeConnection = undefined;
    const current = this.composition;
    this.composition = undefined;
    try {
      await current?.dispose();
      return true;
    } catch {
      return false;
    }
  }

  private enqueueCredentialWrite(
    operation: number,
    write: () => Promise<void>,
  ): Promise<boolean> {
    const result = this.credentialWrites.then(async () => {
      if (!this.isCurrent(operation)) return false;
      try {
        await write();
        return true;
      } catch {
        return false;
      }
    });
    this.credentialWrites = result.then(() => {});
    return result;
  }

  private async establish(operation: number, credentials: DshCredentials): Promise<void> {
    const allowInsecureHttp = credentials.serverUrl.startsWith('http://');
    const transport = this.dependencies.createNativeTransport({
      serverUrl: credentials.serverUrl,
      credentials,
      allowInsecureHttp,
      onCredentialsChange: (updated) => {
        if (!this.isCurrent(operation)) return;
        if (updated.cookies.length === 0) {
          void this.expire(operation);
          return;
        }
        void this.enqueueCredentialWrite(
          operation,
          () => this.dependencies.saveCredentials(updated, { allowInsecureHttp }),
        ).then((saved) => {
          if (!saved && this.isCurrent(operation)) this.publish({ persistenceWarning: true });
        });
      },
      onAuthenticationFailure: () => {
        if (this.isCurrent(operation)) void this.expire(operation);
      },
    });
    const composition = await this.dependencies.createDshComposition({
      transport,
      location: { hostname: new URL(credentials.serverUrl).hostname },
    });
    if (!this.isCurrent(operation)) {
      await composition.dispose();
      return;
    }

    this.composition = composition;
    this.unsubscribeConnection = composition.context.connection.state.subscribe(() => {
      this.syncConnectionState(operation);
    });
    this.publish({
      serverUrl: credentials.serverUrl,
      status: 'connecting',
      error: undefined,
    });
    this.syncConnectionState(operation);

    const saved = await this.enqueueCredentialWrite(
      operation,
      () => this.dependencies.saveCredentials(transport.getCredentials(), { allowInsecureHttp }),
    );
    if (!saved && this.isCurrent(operation)) this.publish({ persistenceWarning: true });
  }

  private syncConnectionState(operation: number): void {
    if (!this.isCurrent(operation) || !this.composition) return;
    const state = this.composition.context.connection.state.getSnapshot();
    if (state === 'connected') {
      this.publish({ status: 'connected', error: undefined });
    } else if (state === 'disconnected') {
      this.publish({ status: 'reconnecting' });
    } else if (state === 'connecting') {
      this.publish({ status: 'connecting' });
    }
  }

  async restore(): Promise<void> {
    const operation = this.begin('restoring');
    const disposed = await this.disposeComposition();
    if (!this.isCurrent(operation)) return;
    if (!disposed) {
      this.publish({
        status: 'disconnected',
        error: 'Previous connection could not be closed. Restart the app and try again.',
      });
      return;
    }
    try {
      const credentials = await this.dependencies.loadCredentials({ allowInsecureHttp: true });
      if (!this.isCurrent(operation)) return;
      if (!credentials) {
        this.publish({ status: 'disconnected', serverUrl: undefined, error: undefined });
        return;
      }
      await this.establish(operation, credentials);
    } catch {
      if (this.isCurrent(operation)) {
        this.publish({
          status: 'disconnected',
          error: 'Stored connection could not be restored. Connect again.',
        });
      }
    }
  }

  async connect(input: {
    serverUrl: string;
    launchToken: string;
    allowInsecureHttp?: boolean;
  }): Promise<void> {
    const operation = this.begin('connecting');
    const disposed = await this.disposeComposition();
    if (!this.isCurrent(operation)) return;
    if (!disposed) {
      this.publish({
        status: 'disconnected',
        error: 'Previous connection could not be closed. Restart the app and try again.',
      });
      return;
    }
    try {
      const credentials = await this.dependencies.bootstrapDshConnection({
        serverUrl: input.serverUrl,
        launchToken: input.launchToken,
        allowInsecureHttp: input.allowInsecureHttp,
        signal: this.abort?.signal,
      });
      if (!this.isCurrent(operation)) return;
      await this.establish(operation, credentials);
    } catch {
      if (this.isCurrent(operation)) {
        this.publish({
          status: 'disconnected',
          error: 'Could not connect. Check the server URL and launch token.',
        });
      }
    }
  }

  reconnect(): void {
    if (!this.composition) return;
    this.composition.context.connection.reconnect();
    this.publish({ status: 'reconnecting', error: undefined });
  }

  private async expire(operation: number): Promise<void> {
    if (!this.isCurrent(operation)) return;
    this.operation += 1;
    const current = this.operation;
    this.abort?.abort();
    this.publish({
      status: 'disconnected',
      error: 'Authentication expired. Connect again.',
    });
    const disposed = await this.disposeComposition();
    const cleared = await this.enqueueCredentialWrite(
      current,
      () => this.dependencies.clearCredentials(),
    );
    if (this.isCurrent(current)) {
      this.publish({
        persistenceWarning: !cleared || !disposed,
        error: disposed
          ? 'Authentication expired. Connect again.'
          : 'Authentication expired, but connection cleanup failed. Restart the app.',
      });
    }
  }

  async signOut(): Promise<void> {
    const operation = this.begin('signing-out');
    this.abort?.abort();
    const disposed = await this.disposeComposition();
    if (!this.isCurrent(operation)) return;
    const cleared = await this.enqueueCredentialWrite(
      operation,
      () => this.dependencies.clearCredentials(),
    );
    if (!this.isCurrent(operation)) return;
    this.publish({
      status: 'disconnected',
      serverUrl: undefined,
      error: !cleared
        ? 'Signed out locally, but stored credentials could not be cleared.'
        : !disposed
          ? 'Credentials cleared, but connection cleanup failed. Restart the app.'
          : undefined,
    });
  }

  async dispose(): Promise<void> {
    this.operation += 1;
    this.abort?.abort();
    await this.disposeComposition();
    await this.credentialWrites;
    this.listeners.clear();
  }
}
