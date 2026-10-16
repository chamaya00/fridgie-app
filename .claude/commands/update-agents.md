---
description: Bring this repository's copy of the shared roles, skills, and workflow pins up to a factory release, as one reviewable pull request.
argument-hint: "[version]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, mcp__github__get_file_contents, mcp__github__create_branch, mcp__github__push_files, mcp__github__create_pull_request, mcp__github__list_branches
---

Update this repository to a factory release. Nothing here happens on a
schedule and nothing happens to any other repository: this command proposes a
diff in one repository, and a human merges it or does not.

`$1` is the release to move to, for example `v1.2.0`.

Work out which factory this repository is on before anything else, because
every read below is against it. `.claude/agent-factory.json` records the
release this repository took; the `uses:` lines in `.github/workflows/*.yml`
name the factory itself, as `<owner>/<repo>` before `/.github/workflows/`. All
four callers must agree - if they do not, stop and say so, because a repository
half-pointed at two factories is a repository where half its gates come from
somewhere nobody here chose. Call that `owner/repo` the factory repository, and
never assume it is any particular account: this command ships to forks, and a
fork's projects call the fork.

If `$1` is empty, read the latest release tag of the factory repository and use
that.

Everything you copy comes out of the factory repository at that tag, read with
`mcp__github__get_file_contents` against it with `ref` set to the tag. Do not read it from an installed plugin: a cloud session has
none, and the whole point of naming a tag is that the answer does not depend on
what happens to be on the machine you are running on.

## 1. Work out where this repository is

Read `.claude/agent-factory.json`.

**It is missing.** This repository was provisioned before the roles were
vendored, or was never provisioned at all. Check whether
`.github/workflows/ci.yml` calls the factory. If it does, this is the older
arrangement: continue, and say in the pull request body that it moves the
repository onto vendored roles for the first time. If it does not, this is not
a factory repository - stop and say so rather than turning it into one, which
is what `/new-project` is for.

**It is there and its version already equals the target.** Say so and stop. Do
not open an empty pull request.

**It is behind.** Continue, and remember both versions for the body.

If the tag does not exist in the factory, say so and stop rather than falling
back to a branch. A release is a commit somebody reviewed; the default branch
is whatever landed last.

## 2. Collect what changes

Read these out of the factory at `$1`:

- `agents/*.md` - every role
- `skills/*/SKILL.md` - every skill
- `commands/objective.md`, `retro.md`, `decompose.md`, `update-agents.md`,
  `ship.md`, `check-in.md`, `self-driving.md`, `dispatch.md` - the commands a
  project gets. Not `new-project.md`, which stays in the factory.

Compare each against the copy in `.claude/agents/`, `.claude/skills/`, and
`.claude/commands/`. Note which are new, which changed, and which exist here
but no longer exist in the factory. A role that was removed upstream gets
deleted here too, and gets its own line in the body, because a stale role that
nothing maintains is worse than no role.

Then read `.github/workflows/*.yml` and find every line matching
`uses: <factory repository>/.github/workflows/...@`. Those are the workflow
pins. Collect the ones not already at the target version.

There is no marketplace `ref` to move: this repository loads its commands and
roles from its own `.claude/` directory, so the copies you are writing in this
same commit are the only thing that decides which release it runs. That
includes this command - after this merges, `/update-agents` here is the copy
from `$1`.

## The callers, which are not only their pins

A caller's `on:` block is the factory's. Its `with:` inputs are the project's.
That split is the whole of this section, and getting it wrong either breaks a
project or silently withholds a release from it.

Moving only the pin used to be the whole job, and that was wrong: `v1.14.0`
adds a `pull_request: [closed]` trigger, without which an objective never
learns that a child's work merged and stops mid-chain. A release can change
what a caller has to listen for, and a pin move does not carry that.

So compare each caller against its template in the release at
`plugins/agent-factory/templates/project/.github/workflows/`, and treat the
two halves differently:

- **The `on:` block and the `uses:` line are the factory's.** Bring them to the
  template's shape, substituting `$1` for `__FACTORY_VERSION__` and the factory
  repository for `__FACTORY_REPO__`. A trigger the template has and the caller
  does not is a trigger the release needs.

  Substitute the factory repository this repository is already on - the one you
  read off its callers above - not whatever the template's own factory declares
  about itself. Those are the same string in the ordinary case and differ in
  exactly one: a fork, where taking the template's word for it would quietly
  re-point a project at upstream on an otherwise routine version bump. A
  placeholder that survives into a caller fails as an invalid workflow
  reference on the first run, which is loud; a substituted owner nobody chose
  is silent, so it is the one to be careful about.
- **Everything else in the caller is the project's.** `with:` inputs, job
  names, and the comments a project wrote about its own gate stay exactly as
  they are. `ci.yml` in particular carries the project's `check-name` and its
  `commands`, which the template cannot know and must never overwrite.

  This holds even when the template's own `check-name` has changed. A
  repository provisioned before that name settled may still report something
  else - `scaffolding`, or the four Node script names - and that string is what
  its branch protection requires. Changing it here would stop the required
  check reporting and block every merge, including the pull request doing the
  changing. Leave it, and say in the body that it differs and why that is
  deliberate. Adopting the template's name is a separate, human-sequenced
  change: rename the job and re-point protection in one sitting, once.

