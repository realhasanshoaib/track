import { mutation } from './_generated/server'

const hour = 60 * 60 * 1000

const teammates = [
  { name: 'Mia Chen', email: 'mia.chen@demo.example', subject: 'demo:mia-chen' },
  { name: 'Leo Martinez', email: 'leo.martinez@demo.example', subject: 'demo:leo-martinez' },
  { name: 'Priya Nair', email: 'priya.nair@demo.example', subject: 'demo:priya-nair' },
  { name: 'Owen Brooks', email: 'owen.brooks@demo.example', subject: 'demo:owen-brooks' },
]

const channelMessages = [
  { author: 0, hoursAgo: 70, body: 'Morning all. I have the launch checklist open and will keep the decisions here.' },
  { author: 1, hoursAgo: 67, body: 'The release banner is ready for review. I kept the copy focused on the new project timeline.' },
  { author: 2, hoursAgo: 64, body: 'I will run the signup flow on mobile after the next preview build lands.' },
  { author: 3, hoursAgo: 61, body: 'Preview build is green. I am watching the invite dialog because it still clips on narrow screens.' },
  { author: 0, hoursAgo: 58, body: 'What are the biggest launch risks from this channel so far?' },
  { author: 2, hoursAgo: 54, body: 'I pulled the latest prototype into the QA checklist. The empty state copy is now final.' },
  { author: 1, hoursAgo: 50, body: 'The onboarding checklist needs one more pass for the permissions explanation.' },
  { author: 3, hoursAgo: 46, body: 'Found a regression: accepting an invite can leave the project switcher stale until refresh.' },
  { author: 0, hoursAgo: 42, body: 'Thanks. Please keep that fix ahead of the release notes polish.' },
  { author: 2, hoursAgo: 38, body: 'QA is clean on Chrome and Safari. I have one Android pass left for notifications.' },
  { author: 1, hoursAgo: 34, body: 'I updated the release notes draft with the board and thread improvements.' },
  { author: 3, hoursAgo: 30, body: 'The invite fix is in review. It only changes the client cache after confirmation.' },
  { author: 0, hoursAgo: 26, body: 'We need a decision on the release banner before tomorrow. Should we lead with faster project handoffs?' },
  { author: 1, hoursAgo: 22, body: 'Yes. That is the clearest customer outcome and matches the onboarding story.' },
  { author: 2, hoursAgo: 18, body: 'I will add the final banner copy to the review board and tag the updated screenshots.' },
  { author: 3, hoursAgo: 14, body: 'Invite regression is fixed in the preview. I am doing one more cross-project check.' },
  { author: 0, hoursAgo: 10, body: 'Great. Let us aim for a quiet launch morning and keep the support rotation visible.' },
  { author: 2, hoursAgo: 7, body: 'Support rotation is set. I also added the notification checks to the release checklist.' },
  { author: 1, hoursAgo: 4, body: 'Design review is approved. The release banner and empty states are ready to ship.' },
  { author: 3, hoursAgo: 1, body: 'Final preview is stable. I am comfortable calling this ready once release notes are published.' },
]

export const seedLaunchWeek = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEV_AUTH_BYPASS !== '1') {
      throw new Error('demo_seed_requires_dev_auth_bypass')
    }

    const developer = await ctx.db
      .query('users')
      .withIndex('by_normalized_email', (query) => query.eq('normalizedEmail', 'developer@track.local'))
      .unique()
    if (!developer) throw new Error('demo_seed_developer_missing')

    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', (query) => query.eq('userId', developer._id))
      .collect()
    let projectMember = undefined
    let project = undefined
    for (const membership of memberships) {
      const candidate = await ctx.db.get(membership.projectId)
      if (membership.status === 'active' && candidate?.name === 'Default' && candidate.status === 'active') {
        projectMember = membership
        project = candidate
        break
      }
    }
    if (!projectMember || !project) throw new Error('demo_seed_starter_project_missing')

    const existingChannel = (await ctx.db
      .query('groups')
      .withIndex('by_project', (query) => query.eq('projectId', project._id))
      .collect())
      .find((group) => group.name === 'launch-week' && !group.archivedAt)
    if (existingChannel) {
      const messages = await
        ctx.db.query('messages').withIndex('by_group_created_at', (query) => query.eq('groupId', existingChannel._id)).collect()
      return {
        alreadySeeded: true,
        channelId: existingChannel._id,
        messageCount: messages.length,
      }
    }

    const now = Date.now()
    const channelId = await ctx.db.insert('groups', {
      projectId: project._id,
      kind: 'custom',
      name: 'launch-week',
      status: 'active',
      revision: 1,
      createdBy: developer._id,
      createdAt: now - 71 * hour,
      updatedAt: now,
    })
    await ctx.db.insert('groupMembers', {
      projectId: project._id,
      groupId: channelId,
      userId: developer._id,
      projectMemberId: projectMember._id,
      status: 'active',
      isSteward: true,
      createdAt: now - 71 * hour,
      updatedAt: now,
    })

    const seededMembers = []
    for (const teammate of teammates) {
      let user = await ctx.db
        .query('users')
        .withIndex('by_google_subject', (query) => query.eq('googleSubject', teammate.subject))
        .unique()
      if (!user) {
        const userId = await ctx.db.insert('users', {
          googleSubject: teammate.subject,
          normalizedEmail: teammate.email,
          email: teammate.email,
          displayName: teammate.name,
          twoFactorEnabled: false,
          createdAt: now - 71 * hour,
          updatedAt: now,
        })
        user = await ctx.db.get(userId)
      }
      if (!user) throw new Error('demo_seed_teammate_missing')

      let member = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (query) => query.eq('projectId', project._id).eq('userId', user._id))
        .unique()
      if (!member) {
        const memberId = await ctx.db.insert('projectMembers', {
          projectId: project._id,
          userId: user._id,
          role: 'staff',
          status: 'active',
          term: 1,
          userDisplayNameSnapshot: teammate.name,
          createdAt: now - 71 * hour,
          updatedAt: now,
        })
        member = await ctx.db.get(memberId)
      }
      if (!member) throw new Error('demo_seed_project_member_missing')

      await ctx.db.insert('groupMembers', {
        projectId: project._id,
        groupId: channelId,
        userId: user._id,
        projectMemberId: member._id,
        status: 'active',
        createdAt: now - 71 * hour,
        updatedAt: now,
      })
      seededMembers.push({ user, member })
    }

    const messageIds = []
    for (const [index, message] of channelMessages.entries()) {
      const author = seededMembers[message.author]
      if (!author) throw new Error('demo_seed_message_author_missing')
      const messageId = await ctx.db.insert('messages', {
        projectId: project._id,
        groupId: channelId,
        authorId: author.user._id,
        authorProjectMemberId: author.member._id,
        channelSequence: index + 1,
        body: message.body,
        mentions: [],
        attachmentIds: [],
        createdAt: now - message.hoursAgo * hour,
      })
      messageIds.push(messageId)
    }

    return {
      alreadySeeded: false,
      projectId: project._id,
      channelId,
      messageCount: channelMessages.length,
    }
  },
})
