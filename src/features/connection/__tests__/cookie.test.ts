import {
  createCookieHeader,
  getSetCookieHeaders,
  mergeCookies,
  parseSetCookie,
  parseSetCookieHeaders,
} from '../cookie';
import type { ResponseHeaderSource } from '../types';

const NOW = Date.parse('2026-11-04T20:00:00Z');
const SERVER = new URL('https://dsh.test/connect');

function rawResponse(rawHeaders: [string, string][]): ResponseHeaderSource {
  return { headers: new Headers(), _rawHeaders: rawHeaders };
}

describe('DSH cookie handling', () => {
  it('preserves repeated native Set-Cookie headers and Expires commas', () => {
    const response = rawResponse([
      [
        'Set-Cookie',
        'dsh-a=first-test-value; Max-Age=120; Path=/; Expires=Wed, 04 Nov 2026 20:02:00 GMT; HttpOnly; SameSite=Strict; Secure',
      ],
      ['Set-Cookie', 'dsh-b=second-test-value; Path=/api; SameSite=Lax'],
    ]);

    const headers = getSetCookieHeaders(response);
    expect(headers).toHaveLength(2);
    const cookies = parseSetCookieHeaders(headers, { url: SERVER, now: NOW });

    expect(cookies.map((cookie) => cookie.name)).toEqual(['dsh-a', 'dsh-b']);
    expect(cookies[0]).toMatchObject({
      value: 'first-test-value',
      domain: 'dsh.test',
      hostOnly: true,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
      expiresAt: NOW + 120_000,
    });
    expect(cookies[1]).toMatchObject({ path: '/api', sameSite: 'Lax' });
  });

  it('parses a combined compatibility header without splitting Expires', () => {
    const headers = new Headers({
      'set-cookie':
        'dsh-a=first-test-value; Expires=Wed, 04 Nov 2026 20:02:00 GMT; Path=/, dsh-b=second-test-value; Path=/',
    });
    Object.defineProperty(headers, 'getSetCookie', { value: undefined });

    const parsed = parseSetCookieHeaders(getSetCookieHeaders({ headers }), {
      url: SERVER,
      now: NOW,
    });

    expect(parsed.map((cookie) => cookie.name)).toEqual(['dsh-a', 'dsh-b']);
    expect(parsed[0].expiresAt).toBe(Date.parse('2026-11-04T20:02:00Z'));
  });

  it('uses the optional public getSetCookie compatibility method', () => {
    const headers = new Headers();
    Object.defineProperty(headers, 'getSetCookie', {
      value: () => ['dsh-a=test-value; Path=/', 'dsh-b=other-test-value; Path=/'],
    });

    expect(getSetCookieHeaders({ headers })).toHaveLength(2);
  });

  it('bounds cookie values and rejects malformed attributes', () => {
    expect(
      parseSetCookie(`dsh-a=${'x'.repeat(4096)}; Path=/`, {
        url: SERVER,
        now: NOW,
      }).value,
    ).toHaveLength(4096);
    expect(() =>
      parseSetCookie(`dsh-a=${'x'.repeat(4097)}; Path=/`, {
        url: SERVER,
        now: NOW,
      }),
    ).toThrow('Invalid Set-Cookie response');
    expect(() =>
      parseSetCookie('dsh-a=test-value; Expires=not-a-date', {
        url: SERVER,
        now: NOW,
      }),
    ).toThrow('Invalid Set-Cookie response');
    expect(() =>
      parseSetCookie('dsh-a=test-value; Max-Age=9999999999999999', {
        url: SERVER,
        now: NOW,
      }),
    ).toThrow('Invalid Set-Cookie response');
  });

  it('rejects cookie domains outside the configured authority', () => {
    expect(() =>
      parseSetCookie('dsh-a=test-value; Domain=evil.test; Path=/', {
        url: SERVER,
        now: NOW,
      }),
    ).toThrow('Cookie authority does not match the DSH server');
  });

  it('applies deletion, path, host, and Secure rules when serializing', () => {
    const original = parseSetCookie(
      'dsh-a=first-test-value; Path=/api; Secure; HttpOnly',
      { url: SERVER, now: NOW },
    );
    const deletion = parseSetCookie('dsh-a=; Path=/api; Max-Age=0', {
      url: new URL('https://dsh.test/api/rpc'),
      now: NOW,
    });

    expect(
      createCookieHeader([original], new URL('https://dsh.test/api/rpc'), NOW),
    ).toBe('dsh-a=first-test-value');
    expect(
      createCookieHeader([original], new URL('https://dsh.test/other'), NOW),
    ).toBe('');
    expect(
      createCookieHeader([original], new URL('http://dsh.test/api/rpc'), NOW),
    ).toBe('');
    expect(mergeCookies([original], [deletion], NOW)).toEqual([]);
  });

  it('does not include cookie values in validation errors', () => {
    const secretFixture = 'test-cookie-value-that-must-be-redacted';
    let message = '';
    try {
      parseSetCookie(`dsh-a=${secretFixture}; Domain=evil.test`, {
        url: SERVER,
        now: NOW,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(secretFixture);
    expect(message).toBe('Cookie authority does not match the DSH server');
  });
});
