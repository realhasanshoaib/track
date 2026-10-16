'use node'

import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import {
  parseTaskModelCandidates,
  taskDetectionPrompt,
  type TaskDetectionMessage,
  type TaskModelAdapter,
} from './lib/taskModel'

export function createLiveTaskModelAdapter(): TaskModelAdapter {
  return {
    async detect(messages) {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) throw new Error('task_model_not_configured')
      const model = process.env.AI_MODEL ?? 'openai/gpt-5.6-luna'
      const result = await generateText({
        model: createOpenRouter({ apiKey })(model),
        prompt: taskDetectionPrompt(messages),
        abortSignal: AbortSignal.timeout(45_000),
      })
      return {
        model,
        candidates: parseTaskModelCandidates(result.text, new Set(messages.map((message) => message.id))),
      }
    },
  }
}

export const run = internalAction({
  args: { runId: v.id('taskDetectionRuns'), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery((internal as any).taskDetection.getRunInput, args) as
      | { messages: Array<TaskDetectionMessage> }
      | null
    if (!input) return
    try {
      const result = await createLiveTaskModelAdapter().detect(input.messages)
      await ctx.runMutation((internal as any).taskDetection.commitRun, {
        runId: args.runId,
        leaseToken: args.leaseToken,
        model: result.model,
        candidates: result.candidates,
      })
    } catch (error) {
      await ctx.runMutation((internal as any).taskDetection.failRun, {
        runId: args.runId,
        leaseToken: args.leaseToken,
        errorCategory: error instanceof SyntaxError ? 'invalid_output' : 'provider_failure',
      })
    }
  },
})
