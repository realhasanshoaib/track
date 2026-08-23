import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import * as authFunctions from './auth'
import schema from './schema'

const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('identity and invitation security', () => {
  it('does not expose the provider enumeration query', () => {
    expect(Object.prototype.hasOwnProperty.call(authFunctions, 'getEmailAuthHint')).toBe(false)
  })

  it('requires a verified Track email to accept a legacy project invitation', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'legacy-owner', true)
    const recipient = await seedUser(t, 'legacy-recipient', false)
    const { groupId, projectId } = await seedLegacyProject(t, owner)
    const ownerClient = asUser(t, 'legacy-owner')
    const recipientClient = asUser(t, 'legacy-recipient')
    const invitationId = await ownerClient.mutation(api.invitations.create, {
      email: 'legacy-recipient@track.test',
      groupId,
      invitedBy: owner,
      projectId,
      role: 'staff',
    })

    await expect(recipientClient.mutation(api.invitations.acceptPendingForCurrentUser, {
      userId: recipient,
    })).rejects.toThrow('email_verification_required')
    await expect(t.run(async (ctx) => ctx.db.get(invitationId))).resolves.toMatchObject({
      status: 'pending',
    })

    await t.run(async (ctx) => ctx.db.patch(recipient, { emailVerified: true }))
    await expect(recipientClient.mutation(api.invitations.acceptPendingForCurrentUser, {
      userId: recipient,
    })).resolves.toEqual([invitationId])
  })

  it('requires a project manager to list legacy invitations', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'list-owner', true)
    const staff = await seedUser(t, 'list-staff', true)
    const { projectId } = await seedLegacyProject(t, owner)
    await t.run(async (ctx) => ctx.db.insert('projectMembers', {
      projectId,
      userId: staff,
      role: 'staff',
      createdAt: 1,
      updatedAt: 1,
    }))

    await expect(asUser(t, 'list-staff').query(api.invitations.listForProject, {
      projectId,
      userId: staff,
    })).rejects.toThrow('not_project_manager')
    await expect(asUser(t, 'list-owner').query(api.invitations.listForProject, {
      projectId,
      userId: owner,
    })).resolves.toEqual([])
  })

  it('requires a verified Track email to list and accept a company invitation', async () => {
    vi.stubEnv('TRACK_COMPANY_MODEL_ENABLED', 'true')
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'company-owner', true)
    const recipient = await seedUser(t, 'company-recipient', false)
    const ownerClient = asUser(t, 'company-owner')
    const recipientClient = asUser(t, 'company-recipient')
    const companyId = await ownerClient.mutation(api.companies.create, {
      displayName: 'Identity Security Company',
      handle: 'identity-security-company',
    })
    const created = await ownerClient.mutation(api.companies.inviteMember, {
      companyId,
      email: 'company-recipient@track.test',
      role: 'member',
    })

    await expect(recipientClient.query(api.companies.listPendingForMe, {})).rejects.toThrow(
      'email_verification_required',
    )
    await expect(recipientClient.mutation(api.companies.decideInvitation, {
      decision: 'accept',
      invitationId: created.invitationId,
    })).rejects.toThrow('email_verification_required')

    await t.run(async (ctx) => ctx.db.patch(recipient, { emailVerified: true }))
    await expect(recipientClient.query(api.companies.listPendingForMe, {})).resolves.toHaveLength(1)
    await expect(recipientClient.mutation(api.companies.decideInvitation, {
      decision: 'accept',
      invitationId: created.invitationId,
    })).resolves.toBe(created.invitationId)
  })

  it('rejects a legacy invitation that names a group from another project', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'group-owner', true)
    const first = await seedLegacyProject(t, owner, 'First project')
    const second = await seedLegacyProject(t, owner, 'Second project')

    await expect(asUser(t, 'group-owner').mutation(api.invitations.create, {
      email: 'invitee@track.test',
      groupId: second.groupId,
      invitedBy: owner,
      projectId: first.projectId,
      role: 'staff',
    })).rejects.toThrow('group_project_mismatch')
    await expect(t.run(async (ctx) => ctx.db.query('invitations').collect())).resolves.toEqual([])
  })

  it('quarantines a preexisting foreign-group invitation before granting project access', async () => {
    const t = convexTest(schema, modules)
    const owner = await seedUser(t, 'legacy-malformed-owner', true)
    const recipient = await seedUser(t, 'legacy-malformed-recipient', true)
    const first = await seedLegacyProject(t, owner, 'Malformed first project')
    const second = await seedLegacyProject(t, owner, 'Malformed second project')
    const invitationId = await t.run(async (ctx) => ctx.db.insert('invitations', {
      createdAt: 1,
      email: 'legacy-malformed-recipient@track.test',
      expiresAt: Date.now() + 60_000,
      groupId: second.groupId,
      invitedBy: owner,
      projectId: first.projectId,
      role: 'staff',
      status: 'pending',
      token: 'malformed-invitation',
      updatedAt: 1,
    }))

    await expect(asUser(t, 'legacy-malformed-recipient').mutation(
      api.invitations.acceptPendingForCurrentUser,
      { userId: recipient },
    )).resolves.toEqual([])
    await expect(t.run(async (ctx) => ctx.db.get(invitationId))).resolves.toMatchObject({
      status: 'revoked',
    })
    await expect(t.run(async (ctx) => ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', (q) => q.eq('projectId', first.projectId).eq('userId', recipient))
      .unique())).resolves.toBeNull()
  })
})

function asUser(t: ReturnType<typeof convexTest>, subject: string) {
  return t.withIdentity({
    email: `${subject}@track.test`,
    subject,
  })
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  subject: string,
  emailVerified: boolean,
) {
  return await t.run(async (ctx) => ctx.db.insert('users', {
    authUserId: subject,
    createdAt: 1,
    displayName: subject,
    email: `${subject}@track.test`,
    emailVerified,
    googleSubject: subject,
    normalizedEmail: `${subject}@track.test`,
    twoFactorEnabled: false,
    updatedAt: 1,
  }))
}

async function seedLegacyProject(
  t: ReturnType<typeof convexTest>,
  owner: Id<'users'>,
  name = 'Legacy project',
) {
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      createdAt: 1,
      createdBy: owner,
      name,
      updatedAt: 1,
    })
    const groupId = await ctx.db.insert('groups', {
      createdAt: 1,
      createdBy: owner,
      kind: 'general',
      name: `${name} general`,
      projectId,
      updatedAt: 1,
    })
    await ctx.db.insert('projectMembers', {
      createdAt: 1,
      projectId,
      role: 'owner',
      updatedAt: 1,
      userId: owner,
    })
    return { groupId, projectId }
  })
}
