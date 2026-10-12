---
name: memory-protocol
description: How repository-specific lessons are stored, proposed, capped, and retired in docs/memory/<role>.md. Use when writing a retro, proposing a lesson learned, reading prior lessons at the start of a run, or deciding whether a lesson still earns its place.
---

# Memory protocol

Learning belongs to the repository that produced it. A lesson about one project's quirks is noise in every other project, and this protocol is what keeps that separation honest.

## Where memory lives

Repository learning lives at `docs/memory/<role>.md`, one file per role: `orchestrator.md`, `researcher.md`, `analyst.md`, `designer.md`, `engineer.md`.

Every agent reads its own file at the start of a run. An agent does not read another role's file.

`CLAUDE.md` is the other half of memory, and it covers exactly two cases. A lesson every role needs goes there rather than into four files, because four copies of one rule is four places to update it and three chances to miss one. And a repository with no `docs/memory/` directory is one where no agent ever runs - the factory itself is that case - so the Lessons section of its `CLAUDE.md` is the whole of its memory, under every rule below.

Nothing else is memory. Not the README, not a comment thread, not an agent definition.

## Why not under `.claude/`

These files used to live at `.claude/memory/<role>.md`, and for two roles that made the protocol below impossible to follow. A file under `.claude/` is classified as sensitive by the tool that runs an agent, and that classification is consulted before any permission rule, so the refusal cannot be lifted by granting anything: an interactive session is asked to approve the edit, and a run inside a workflow has nobody to ask.

Two runs on one objective were refused the edit this protocol asks them for. Both reported the refusal in their pull requests rather than working around it, which is what their role files ask for, and both spent an attempt on it. The lessons they were trying to record exist only in that prose, where no later run will read them, so the next repository rediscovers them at the same price.

So the location is part of the protocol rather than an arrangement of files: memory sits beside the other things a role writes and a person reads - the design documents, the decision records, the research - and a role can actually write it. Do not move it back under `.claude/` without a run proving the refusal is gone, because the roles, the retro, and the cap all read the path from here.

## What agents may not do

Agents never edit their own definitions. The role files ship with the plugin and describe how we work everywhere; the memory files describe this repository. Blurring the two is how a general system becomes a single-project system.

New lessons are proposed as part of a pull request diff, never written silently mid-run. A lesson written without review is a rule nobody agreed to.

## The cap

Each file caps at 40 lines. This is a hard cap, and it is the point of the protocol rather than an inconvenience.

Past the cap, the retro rewrites the file rather than appending to it. Merge two lessons that say the same thing in different words, drop the one that has not been relevant in months, and tighten the wording of what survives. If nothing can be merged or dropped, the newest lesson was not worth more than what is already there - do not add it.

## Retiring a lesson

Delete any lesson that has graduated into a test, a lint rule, or a type. The check enforces it now; the sentence is dead weight, and worse, it competes for attention with the lessons nothing enforces yet.

Graduating a lesson is the goal, not a side effect. When a lesson can be turned into a check, the better pull request is the one that adds the check and deletes the line.

## Writing a lesson

One line. Specific to this repository. Stated as a rule, with the reason attached.

Good: "Run migrations against a copy of prod before merging - the staging seed data hides the null-name case."

Bad: "Be careful with migrations."
