# Company owner activity view: signal, context, and action

**Reviewed:** 8 October 2026  
**Scope:** Product guidance for a Company owner reviewing activity across Projects, Channels, threads, and tasks in a project communication and task app.  
**Status:** Research findings and design recommendation. The recommendations below are product judgments informed by first-party product documentation and API contracts; they are not a usability study.

## Recommendation

Design this as a **work signal feed for owners**, with a linked history view for deeper review. The default view should help the owner answer three questions quickly: what changed in a Project, does it need attention, and what can I do next? Treat a published project update, a material change to the plan or ownership, a blocked or overdue task, a milestone movement, and a meaningful conversation-to-work event as candidate feed events. Keep ordinary message volume and minor field churn out of the default stream unless it carries a decision, explicit request, blocker, assignment, or linked task. These are recommendations: Linear documents structured health updates with challenges and next steps, progress reports covering delays, target-date changes, lead changes and milestones, and an update history; Jira documents comments, field/workflow history, and work logs as distinct activity types. [Linear project updates](https://linear.app/docs/initiative-and-project-updates), [Jira issue activity](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/)

Keep this feed distinct from a compliance or security audit log. GitHub describes its organization audit log as owner-accessible records of actions and includes actor, affected user, repository, action, and timestamp details. That record serves administrative review; an owner work feed should rank items by whether they explain work state or enable a useful intervention. Preserve a separate complete audit history if Track later needs one. [GitHub organization audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)

## What counts as owner-relevant activity

| Event family | Include in the default feed when… | Why it matters |
|---|---|---|
| Project health or written update | A lead publishes a health state plus a summary of progress, risk, challenge, or next step. | Linear uses health plus rich text for the high-level state and deeper context, and keeps updates in a chronological history. [Source](https://linear.app/docs/initiative-and-project-updates) |
| Plan or ownership change | Project status, lead, target date, milestone, participating team, or dependency changes in a way that affects delivery. Show the old and new values when available. | Linear's progress reports surface delay, target-date, lead, milestone, and overall-progress changes; its project views expose status, lead, target date, milestone, health, and dependencies. [Updates](https://linear.app/docs/initiative-and-project-updates), [Project properties](https://linear.app/docs/project-overview), [Dependencies](https://linear.app/docs/project-dependencies) |
| Delivery movement | A meaningful set of tasks moves into or out of completion, a milestone changes state, or work indicates scope growth/slippage. | Linear's project graph distinguishes scope, started work, completed work, and progress over time; project updates can show completed work and milestone progress. [Graph](https://linear.app/docs/project-graph), [Progress reports](https://linear.app/changelog/2023-08-16-project-progress-reports) |
| Risk or blocked work | Work becomes blocked, overdue, unassigned when ownership is required, or a scheduled update is missing for an active Project. | Linear documents At risk/Off track health and stale/missing scheduled updates; it recommends checking with a lead when a Project is at risk or has no recent update. [Updates and staleness](https://linear.app/docs/initiative-and-project-updates) |
| Conversation that changes work | A message is an explicit project update, decision, blocker, request, task assignment, or task created from a message; show its Channel/thread and linked task when applicable. | Slack's message event identifies the author, channel, text, timestamp, attachments, and edit metadata, while Linear's issue activity distinguishes comments from property history. This supports preserving both conversation content and the work object it affects. [Slack message event](https://api.slack.com/events/message), [Jira activity types](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/) |
| Completion or handoff | A Project or milestone completes, or the lead/assignee changes and the change affects who owns the next step. | Linear's progress reports call out lead and milestone changes, its issue activity records assignment history and who changed it, and its Initiative docs say a named owner clarifies accountability. [Project updates](https://linear.app/docs/initiative-and-project-updates), [Assignment history](https://linear.app/docs/assigning-issues), [Initiatives](https://linear.app/docs/initiatives) |

This classification is a Track recommendation, not a vendor-defined universal taxonomy. A raw new-message event is not automatically owner-relevant: the event should carry a decision, request, risk, ownership change, or connected work item before it takes a prominent place. Slack's API exposes ordinary message events as a broad event type, while Linear separately documents project updates as structured reports; that contrast supports separating message volume from explicit status reporting. [Slack message event](https://api.slack.com/events/message), [Linear project updates](https://linear.app/docs/initiative-and-project-updates)

## What to show on each event

Each row should expose enough detail to understand the event without opening it, and a direct link to the source for verification or response. Recommended fields:

1. **Action and object:** plain-language verb plus task, milestone, Project, or conversation title, such as “Moved API rollout to At risk” or “Completed account migration task.” Linear's issue activity records property changes and assignment history; GitHub's audit log names the action and affected object. [Linear issue activity](https://linear.app/docs/assigning-issues), [GitHub audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
2. **Actor and time:** person who made the change and event time. Use a relative time for scanning and expose the exact timestamp on focus or detail. Slack's message contract includes user and timestamp, and GitHub's audit records include actor and date/time. [Slack message event](https://api.slack.com/events/message), [GitHub audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
3. **Scope path:** Company → Project → Channel or thread → task, where applicable. This hierarchy is a Track recommendation; source products distinguish Project and initiative context, and Slack's message event includes its channel. [Linear project updates](https://linear.app/docs/initiative-and-project-updates), [Slack message event](https://api.slack.com/events/message)
4. **Change detail:** before → after for status, owner, date, or milestone; for a narrative update, show health plus a short excerpt with challenge and next step. Linear's update reports combine health and narrative context and can include progress and property changes. [Linear project updates](https://linear.app/docs/initiative-and-project-updates)
5. **Evidence or conversation context:** a short message/comment excerpt, attachment cue, or linked work item when it explains the change. Slack's message object can include text and attachments; Jira activity distinguishes comments from history and work logs. [Slack message event](https://api.slack.com/events/message), [Jira issue activity](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/)
6. **Owner's next action:** a context-preserving link such as Open Project, Open task, Open thread, Reply, or Check in with lead. Linear's Inbox lets a person open the underlying item, update its properties, snooze, or remove the notification; Linear recommends contacting a lead when an at-risk Project or missing update needs a check-in. [Linear Inbox](https://linear.app/docs/inbox), [Linear project updates](https://linear.app/docs/initiative-and-project-updates)

The feed should group related events by Project and time window when several events describe one change, with a visible count and expansion to the original events. This is a design inference, not a documented requirement: Linear's reports summarize changes since the previous update, include project and sub-project updates in one history view, and omit progress detail unless progress changes by more than 2%. Those practices show one first-party approach to reducing repeated low-signal detail while retaining an update history. [Linear project updates](https://linear.app/docs/initiative-and-project-updates)

## Noise controls and trust

- **Separate event classes.** Give owners filters for updates, tasks, conversations, and ownership/plan changes; do not flatten comments, property history, and work logs into indistinguishable rows. Jira explicitly separates those activity filters. [Jira issue activity](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/)
- **Summarize related churn.** Combine creation-time setup and rapid multi-field changes into a single “Project created” or “Task updated” item, but let the detail view expose the underlying changes. Linear omits issue property changes made within the first three minutes from the issue activity log because it treats them as part of creation; its project update progress detail uses a change threshold. These are examples, not thresholds Track should copy unchanged. [Linear issue creation](https://linear.app/docs/creating-issues), [Linear project updates](https://linear.app/docs/initiative-and-project-updates)
- **Prioritize state and consequence over volume.** Put blockers, overdue work, health changes, missed update cadence, and delivery date movement above routine activity. Linear ties project health to explicit states and documents missing-update signals for active work; its project graph represents completed/started work rather than message count. [Linear project updates](https://linear.app/docs/initiative-and-project-updates), [Linear project graph](https://linear.app/docs/project-graph)
- **Keep traceability.** A summary must open the underlying task, update, or message. Do not present inferred health as fact; distinguish computed task signals from a lead-authored status. This is a product recommendation based on Linear's separation of a health indicator from narrative update and its maintained updates history. [Linear project updates](https://linear.app/docs/initiative-and-project-updates)
- **Respect access boundaries.** Aggregate only Projects, Channels, and threads the viewer may access; do not reveal hidden event counts, names, or previews. This follows Track's product rule that every retrieval preserves Company, Project, and Channel scope. [Track repository guide](../../AGENTS.md)

## Suggested information hierarchy

1. **Needs attention:** at-risk Project updates, blockers, overdue work, stale/missing updates, and date/owner changes that need a decision.
2. **Recent progress:** completed milestones, meaningful task movement, and new lead-authored updates.
3. **Conversation and decisions:** selected discussion events connected to an owner action or work item.
4. **Full history:** filterable and searchable chronology, with exact timestamps and event details.

This ordering is a Track recommendation. Linear's documentation supports explicit health, staleness, and project progress as stakeholder signals, and its personal work views put blockers and urgent work ahead of other active issues. It does not prescribe this exact Company-owner ordering. [Linear project updates](https://linear.app/docs/initiative-and-project-updates), [Linear My Issues](https://linear.app/docs/my-issues)

## Evidence and limits

The cited sources are first-party product documentation and API contracts from Linear, Atlassian, Slack, and GitHub. They establish how those products define, expose, filter, and summarize work events. They do not establish which event taxonomy Track users prefer, what volume feels manageable, whether owners need one feed or separate “attention” and “history” views, or which actions Company owners can perform across Projects. Validate those choices with representative Company owners using realistic cross-Project data and tasks such as finding an at-risk Project, understanding why it is at risk, and opening the relevant conversation or work item.

## Sources

- [Linear: Initiative and project updates](https://linear.app/docs/initiative-and-project-updates)
- [Linear: Project overview](https://linear.app/docs/project-overview)
- [Linear: Project dependencies](https://linear.app/docs/project-dependencies)
- [Linear: Project graph](https://linear.app/docs/project-graph)
- [Linear: Project progress reports](https://linear.app/changelog/2023-08-16-project-progress-reports)
- [Linear: Assignment history](https://linear.app/docs/assigning-issues)
- [Linear: Initiatives](https://linear.app/docs/initiatives)
- [Linear: Inbox](https://linear.app/docs/inbox)
- [Linear: Issue creation and activity history](https://linear.app/docs/creating-issues)
- [Linear: My Issues](https://linear.app/docs/my-issues)
- [Atlassian: Types of activity on a Jira work item](https://support.atlassian.com/jira-software-cloud/docs/what-are-the-different-types-of-activity-on-an-issue/)
- [Slack API: Message event](https://api.slack.com/events/message)
- [GitHub Docs: Review an organization's audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)


