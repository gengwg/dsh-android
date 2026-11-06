import {
  assertDshRuntimeCapabilities,
  missingDshRuntimeCapabilities,
} from './checks';

describe('DSH runtime capabilities', () => {
  it('accepts the current standards-compatible runtime', () => {
    expect(missingDshRuntimeCapabilities()).toEqual([]);
    expect(() => assertDshRuntimeCapabilities()).not.toThrow();
  });

  it('reports every missing capability before loading the client', () => {
    expect(missingDshRuntimeCapabilities({})).toEqual([
      'Promise.withResolvers',
      'AbortController',
      'AbortSignal.any',
      'crypto.getRandomValues',
      'URL',
      'ReadableStream',
      'TextEncoder',
      'TextDecoder',
      'Blob',
      'FormData',
      'Response',
      'Response.prototype.formData',
      'WebSocket',
      'fetch',
      'atob',
      'btoa',
      'Symbol.dispose',
      'Intl.DateTimeFormat.timeZone',
    ]);
    expect(() => assertDshRuntimeCapabilities({})).toThrow(
      /Promise\.withResolvers/,
    );
  });

  it('detects a missing nested capability', () => {
    const root = Object.create(globalThis) as typeof globalThis;
    Object.defineProperty(root, 'AbortSignal', { value: {} });

    expect(missingDshRuntimeCapabilities(root)).toContain('AbortSignal.any');
  });
});
