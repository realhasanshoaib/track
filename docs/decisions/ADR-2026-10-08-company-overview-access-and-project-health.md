# Company overview access and Project delivery health

## Status

Accepted

## Decision

The Company Overview is available to active owners of the selected Company. It
shows every active Project associated with that Company and Company wide task
counts, including Projects where the owner has no active Project membership.
Those summary rows do not expose task titles, people, task activity, or thread
content. Project and task details remain behind active Project membership, and
conversation content remains behind Channel membership.

Delivery health is stored separately from the Project lifecycle state. Delivery
health may be unset or set to On track, At risk, or Off track. A Project manager
for the owning Company can update it from the Project Overview. Each update is
audited. Lifecycle remains Proposed, Active, Archive approval pending, or
Archived and continues to use its existing invitation and Company approval
flows.

## Consequences

The Company Overview can show cross-Project progress without granting access to
task or conversation content. A Company owner without Project membership sees a
summary-only row and cannot open that Project. Task names, task activity, and
thread activity are returned only when the owner has the required Project and
Channel access.

An unset delivery health is shown as Not set. Task counts remain separate signals
and do not infer or overwrite the owner's delivery assessment. Lifecycle changes
continue through the existing Project management workflows.
