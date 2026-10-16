import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'diagnostic event cleanup',
  { hourUTC: 3, minuteUTC: 0 },
  internal.diagnostics.cleanupExpired,
  {},
)

crons.interval(
  'legacy push receipt expiry',
  { minutes: 5 },
  internal.pushDelivery.expireLegacyProviderReceipts,
  {},
)
crons.interval(
  'push interrupted delivery recovery',
  { minutes: 1 },
  internal.pushDelivery.recoverStaleSendingIntents,
  {},
)
crons.interval(
  'message upload intent cleanup',
  { minutes: 5 },
  internal.messages.cleanupExpiredUploadIntents,
  {},
)

export default crons
