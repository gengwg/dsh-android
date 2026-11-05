import type {
  CookieContext,
  CookieSameSite,
  DshCookie,
  ResponseHeaderSource,
} from './types';

const MAX_COOKIE_COUNT = 8;
const MAX_SET_COOKIE_LENGTH = 8192;
const MAX_COMBINED_SET_COOKIE_LENGTH = 32768;
const MAX_COOKIE_HEADER_LENGTH = 16384;
const MAX_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;
const MAX_ATTRIBUTES = 16;
const MAX_DOMAIN_LENGTH = 253;
const MAX_PATH_LENGTH = 1024;
const MAX_EXPIRES_LENGTH = 64;
const MAX_RAW_HEADER_COUNT = 128;
const MAX_RAW_HEADERS_LENGTH = 65536;

const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN_PATTERN = new RegExp(`^${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*$`, 'i');
const COOKIE_START_PATTERN = /^\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=/;

function invalidCookie(): never {
  throw new Error('Invalid Set-Cookie response');
}

function timestamp(value: number | undefined): number {
  const now = value ?? Date.now();
  if (!Number.isSafeInteger(now)) throw new Error('Invalid cookie timestamp');
  return now;
}

function splitCombinedSetCookie(value: string): string[] {
  if (value.length > MAX_COMBINED_SET_COOKIE_LENGTH) {
    throw new Error('Set-Cookie response is too large');
  }

  const headers: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') quoted = !quoted;
    if (
      value[index] !== ',' ||
      quoted ||
      !COOKIE_START_PATTERN.test(
        value.slice(index + 1, index + MAX_NAME_LENGTH + 17),
      )
    ) {
      continue;
    }
    headers.push(value.slice(start, index).trim());
    start = index + 1;
  }
  headers.push(value.slice(start).trim());
  if (headers.some((header) => header.length === 0)) invalidCookie();
  return headers;
}

function normalizeHeaders(values: readonly string[]): string[] {
  if (values.length > MAX_COOKIE_COUNT) {
    throw new Error('Too many Set-Cookie headers');
  }
  const headers = values.flatMap((value) => {
    if (typeof value !== 'string') invalidCookie();
    return splitCombinedSetCookie(value);
  });
  if (headers.length > MAX_COOKIE_COUNT) {
    throw new Error('Too many Set-Cookie headers');
  }
  for (const header of headers) {
    if (header.length > MAX_SET_COOKIE_LENGTH) {
      throw new Error('Set-Cookie response is too large');
    }
  }
  return headers;
}

function rawSetCookieHeaders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_RAW_HEADER_COUNT) {
    throw new Error('Response headers are too large');
  }

  let totalLength = 0;
  const values: string[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [name, value] = entry;
    if (typeof name !== 'string' || typeof value !== 'string') continue;
    totalLength += name.length + value.length;
    if (totalLength > MAX_RAW_HEADERS_LENGTH) {
      throw new Error('Response headers are too large');
    }
    if (name.toLowerCase() === 'set-cookie') values.push(value);
  }
  return values;
}

/** Reads repeated native headers before falling back to optional public APIs. */
export function getSetCookieHeaders(response: ResponseHeaderSource): string[] {
  // Android exposure of these SDK 58 raw headers remains device-unverified.
  const raw = rawSetCookieHeaders(response._rawHeaders);
  if (raw.length > 0) return normalizeHeaders(raw);

  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === 'function') {
    const values = headers.getSetCookie.call(headers);
    if (!Array.isArray(values)) invalidCookie();
    return normalizeHeaders(values);
  }

  const combined = headers.get('set-cookie');
  return combined === null ? [] : normalizeHeaders([combined]);
}

function splitAttributes(header: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < header.length; index += 1) {
    if (header[index] === '"') quoted = !quoted;
    if (header[index] === ';' && !quoted) {
      segments.push(header.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) invalidCookie();
  segments.push(header.slice(start));
  if (segments.length > MAX_ATTRIBUTES + 1) invalidCookie();
  return segments;
}

function validNameAndValue(name: string, value: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    TOKEN_PATTERN.test(name) &&
    value.length <= MAX_VALUE_LENGTH &&
    COOKIE_VALUE_PATTERN.test(value)
  );
}

