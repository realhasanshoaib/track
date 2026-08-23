import * as Crypto from 'expo-crypto';

import { platformStorage } from '@/lib/platform-storage';

const INSTALLATION_KEY = 'track.push.installation-id.v1';
const LAST_RESPONSE_KEY = 'track.push.last-response-id.v1';

function createInstallationId() {
  return `track-${Crypto.randomUUID()}`;
}

export async function getPushInstallationId() {
  const existing = await platformStorage.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const created = createInstallationId();
  await platformStorage.setItemAsync(INSTALLATION_KEY, created);
  return created;
}

export function getStoredPushInstallationId() {
  return platformStorage.getItemAsync(INSTALLATION_KEY);
}

export async function consumePushResponseId(responseId: string) {
  const last = await platformStorage.getItemAsync(LAST_RESPONSE_KEY);
  if (last === responseId) return false;
  await platformStorage.setItemAsync(LAST_RESPONSE_KEY, responseId);
  return true;
}
