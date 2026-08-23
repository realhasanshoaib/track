import * as Crypto from 'expo-crypto';

/** A key that lets a retry repeat a mutation without repeating its effect. */
export function idempotencyKey() {
  return Crypto.randomUUID();
}
