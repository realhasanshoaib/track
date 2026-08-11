# Product

Status: target product contract. Some capabilities described here remain approved
implementation work; [README.md](../README.md) describes the repository
implementation, and [ROADMAP.md](./ROADMAP.md) tracks undelivered capabilities.

The Company, Relationship, shared Project, Channel, exit archive, and guided
migration model is implemented and production-enabled behind the independent,
default-on `companyModel` server release flag. Thread and task availability is
controlled separately; neither companion feature is required for Company
collaboration.

## Product philosophy

Track unifies project communication and task management so a team does not need
a chat product beside a separate work tracker. The shorthand is “Slack + Jira
had a baby,” but the integration is deeper than colocating two tools:
conversation, evidence, boards, lists, and task details are views of the same
Project work.

Conversation leads. Tasks are first-class, manually creatable work objects, but
discussion is their default source of context. A task created from conversation
keeps durable links to the messages, assistant answers, attachments, or imported
memory that produced it. Ownership and status changes stay visible and actionable
from both task and conversation surfaces.

Track may later add inline video conferencing and transcripts as communication
sources. Those capabilities are outside the approved thread and first
task-management releases, but the evidence model must allow a person to confirm
tasks or assignments grounded in that material without introducing speculative
meeting infrastructure now.

## Product model

Companies are durable identities whose members can collaborate in Projects. Two
or more peer Companies may form a Relationship and explicitly choose which
Projects and people they share. A Relationship, Company role, or Project role
never grants access to conversation by itself.

A Project is the operational boundary for communication, memory, tasks, search,
and audit history. Project roles are the neutral `manager` and `member` roles.
When one person represents more than one Company, every Project action uses one
explicit Project membership and Acting Company; Track never unions the person's
access across Companies.

Channels organize Project conversation and evidence. Every Project member joins
General explicitly, while every other Channel has explicit membership. Company
owners, Company admins, and Project managers cannot discover or read a restricted
Channel unless they belong to it. Track has no direct-message surface outside
Projects and Channels.

A Channel can contain named Discord-style threads created from an existing
message or started directly. Threads are focused sub-conversations, not new
permission scopes: every Channel member can discover and participate in them. Creating,
replying to, or being mentioned in a thread follows it; followed threads drive
thread unread state and notifications, and members may follow or unfollow them.
A thread creator or Channel steward may manually archive or reopen it. Archived
threads are read-only but remain searchable, referenceable, and governed by the
parent Channel's retention and archive rules.

## Conversation, memory, and evidence

Messages, replies, threads, attachments, voice notes, assistant answers, and
evidence remain inside their Project and, where applicable, Channel boundary.
Forwarding or promoting material into a broader audience requires an explicit
disclosure confirmation and never silently broadens access to the source.

Imported memory declares its scope at import time. Project-scoped memory is
available to every active Project member. Channel-scoped memory is available
only to that Channel's members. Retrieval, search, assistant context, task
creation, archive access, and evidence previews enforce the declared source
scope.

A Company leaving a shared Project retains a frozen read-only record of only the
Project and Channels its members could access at exit. Later work stays hidden,
and no Company can unilaterally erase history already shared with another.

## Tasks and planning

Tasks are durable Project work objects with ownership, workflow state, priority,
due date, labels, subtasks, comments, activity, and permission-aware references.
A person may create a task directly, convert a message or completed assistant
answer, or accept an AI task suggestion. Thread-derived tasks use their parent
Channel's scope.

A Project can have multiple Project-wide or Channel-scoped boards with independent
workflows. Board, list, task-detail, Channel panel, and inline task cards present
the same live task state. Project-wide tasks are visible to active Project
members; Channel tasks additionally require membership in their exact Channel.
Evidence keeps its original access rule even if a task later moves to a broader
scope.

## AI authority

AI may answer questions, retrieve evidence, and propose grounded tasks, but it
never silently creates or changes durable work. A person confirms every task
created from a suggestion and every proposed task edit.

Assistant answers may use bounded context from the whole current Channel,
including its threads, plus other evidence the selected Project membership is
authorized to use. Automatic task detection uses bounded whole-Channel evidence
and does not pull Project-scoped memory or another Channel into its run. Factual
output cites its sources, uncertain grounding stays explicit, and model work
never broadens permissions. Automatic detection produces Channel-scoped
suggestions for review rather than committed tasks; an explicit scan of
Project-scoped imported memory may produce Project-scoped suggestions.

## Platform direction

Web provides the full conversation, planning, search, Company, Project, Channel,
and administration experience in English and Modern Standard Arabic. Mobile
supports the essential conversation and task workflows in the same languages,
including threads, task creation and updates, suggestions, comments, evidence,
notifications, and deep links. Language choice stays in the current browser or
device, and locale selects text direction and formatting as one state. Mobile
conversation push should feel immediate and dependable while the
app is foregrounded, backgrounded, or terminated. Administrative workflows may
remain web-only when the maintained specification says so.

The detailed approved contracts are
[Company Relationships and Shared Projects](./COMPANY_RELATIONSHIPS_SPEC.md),
[Channel Threads](./THREADS_SPEC.md), and
[Task Management](./TASK_MANAGEMENT_SPEC.md). The enhanced mobile push direction
is tracked separately in
[MOBILE_PUSH_NOTIFICATIONS_SPEC.md](./MOBILE_PUSH_NOTIFICATIONS_SPEC.md). When
implementation behavior changes this target, the product decision and every
affected specification must be reconciled before release.