Never rewrite a caller wholesale from the template. It reads as tidying and it
deletes the one thing in that file nobody else can reconstruct.

If a caller has diverged in a way you cannot reconcile - a trigger it
deliberately removed, a job the template no longer has - do not guess. Leave
that file alone, and say plainly in the body which file it was and what you did
not do to it, so the reader knows the release is only partly applied.

If nothing at all differs, say so and stop.

## 3. Propose it

One branch, one commit, one pull request:

- `mcp__github__create_branch` from the default branch, named
  `update-agents/<version>` - not `claude/...`. This pull request changes the
  roles, the commands, and the workflow callers, which are exactly the paths
  `project-guard` refuses from an agent branch; a session opens it as the
  person, and the branch name is what tells the guard this one is theirs.
- `mcp__github__push_files` with every changed file in a single commit
- `mcp__github__create_pull_request`

What goes in the commit:

- The changed role, skill, and command files, verbatim from the factory. Do not
  edit them on the way through. A local edit makes this repository quietly
  disagree with every other one, and the next run of this command overwrites it
  anyway.
- All four workflow callers moved to the target version together. The roles,
  the workflows around them, and the commands that maintain them are one
  release; taking half of it is how they drift apart.
- `.claude/agent-factory.json` with the new version, the role, skill, and
  command lists refreshed to what was actually written, and `labels` copied
  from the release's own manifest. That last one is read at run time rather
  than being a record of it: the session-start hook compares it against the
  labels the repository really has, so a stale copy is a hook reporting the
  wrong thing rather than one reporting nothing.

  `runner` is the repository's, not the release's: keep the value it has. A
  manifest with no `runner` predates the field and has been running its agents
  in Actions, so write `"runner": "actions"` - unless the person asked to move
  to sessions, in which case write `"session"` and say in the body what that
  changes: the agent-run workflow stands down, sessions start the runs through
  `/dispatch`, work moves only while a session is open unless a self-driving
  stretch is keeping one going, and the `CLAUDE_CODE_OAUTH_TOKEN` secret is no
  longer read.
  Never flip it on your own reading of what would be better. Which runner
  spends the subscription is the person's call.

Leave alone, always:

- Everything under `docs/memory/`. Those are this repository's lessons, and
  they are the reason the roles are copied in rather than shared live. Nothing
  in an update reads them, writes them, or carries them anywhere. The one
  exception is the move described below, which changes where they sit and never
  a word inside them.
- `.claude/settings.json`, apart from the one `SessionStart` entry named in
  step 3c. Permissions, env, and the project's own hooks are the project's.
- The part of `CLAUDE.md` outside the managed block. That half describes this
  product - its stack, its commands, what it is - and belongs to the repository.
  The block is a different matter; see below.

## 3b. Replace the managed block in `CLAUDE.md`

`CLAUDE.md` was skipped entirely for a long time, on the stated grounds that it
describes the product rather than the process. That was true of about half of
it. The other half - how work moves, what drives an objective, the standing
rules, the labels - describes the shared system, and skipping it meant every
release quietly desynchronised every project's own description of itself. The
drift was invisible until somebody read a sentence that contradicted the roles
they were watching run.

So the file carries a boundary now:

```
<!-- agent-factory:begin -->
...shared process prose, owned here...
<!-- agent-factory:end -->
```

**If both markers are present:** replace everything between them with the block
from this release's `templates/project/CLAUDE.md`, and change nothing outside
them. That is the whole operation - no merging, no reconciling, no cleverness.

**If the markers are absent**, the repository predates them, and inserting them
is the one genuinely dangerous step in this command. Sections that the factory
now owns may have been edited in place over months, and wrapping them means the
next update overwrites whatever is there. So do not wrap silently:

1. Find the sections the block covers by heading. They are stable names and they
   sit together at the end of the file.
2. Diff what is there against this release's block, and **put the differences in
   the pull request body, quoted**, under a heading that says these lines will be
   replaced. Prose a person wrote about their own repository is the thing being
   destroyed, and they get to see it before it goes.
3. Anything that is plainly specific to this repository - a note about a step
   only this project needs, a caveat about its own setup - is moved *outside*
   the block rather than dropped. Say in the body where it went.
4. Only then insert the markers.

**If a marker is present but malformed** - one without the other, or `end`
before `begin` - stop and say so. Do not guess where the block was meant to
start; a wrong guess deletes the repository's own prose and looks like a
successful update.

**When the block cannot be replaced for any reason**, report rather than skip
silently: list, in the body, the statements in `CLAUDE.md` that this release has
made false. A drift a person can see is a chore; a drift nobody can see is what
this step exists to end.

## 3c. The session-start hook, and the one key it is wired by

Two files, and they do not travel the same way, for the same reason `CLAUDE.md`
needed a block: one is wholly ours and one is not.

