const REQUIRED_FUNCTIONS = [
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
] as const;

function readPath(root: object, path: string): unknown {
  let value: unknown = root;
  for (const segment of path.split('.')) {
    if (
      value === null
      || (typeof value !== 'object' && typeof value !== 'function')
    ) {
      return undefined;
    }
    value = Reflect.get(value, segment);
  }
  return value;
}

function hasTimeZone(root: object): boolean {
  const DateTimeFormat = readPath(root, 'Intl.DateTimeFormat');
  if (typeof DateTimeFormat !== 'function') return false;
  try {
    const formatter: Intl.DateTimeFormat = Reflect.construct(DateTimeFormat, []);
    return typeof formatter.resolvedOptions().timeZone === 'string';
  } catch {
    return false;
  }
}

export function missingDshRuntimeCapabilities(root: object = globalThis): string[] {
  const missing: string[] = REQUIRED_FUNCTIONS
    .filter(path => typeof readPath(root, path) !== 'function')
    .map(path => path);
  if (typeof readPath(root, 'Symbol.dispose') !== 'symbol') {
    missing.push('Symbol.dispose');
  }
  if (!hasTimeZone(root)) missing.push('Intl.DateTimeFormat.timeZone');
  return missing;
}

export function assertDshRuntimeCapabilities(root: object = globalThis): void {
  const missing = missingDshRuntimeCapabilities(root);
  if (missing.length > 0) {
    throw new Error(`Missing DSH runtime capabilities: ${missing.join(', ')}`);
  }
}
