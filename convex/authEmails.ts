import { v } from 'convex/values'

import { internalAction } from './_generated/server'
import { sendPasswordResetEmail } from './lib/passwordResetEmail'

export const sendPasswordReset = internalAction({
  args: {
    email: v.string(),
    url: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM_EMAIL
    if (!apiKey || !from) throw new Error('password_reset_email_not_configured')

    await sendPasswordResetEmail({ apiKey, email: args.email, from, url: args.url })
  },
})