**`.claude/hooks/session-start.sh` is wholly the factory's.** Copy it wholesale,
exactly like a skill, and make sure it stays executable - a hook without the
execute bit is wired, silent, and looks like it ran.

**If this release added a label, say so and hand the person `bootstrap`.** The
label vocabulary is created by that workflow and nowhere else, so a repository
provisioned before a release that added one simply does not have it, and the
run that first tries to apply it fails at the `gh` call. Compare this release's `labels` in
`templates/project/.claude/agent-factory.json` against the `labels` already in
this repository's copy. That used to read "against what the repository has",
which was not something anybody could actually do: nothing recorded what it
had, so the step got carried out from memory or not at all. The declared list
is what makes it real, and a check in the factory keeps it in step with
`bootstrap.yml`.

Anything in the release's list and not in this repository's is a step for them
in the pull request body: open the Actions tab, run `bootstrap`, and it creates
whatever is absent. It is idempotent, so running it is never the wrong call. Do
not try to create labels from here - this command writes files, and the
vocabulary has one source.

Say it even though the session-start hook says it too. The hook reports what is
missing now, to whoever opens a session next; the body says what this merge is
about to make missing, to the person merging it. Different moments, and the
second is the cheaper place to fix it.

**Memory moved out of `.claude/`.** A repository provisioned before it did has
its lessons at `.claude/memory/<role>.md`, and the roles in this release read
`docs/memory/<role>.md`. So move the files in this pull request, content
unchanged, one `git mv` per file, and delete the empty directory. Leaving them
behind is the failure this is for: every role reads an empty path, the lessons
are still on disk, and nothing anywhere says they stopped being read. If both
paths already hold a file for the same role, stop and say so rather than
picking - two sets of lessons is a question for the person, not a merge for
this command. The reason for the move is in the memory-protocol skill: a file
under `.claude/` cannot be written by a run at all, so the protocol that asks a
run to propose a lesson was asking for something impossible.

**The entry points under `scripts/` are the factory's interface and the
project's body.** `design-render`, `app-render`, and `contrast`. If the
repository does not have one, copy it in from this release's
`templates/project/scripts/` and make it executable: the roles are told to call
these by name, and a project without one has a role reaching for a command
that is not there. If one is already present, **leave it alone** - a project that
has replaced a default has replaced it on purpose, because what renders a mock
or builds and serves the app is a choice with a dependency and sometimes a
credential behind it, and that choice is recorded there rather than here. Say in
the body which of the two happened, per script. The interface is the factory's to change and the body never is, so an
existing file is only ever overwritten when this release changes the arguments
themselves, and then the change is named in the body as a breaking one.

**`.claude/settings.json` belongs to the project.** It is where permissions, env,
and the project's own hooks live, and overwriting it destroys configuration
nobody asked you to touch. So make a **bounded edit**:

- Add or update **only** the `SessionStart` entry that points at
  `$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh`. Leave every other key
  exactly as it is, including other hooks on the same event.
- If the file does not exist, create it carrying that one key and nothing else.
- Never add a `permissions` key, and never widen one that is there. The factory
  does not get to decide what a project's automation may do, and
  `project-guard` now fails a diff that tries - which is a backstop, not
  permission to lean on it.

**Say it in the body, under a `Privilege change:` line.** A repository that
merges this starts executing a script on every session start that it was not
executing before. That is true even though the script is ours and does nothing
but report, and it is exactly the kind of change this system refuses to let
through quietly. The guard will stop the pull request without that line, and it
is right to.

What the hook buys is worth stating for the person reading: `CLAUDE.md` is
static and can only say a session is the driver; the hook runs, so it can say
what is actually waiting. If a project would rather not run it, deleting the
`SessionStart` entry costs them the briefing and nothing else - the driver role
comes from `CLAUDE.md` and survives.

## 4. Say what it does in the body

The point of the pull request is that somebody reads it before it runs, so
write the body for that reader:

- The two versions, from and to.
- Which roles, skills, and commands changed, one line each, saying what
  actually changed in behaviour rather than that the file changed.
- Which pins moved.
- Anything removed upstream, called out separately.

This pull request moves `uses:` lines, which is a privilege change - it changes
which code runs against this repository's token. The project guard fails it
unless the body carries a line starting `Privilege change:` saying what moved
and why. Write that line: naming the pins and the two versions is enough. Do
not treat it as a formality to satisfy, and do not let a red check here become
routine - a check people expect to be red is one they stop reading.

Say which pin the checks ran at rather than assuming, because both are
possible and the difference matters. For a pull request from a branch in this
same repository, Actions takes each workflow file from the head of the branch,
so the callers in this diff are the ones that run and the release is being
exercised here. From a fork, or where a caller is not part of this diff, the
old pin runs and a green pull request proves only that the diff is well-formed.
Look at which it was - the guard job's log names the version it ran - and say
so. Where the old pin ran, the first real run at the new one is the next pull
request after this merges, and it is worth watching.

If the person who has to merge this is also the person who owns the factory,
say plainly which changes came from a factory release they cut and which are
local drift being reverted. Those are different things and they read the same
in a diff.
