---
description: Turn a rough idea into a filed objective, set its merge policy, queue it, and then drive it. The one command that starts a piece of work.
argument-hint: <rough idea, in your own words>
allowed-tools: Bash, Read, Glob, Grep, mcp__github__issue_read, mcp__github__issue_write, mcp__github__list_issues, mcp__github__search_issues, mcp__github__add_issue_comment, mcp__github__get_label, mcp__github__list_pull_requests, mcp__github__pull_request_read, mcp__github__merge_pull_request
---

Start a piece of work from `$1`, a rough idea in the person's own words.

If `$1` is empty, ask what they want before doing anything else.

This command exists because the same three instructions were being typed at the
start of every objective - file it, queue it, then watch it and merge what
passes. Two of those are mechanical and one is a posture that used to live only
in the conversation that set it. All three belong here.

## 1. Refine it with them first

This is the step with the value in it. Everything after it is mechanical.

Read enough of the repository to ask a real question rather than a generic one:
what already exists that this touches, what the last objective in this area
decided, what the relevant decision records say. Then put back, in a sentence or
two, what you understand the work to be and where you think its edges are.

Ask only what genuinely changes the work. Two readings that lead to the same
issues is not ambiguity worth their time. A question that decides scope is.

Say plainly if you think the idea is two objectives rather than one, or if the
repository already does most of it.

## 2. Draft the objective

Write it in the shape the orchestrator reads well:

- **The problem as a person experiences it.** What they see, not what the code
  does. If the request came from something they looked at, describe that.
- **What already exists**, named by file, so the split is not designed against a
  repository that is not there. Read these rather than assuming them.
- **What done looks like** - observable outcomes, not an implementation. This is
  the ceiling for every child's criteria, so anything not here is out of scope.
- **For the orchestrator** - the traps. Anything a decision record names as a
  consequence, anything the existing checks would not catch, anything easy to
  miss. This section is worth more than the rest put together: it is where the
  holes that ship green get caught before they are written into criteria.

Do not write acceptance criteria. Those are the orchestrator's, per the
`acceptance-criteria` skill, and writing them here pre-empts the split.

## 3. Ask the merge policy question, once

Ask whether you should merge this objective's children yourself as they pass the
gate, or bring each one to them. Then write the answer into the body:

```
Merge policy: green (set by @<them>, <date>)
```

or `Merge policy: ask`. Absent means ask, so when they do not answer, say so and
write nothing.

Three things to say when you ask, because they decide whether the answer is
informed:

- `green` means you apply the full merge gate in the `house-rules` skill, not
  that you merge on a green tick. The review does not get weaker; what changes
  is that it no longer needs them present.
- It is scoped to this objective's children. It is not a setting.
- Some things still come to them whatever the policy says: the six in **What a
  revert does not undo**, a child that blocks twice, and anything needing a
  decision that is theirs.

Never write this line except as the direct result of their answer, and never on
any objective but the one you are filing with them now.

## 4. Show it, then file it

Show the drafted body and wait for a yes. One keystroke, and it is the last beat
of the refinement rather than a separate approval: an objective that is queued
before anyone re-read it has already started spending attempts, and a child that
reaches a person with a third of its budget gone is a failure this system has
had.

On yes: file it, label it `objective` and `agent:queued`, and give them the
link. On no: take the correction and show it again.

## 5. Then drive it

Do not stop here and wait to be asked. Filing is the start of the job, not the
end of it - see **Driving an objective** in this repository's `CLAUDE.md`, which
is the same posture whether this command started the objective or a later
session picked it up.
