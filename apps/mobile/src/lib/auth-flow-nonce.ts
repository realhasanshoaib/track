import * as Crypto from 'expo-crypto';

export async function createAuthFlowNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