function normalizeDomain(value: string): string {
  const domain = value.startsWith('.') ? value.slice(1) : value;
  if (
    domain.length === 0 ||
    domain.length > MAX_DOMAIN_LENGTH ||
    !DOMAIN_PATTERN.test(domain)
  ) {
    invalidCookie();
  }
  return domain.toLowerCase();
}

function domainMatches(hostname: string, domain: string): boolean {
  if (hostname === domain) return true;
  const isIp = hostname.includes(':') || /^\d+(?:\.\d+){3}$/.test(hostname);
  return !isIp && hostname.endsWith(`.${domain}`);
}

function defaultPath(pathname: string): string {
  if (!pathname.startsWith('/') || pathname === '/') return '/';
  const slash = pathname.lastIndexOf('/');
  return slash <= 0 ? '/' : pathname.slice(0, slash);
}

function normalizePath(value: string): string {
  if (
    !value.startsWith('/') ||
    value.length > MAX_PATH_LENGTH ||
    value.includes(';') ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  ) {
    invalidCookie();
  }
  return value;
}

function sameSite(value: string): CookieSameSite {
  const normalized = value.toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'lax') return 'Lax';
  if (normalized === 'none') return 'None';
  return invalidCookie();
}

function expiryFromMaxAge(value: string, now: number): number {
  if (!/^-?\d{1,15}$/.test(value)) invalidCookie();
  const seconds = Number(value);
  const expiresAt = now + seconds * 1000;
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(expiresAt)) {
    invalidCookie();
  }
  return expiresAt;
}

function expiryFromExpires(value: string): number {
  if (value.length === 0 || value.length > MAX_EXPIRES_LENGTH) invalidCookie();
  const expiresAt = Date.parse(value);
  if (!Number.isSafeInteger(expiresAt)) invalidCookie();
  return expiresAt;
}

export function parseSetCookie(header: string, context: CookieContext): DshCookie {
  if (header.length > MAX_SET_COOKIE_LENGTH) {
    throw new Error('Set-Cookie response is too large');
  }
  const [pair, ...attributes] = splitAttributes(header);
  const equals = pair.indexOf('=');
  if (equals < 0) invalidCookie();
  const name = pair.slice(0, equals).trim();
  let value = pair.slice(equals + 1).trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }
  if (!validNameAndValue(name, value)) invalidCookie();

  const hostname = context.url.hostname.toLowerCase();
  const now = timestamp(context.now);
  let domain = hostname;
  let hostOnly = true;
  let path = defaultPath(context.url.pathname);
  let expiresAt: number | undefined;
  let maxAgeExpiresAt: number | undefined;
  let secure = false;
  let httpOnly = false;
  let cookieSameSite: CookieSameSite | undefined;
  const seen = new Set<string>();

  for (const segment of attributes) {
    const attribute = segment.trim();
    if (attribute.length === 0) invalidCookie();
    const equalsAt = attribute.indexOf('=');
    const attributeName = (equalsAt < 0
      ? attribute
      : attribute.slice(0, equalsAt)
    ).toLowerCase();
    const attributeValue = equalsAt < 0 ? '' : attribute.slice(equalsAt + 1).trim();
    const known = [
      'domain',
      'path',
      'expires',
      'max-age',
      'secure',
      'httponly',
      'samesite',
    ].includes(attributeName);
    if (!known) continue;
    if (seen.has(attributeName)) invalidCookie();
    seen.add(attributeName);

    switch (attributeName) {
      case 'domain':
        domain = normalizeDomain(attributeValue);
        hostOnly = false;
        break;
      case 'path':
        path = normalizePath(attributeValue);
        break;
      case 'expires':
        expiresAt = expiryFromExpires(attributeValue);
        break;
      case 'max-age':
        maxAgeExpiresAt = expiryFromMaxAge(attributeValue, now);
        break;
      case 'secure':
        if (equalsAt >= 0) invalidCookie();
        secure = true;
        break;
      case 'httponly':
        if (equalsAt >= 0) invalidCookie();
        httpOnly = true;
        break;
      case 'samesite':
        cookieSameSite = sameSite(attributeValue);
        break;
    }
  }

  if (!domainMatches(hostname, domain)) {
    throw new Error('Cookie authority does not match the DSH server');
  }
  return {
    name,
    value,
    domain,
    path,
    hostOnly,
    secure,
    httpOnly,
    ...(maxAgeExpiresAt !== undefined || expiresAt !== undefined
      ? { expiresAt: maxAgeExpiresAt ?? expiresAt }
      : {}),
    ...(cookieSameSite === undefined ? {} : { sameSite: cookieSameSite }),
  };
}

