'use node';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type BatchResponse, type Message } from 'firebase-admin/messaging';
import type { NativePushInput, NativePushResult, PushFailureCategory } from './pushProviderTypes';
type ServiceAccountJson = {
    client_email?: string;
    private_key?: string;
    project_id?: string;
};
function fcmApp(): App | null {
    const serialized = process.env.FCM_V1_SERVICE_ACCOUNT_JSON;
    if (!serialized)
        return null;
    let serviceAccount: ServiceAccountJson;
    try {
        serviceAccount = JSON.parse(serialized) as ServiceAccountJson;
    }
    catch {
        return null;
    }
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key)
        return null;
    const name = `track-push-${serviceAccount.project_id}`;
    const existing = getApps().find((app) => app.name === name);
    return existing ?? initializeApp({
        credential: cert({
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key,
        }),
    }, name);
}
export function classifyFcmFailure(code: string | undefined): {
    category: PushFailureCategory;
    permanent: boolean;
} {
    if ([
        'messaging/installation-id-not-registered',
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
    ].includes(code ?? '')) {
        return { category: 'device_not_registered', permanent: true };
    }
    if ([
        'messaging/authentication-error',
        'messaging/mismatched-credential',
        'messaging/third-party-auth-error',
    ].includes(code ?? '')) {
        return { category: 'invalid_credentials', permanent: true };
    }
    if ([
        'messaging/device-message-rate-exceeded',
        'messaging/message-rate-exceeded',
    ].includes(code ?? '')) {
        return { category: 'rate_limited', permanent: false };
    }
    if ([
        'messaging/internal-error',
        'messaging/server-unavailable',
        'messaging/unknown-error',
    ].includes(code ?? '')) {
        return { category: 'provider_unavailable', permanent: false };
    }
    if (code?.startsWith('messaging/'))
        return { category: 'invalid_payload', permanent: true };
    return { category: 'network_error', permanent: false };
}
export function fcmMessage(input: NativePushInput): Message {
    return {
        token: input.token,
        notification: { title: input.title, body: input.body },
        data: input.data,
        android: {
            priority: 'high',
            restrictedPackageName: process.env.FCM_ANDROID_PACKAGE ?? 'ai.q9labs.track',
            ttl: Math.max(0, input.expiresAt - Date.now()),
            notification: {
                channelId: input.soundEnabled ? 'track-default' : 'track-silent',
                ...(input.soundEnabled ? { sound: 'default' } : {}),
                ...(input.badge === undefined ? {} : { notificationCount: input.badge }),
            },
        },
    };
}
export async function sendFcmBatch(inputs: NativePushInput[]): Promise<NativePushResult[]> {
    if (!inputs.length)
        return [];
    const app = fcmApp();
    if (!app) {
        return inputs.map(() => ({
            ok: false,
            category: 'invalid_credentials',
            permanent: true,
            latencyMs: 0,
            provider: 'fcm',
        }));
    }
    const startedAt = Date.now();
    let response: BatchResponse;
    try {
        response = await getMessaging(app).sendEach(inputs.map(fcmMessage));
    }
    catch (error) {
        const failure = classifyFcmFailure(typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined);
        return inputs.map(() => ({
            ok: false,
            ...failure,
            latencyMs: Date.now() - startedAt,
            provider: 'fcm',
        }));
    }
    const latencyMs = Date.now() - startedAt;
    return response.responses.map((result) => {
        if (result.success) {
            return {
                ok: true,
                latencyMs,
                provider: 'fcm',
                providerMessageId: result.messageId,
            };
        }
        return {
            ok: false,
            ...classifyFcmFailure(result.error?.code),
            latencyMs,
            provider: 'fcm',
        };
    });
}
