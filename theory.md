# Q9 Chat: the product theory

Q9 Chat is where a team talks. Version 1 has one job: a team chat that is calm,
fast and reliable enough that a team moves its daily conversation to it from
WhatsApp. The first team is Q9. The repository and internal identifiers keep the
name Track.

This document owns the model and its reasons. `tracker.yaml` describes the
observable outcomes and remaining work. `design.md` describes how the model
should feel on screen. Source and tests establish behavior; deployment evidence
establishes what is live.

## Why chat comes first

A team moves only when talking here is better than talking where it already is.
Agents, tasks and integrations become valuable after the team's conversation
lives here, because that conversation is the team's context. So version 1 earns
the move with the chat itself. Everything else is built on top of it later.

The codebase follows the same rule. Code that does not serve the chat is
removed rather than kept switched off, so every chat change stays cheap. Git
history keeps what was removed.

## Groups

A **group** is the only container. A person sees the groups they belong to and
nothing else. A conversation between two people is a group of two. People from
another company join a group like any other member, and leaving a group ends
access to it.

Membership is the whole permission model: a member can read and write the
group's history, and a former member cannot.

## Messages

A message can carry text, images, files or a voice note. A **reply** quotes the
original message inline in the same group. Tapping the quote jumps to the
original, even when it is far back in the history. There are no side threads.

A sent message appears immediately and is never lost or doubled. A retry repeats
the same message; it never creates a second one. Unsent text stays with its own
group and never moves into another.

## Calm

Q9 Chat interrupts a person only when something needs them: a mention, a reply
to their message, or any message in a group they chose to hear everything from.
Everything else waits quietly as an unread count. Read state means what a person
actually saw, not what the server delivered.

Opening a group shows what is new since the person last looked, then lets them
continue from there. The look is quiet as well: calm surfaces, one deep Q9 cyan
for actions, and bright color only for small signals.

## Fast and reliable

Opening a group shows its newest messages without waiting. Older history loads
as the person scrolls, and the cost of a screen depends on what is on it, not on
the size of the whole history. The phone and web apps offer the same journeys
and stay in step: what a person read or wrote on one is current on the other.

## Version 1 journeys

1. Sign in and land in your groups.
2. Create a group and add people.
3. Open a group and see what is new since you last looked.
4. Send text, an image, a file or a voice note.
5. Reply by quoting a message, and jump from the quote to the original.
6. Find an old message with search.
7. Get notified only when something needs you, and open the notification
   straight at the message.
8. Mute or leave a group.

Each journey works on the phone and on the web.

## Later

Tasks, the built-in agent, people's own agents, integrations and an API and MCP
server for agents come after the team has moved. The apps use only the backend
API that those agents will use later, so adding them needs no second system.
