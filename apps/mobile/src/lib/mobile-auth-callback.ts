export type MobileAuthCallback = Readonly<{
  hostname: string;
  pathname: string;
  url: string;
}>;

export type SanitizedWebAuthCallback = Readonly<{
  sanitizedUrl: string | null;
  token: string | null;
}>;

export const mobileAuthFlowStorageKey = 'track-mobile-auth-flow';

export function requireMobileAuthCallback(
  value: string | undefined,
  expectedServiceUrl?: string,
): MobileAuthCallback {
  if (!value) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL is required for native social sign-in');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must be a credential-free HTTPS URL on port 443');
  }
  if (url.pathname === '/' || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must use a dedicated path without a query or fragment');
  }
  if (expectedServiceUrl && url.origin !== new URL(expectedServiceUrl).origin) {
    throw new Error('EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_URL must use the Track service origin');
  }

  return {
    hostname: url.hostname,
    pathname: url.pathname,
    url: url.toString(),
  };
}

export function createMobileAuthFlowCallback(callback: MobileAuthCallback, flowNonce: string) {
  const url = new URL(callback.url);
  url.searchParams.set('flow', flowNonce);
  return url.toString();
}

export function readMobileAuthOneTimeToken(
  returnedUrl: string,
  callback: MobileAuthCallback,
  expectedFlowNonce: string,
) {
  let url: URL;
  try {
    url = new URL(returnedUrl);
  } catch {
    throw new Error('The identity provider returned an invalid callback');
  }

  const expected = new URL(callback.url);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash) {
    throw new Error('The identity provider returned an unexpected callback');
  }
  if (url.searchParams.has('cookie')) {
    throw new Error('The identity provider returned an unsafe reusable session credential');
  }

  const parameterNames = [...url.searchParams.keys()];
  const tokens = url.searchParams.getAll('ott');
  const flowNonces = url.searchParams.getAll('flow');
  if (
    parameterNames.some((name) => name !== 'ott' && name !== 'flow') ||
    tokens.length !== 1 ||
    !tokens[0] ||
    flowNonces.length !== 1 ||
    flowNonces[0] !== expectedFlowNonce
  ) {
    throw new Error('The identity provider did not return a one-time sign-in token');
  }
  if (tokens[0].length > 256) {
    throw new Error('The identity provider returned an invalid one-time sign-in token');
  }

  return tokens[0];
}

export function sanitizeWebAuthCallback(
  value: string,
  expectedFlowNonce: string | null,
): SanitizedWebAuthCallback {
  const url = new URL(value);
  const tokens = url.searchParams.getAll('ott');
  const flowNonces = url.searchParams.getAll('flow');
  const hasReusableCookie = url.searchParams.has('cookie');
  if (tokens.length === 0 && flowNonces.length === 0 && !hasReusableCookie) {
    return { sanitizedUrl: null, token: null };
  }

  url.searchParams.delete('ott');
  url.searchParams.delete('flow');
  url.searchParams.delete('cookie');
  const token =
    !hasReusableCookie &&
    tokens.length === 1 &&
    Boolean(tokens[0]) &&
    tokens[0].length <= 256 &&
    flowNonces.length === 1 &&
    Boolean(expectedFlowNonce) &&
    flowNonces[0] === expectedFlowNonce
      ? tokens[0]
      : null;
  return { sanitizedUrl: url.toString(), token };
}