export function parseSetCookieHeaders(
  headers: readonly string[],
  context: CookieContext,
): DshCookie[] {
  return normalizeHeaders(headers).map((header) => parseSetCookie(header, context));
}

export function mergeCookies(
  current: readonly DshCookie[],
  updates: readonly DshCookie[],
  now = Date.now(),
): DshCookie[] {
  const checkedNow = timestamp(now);
  const merged = current
    .filter(
      (cookie) => cookie.expiresAt === undefined || cookie.expiresAt > checkedNow,
    )
    .map((cookie) => ({ ...cookie }));
  for (const update of updates) {
    const index = merged.findIndex(
      (cookie) =>
        cookie.name === update.name &&
        cookie.domain === update.domain &&
        cookie.path === update.path,
    );
    if (index >= 0) merged.splice(index, 1);
    if (update.expiresAt === undefined || update.expiresAt > checkedNow) {
      merged.push({ ...update });
    }
  }
  if (merged.length > MAX_COOKIE_COUNT) throw new Error('Too many stored cookies');
  return merged;
}

function pathMatches(pathname: string, cookiePath: string): boolean {
  return (
    pathname === cookiePath ||
    (pathname.startsWith(cookiePath) &&
      (cookiePath.endsWith('/') || pathname[cookiePath.length] === '/'))
  );
}

export function createCookieHeader(
  cookies: readonly DshCookie[],
  url: URL,
  now = Date.now(),
): string {
  const checkedNow = timestamp(now);
  const matching = cookies
    .filter(
      (cookie) =>
        (cookie.expiresAt === undefined || cookie.expiresAt > checkedNow) &&
        (!cookie.secure || url.protocol === 'https:' || url.protocol === 'wss:') &&
        domainMatches(url.hostname.toLowerCase(), cookie.domain) &&
        (cookie.hostOnly
          ? url.hostname.toLowerCase() === cookie.domain
          : true) &&
        pathMatches(url.pathname, cookie.path),
    )
    .sort((left, right) => right.path.length - left.path.length);
  const header = matching.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  if (header.length > MAX_COOKIE_HEADER_LENGTH) {
    throw new Error('Cookie header is too large');
  }
  return header;
}

/** Validates the persisted JSON boundary and drops expired cookies. */
export function validateStoredCookies(
  value: unknown,
  context: CookieContext,
): DshCookie[] {
  if (!Array.isArray(value) || value.length > MAX_COOKIE_COUNT) invalidCookie();
  const now = timestamp(context.now);
  const cookies = value.map((candidate): DshCookie => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      invalidCookie();
    }
    const cookie = candidate as Record<string, unknown>;
    if (
      typeof cookie.name !== 'string' ||
      typeof cookie.value !== 'string' ||
      !validNameAndValue(cookie.name, cookie.value) ||
      typeof cookie.domain !== 'string' ||
      normalizeDomain(cookie.domain) !== cookie.domain ||
      !domainMatches(context.url.hostname.toLowerCase(), cookie.domain) ||
      typeof cookie.path !== 'string' ||
      normalizePath(cookie.path) !== cookie.path ||
      typeof cookie.hostOnly !== 'boolean' ||
      typeof cookie.secure !== 'boolean' ||
      typeof cookie.httpOnly !== 'boolean' ||
      (cookie.expiresAt !== undefined &&
        (typeof cookie.expiresAt !== 'number' ||
          !Number.isSafeInteger(cookie.expiresAt))) ||
      (cookie.sameSite !== undefined &&
        !['Strict', 'Lax', 'None'].includes(cookie.sameSite as string))
    ) {
      invalidCookie();
    }
    return {
      name: cookie.name as string,
      value: cookie.value as string,
      domain: cookie.domain as string,
      path: cookie.path as string,
      hostOnly: cookie.hostOnly as boolean,
      secure: cookie.secure as boolean,
      httpOnly: cookie.httpOnly as boolean,
      ...(cookie.expiresAt === undefined
        ? {}
        : { expiresAt: cookie.expiresAt as number }),
      ...(cookie.sameSite === undefined
        ? {}
        : { sameSite: cookie.sameSite as CookieSameSite }),
    };
  });
  return mergeCookies([], cookies, now);
}
