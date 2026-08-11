# Roadmap

This file tracks approved parts of the target contract in [PRODUCT.md](./PRODUCT.md)
that are not yet deployed or enabled as running behavior.

## WhatsApp-style mobile push notifications

Track will make mobile conversation notifications feel immediate and dependable
while the app is foregrounded, backgrounded, or terminated. Delivery must
preserve Project, Channel, thread, and Acting Company access; deduplicate retries;
respect notification preferences; and open the exact authorized destination
without leaking unavailable content.

The implemented contract is in
[MOBILE_PUSH_NOTIFICATIONS_SPEC.md](./MOBILE_PUSH_NOTIFICATIONS_SPEC.md), with
operations in
[MOBILE_PUSH_NOTIFICATIONS_RUNBOOK.md](./MOBILE_PUSH_NOTIFICATIONS_RUNBOOK.md).
The remaining roadmap work is non-production native credential proof, the
physical iPhone and Android release matrix, and an explicitly approved rollout.

## Native Arabic localization

The web app and PWA ship English and Modern Standard Arabic through the
[Arabic i18n and RTL specification](./ARABIC_I18N_RTL_SPEC.md). Native iOS and
Android remain English until a separate release defines device-local persistence,
Expo locale behavior, native RTL layout, and the physical-device proof matrix.
Future Arabic regional languages such as `ar-SA` and `ar-AE` remain separate
switcher entries and catalogs rather than aliases for generic `ar`.

## Planning rule

Add an item here only when it represents agreed product direction.
Implementation detail belongs in an approved specification, issue, or pull
request. Remove roadmap text when the behavior ships, update
[ARCHITECTURE.md](./ARCHITECTURE.md), README, and release notes in the same
change, and reconcile [PRODUCT.md](./PRODUCT.md) if running behavior changed the
target contract.
