# Track: the product theory

Track keeps Project conversation and task management together so teams do not
have to reconstruct decisions between chat and a separate work tracker.
Conversation supplies context; tasks turn agreed work into something actionable.
Boards, lists, task details, Channels, and threads are views of that same work,
not independent copies that need reconciling.

This document owns the model and its reasons. `tracker.yaml` describes implemented
outcomes and remaining work. `design.md` describes how the model should feel on
screen. Source and tests establish behavior; deployment evidence establishes
what is live.

## Companies and Projects

A **Company** is the organizational umbrella. A **Project** is the shared work
context, with one owning Company and, when needed, collaborating Companies.
Internal work does not require a partner relationship. Adding collaboration
should not require moving or duplicating the Project's conversations and tasks.

A person can represent different Company memberships. The acting membership
changes the authority and audience of an action, not just its label. Navigation
must preserve that context rather than infer it from whichever Company happens
to be selected elsewhere.

Ownership assignment and transfer are explicit decisions approved by the
participating Companies. Older Projects without confirmed ownership remain
reachable through their existing memberships. Selecting a Company is neither
an ownership claim nor permission to access a Project. An owning Company must
transfer ownership before leaving a Project that other participants will retain.

## Channels and threads

A **Channel** is an explicitly joined conversation space inside a Project.
Project or Company visibility is not blanket access to every Channel. A
**thread** focuses discussion inside one Channel and inherits its access
boundary; it is not a private messaging system outside the Project.

Following and unread state help people return to relevant work. Read state means
what someone actually viewed, not everything the server has made available.
Older conversation must remain reachable, including the context around a source
message that is no longer in the newest page.

Archiving ends ordinary participation without erasing history. Read-only views
must communicate that distinction rather than leave a composer that cannot
succeed. Reopening and other lifecycle controls follow the participant's authority.

## Tasks and evidence

A **task** describes work someone can act on. It may be created manually or from
conversation. A **board** organizes tasks through a workflow; boards, lists,
notifications, and details must agree about ownership and state.

A **reference** links a task or assistant answer to supporting material. Tasks
derived from conversation retain links to the messages and evidence behind
them. Seeing a task is not permission to reveal every referenced conversation.
Search, source jumps, and previews preserve the original material's access
boundary and explain unavailable evidence without leaking it.

Collaborative work must not destroy a person's unfinished contribution. Realtime
updates should reveal conflicting task edits without silently replacing local
work. Navigation and retry should preserve unsent text in its own conversation
scope, never carry it into another identity, membership, Channel, or thread.

Retries represent the same intent, not an instruction to create another message
or task. Attachment completion belongs to that message intent. Assistant work
is separate so an answer failure does not make a person resend a human message.

## Assistance and memory

`@track` helps people understand and act on references they can access. An
assistant answer is not itself a durable work item. Proposed task extraction
or assignment remains human-confirmed rather than turning a model's suggestion
into an unreviewed commitment.

Imported memory belongs to a Project or Channel. Retrieval, assistant runs, and
source previews retain that scope; a convenient search or shared cache must not
turn private context into Project-wide knowledge. Progress and retry states
should make an assistant's work understandable without presenting uncertain
output as a completed action.

## Leaving a Project

An exiting Company needs its permitted history without ongoing access to later
work. Its archive is a frozen view, not continuing membership. Each person's
Channel visibility still matters; an archive must not combine everyone's access
into a wider audience.

A consistent cutoff matters more than an apparently uninterrupted capture. A
short, explicit write pause prevents different batches from describing different
versions of the Project. Reads remain available. Failed capture must support
retry or cancellation; verified capture releases the pause. The remaining
participants continue working while the exiting Company retains only its frozen
view, including the ownership identity at that cutoff.

## Scope and tradeoffs

Company collaboration, tasks, and threads can be disabled independently without
erasing stored work or its authorization and cleanup obligations. Feature
availability is a server decision, not permission for the client to bypass
those boundaries.

Work should scale with what a person is viewing rather than total Project
history. Paging and bounded archive operations support that goal; architectural
complexity is justified by an actual boundary or workload, not a hypothetical
future scale.

Direct messages outside Projects and Channels, Records, Draft Records, general
AI review queues, and record exports are outside this model. Reintroducing them
requires a product decision. Video calls and transcripts are possible future
evidence sources, not approved conferencing work. Preserve extensible,
permission-aware evidence without speculative meeting infrastructure.
