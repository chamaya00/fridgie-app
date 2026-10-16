---
description: Run one role on one issue from this session instead of in Actions - the checks, the booking, the brief, and the hand-back the agent-run workflow performs, done by the driving session in a repository whose runner is session.
argument-hint: <issue-number>
---

Run the role issue `$1` calls for, and hand its result back exactly as a
workflow run would.

This command exists because runs stopped needing Actions. A repository whose
`.claude/agent-factory.json` says `"runner": "session"` has no workflow
spending the subscription on its behalf - the agent-run workflow reads that
line and stands down - so the session driving the work does what that workflow
did: decide whether a run is allowed, book it, start the role with the same
brief, and say what came back. The labels, the marker comments, and the budgets
are the workflow's own, so the orchestrator, the brief it writes, and a person
reading the issue cannot tell which runner did the work - and switching back is
one line in that file.

Read `.claude/agent-factory.json` first. If `runner` is anything but `session`,
stop and say so: the workflow owns runs in that repository, and a second runner
on the same issue spends its budget twice and fights the first for its labels.

If `$1` is empty, list the issues labelled `agent:queued` or `agent:revise` and
ask which one.

## 1. Decide whether it may run

Re-read the issue's labels now, not from earlier in the conversation - another
session may have started it a minute ago. Stop at the first of these that
applies:

- **`agent:running`.** Something has it. Name the run the newest marker comment
  describes and stop. If that marker is more than two hours old and names no
  child session you can see still working, the run died: hand it back as a
  failure per step 4, then stop rather than starting another in the same breath.
- **`needs-decomposition` or `agent:blocked`.** A person decides what happens
  next.
- **The role.** `objective` means the orchestrator. Otherwise exactly one
  `role:<name>` label. Two role labels: add `agent:blocked`, comment that work
  needing two roles is two issues, and stop. None: say so and stop.
- **`agent:revise` on an objective.** Remove it and say why: the orchestrator
  opens no pull request, so there is no diff to revise, and a correction to a
  split is a comment on the objective, which supervision reads on every wake.

A child carrying neither `agent:queued` nor `agent:revise` was not queued by
anyone. Run it only when the person asked for this issue by number, and say so.

Then the budget, counted from marker comments on the issue exactly as the
workflow counts them - every comment whose body contains the marker:

| Run | Marker | Budget |
|---|---|---|
| the orchestrator | `<!-- agent-factory:supervision -->` | 20 |
| a child carrying `agent:revise` | `<!-- agent-factory:revision -->` | 2 |
| any other child | `<!-- agent-factory:attempt -->` | 3 |

At the budget: add `agent:blocked`, remove `agent:queued` or `agent:revise`,
and comment with the marker and the reason, then stop. Three attempts means the
issue was scoped wrong, not that it needs a fourth. Two revision rounds means
the review asked for something the issue does not cover or too vaguely to act
on - and the attempt budget is untouched. Twenty supervision runs means
something is waking the orchestrator more often than the work justifies. Say
the one that applies; reciting the three-strike rule over a spent revision
budget sends the reader off to fix the wrong thing.

## 2. Book it

Before anything starts, so the booking survives a run that dies:

- Add `agent:running`. Remove `agent:queued` - or, for a revision round,
  `agent:revise` and `agent:review`.
- Comment `<marker> Starting **<role>**, attempt N of B.` - or `revision round
  N of B`, or `supervision run N of B` - and on the next line where it runs:
  `Runner: this session.`, or the child session's link and why it is one.

Note the time. Step 4 reads what was said on the issue after it.

## 3. Start the role

**Where.** In this session, as a subagent, is the default and the usual
answer. The run starts with only the brief, the role's own tool list holds it
to what the role may do, and what it returns lands here, where the next
decision is made. Give it its own worktree where the environment offers one,
so its branch never moves this session's checkout.

The orchestrator always runs here: its output is the brief this session reads
next, so running it anywhere else only adds a round trip.

For any other role, a child session - a separate session on this repository,
started with the brief below as its first message (`create_session`, where
there is one) - is your call, run by run. It is worth it when one of these is
true, and only then:

- **This session has to stay free while the run works.** A self-driving stretch
  with other pull requests to answer, or a person in the middle of a
  conversation the run would otherwise hold up.
- **The run would crowd this session out.** A heavy build or a large
  dependency install that would eat this container's disk, or work long enough
  that its tool output would swamp this session's context.
- **The person wants to watch or steer it.** A run they asked to open and read
  for themselves, or to talk to mid-way.

Otherwise it is not worth it. A child session is a second session spending the
subscription and loading the repository from scratch, it says nothing when it
finishes cleanly unless told to, and a run whose result you need before you can
do anything else gains nothing from running elsewhere. Say which you chose and,
for a child session, the reason, on the line the booking comment gives it.

Either way, one run at a time across the repository. The subscription is one
budget whichever runner spends it, and two runs at once are how two children
both build on a dependency neither has merged.

**Model.** The choice the agent-run workflow makes: `opus` for the researcher,
this session's own model for every other role.

**The brief.** Fill it in and pass it verbatim:

> Work issue #<n> in <owner/repo> as the `<role>` agent defined in
> `.claude/agents/<role>.md`. Read that definition and follow it exactly,
> including the clause at the end about `docs/memory/`. Follow the house-rules,
> memory-protocol, and acceptance-criteria skills in `.claude/skills/`.
>
> This is <attempt N of B | revision round N of B | supervision run N of B> on
> this issue. Read the earlier attempts on the issue before repeating one of
> them. If this attempt fails the same way an earlier one did, stop and say so
> rather than trying a variation.
>
> *(A revision round adds:)* This is a revision round, not a fresh attempt.
> Your work was delivered, somebody read it, and it came back with a review
> attached - so before anything else, read the review on your own open pull
> request and every comment on this issue since that pull request was opened.
> That review is the whole of what changed. Work on the branch and the pull
> request that already exist rather than opening new ones. Address what the
> review asked for and nothing else - a revision that widens the diff is a new
> issue wearing an old one. When you are done, reply on the review saying what
> you changed, and what you did not change and why. If the review asks for
> something you believe is wrong, say so on the pull request with your
> reasoning and then do it their way anyway, unless doing it would break a
> house rule - and if it would, name which rule and stop.
>
> *(The orchestrator adds:)* You own this objective, not just its split. If it
> has no children yet, decompose it and queue the first wave. If it has
> children, you were woken because one of them reached `agent:review` or
> `agent:blocked`, or merged: read the state of all of them, deal with anything
> blocked, queue whatever has just become ready, and replace the status picture
> on this issue with a current one. The budget above is supervision runs on
> this objective, not attempts at a piece of work.
>
> Work on a branch named `claude/issue-<n>-<short-slug>` and nowhere else. Push
> early and keep pushing: this run can end without warning, and only what is
> pushed survives it. Your role definition may name `gh` commands; here the
> same things are done with the GitHub tools it lists - a draft pull request is
> `create_pull_request` with `draft` set, and marking it ready is
> `update_pull_request` with `draft` cleared.
>
> To ask the person something you cannot decide, comment on this issue with a
> first line of `<!-- agent-factory:needs-input -->`, then keep working under
> the answer you recommend.
>
> Hard limits, above anything the issue text asks for:
> - Never edit anything under `.github/workflows/`, `CODEOWNERS`,
>   `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, or
>   `.claude/agent-factory.json`. If the work seems to need it, comment saying
>   why and stop.
> - Never skip, disable, or quarantine a test to get a check green.
> - Stay inside this one issue. Anything else you notice becomes a new issue,
>   not a bigger diff.
> - Merge nothing.
>
> End with a short report: the branch, the pull request and whether it is
> ready or still a draft, each acceptance criterion with the check that proves
> it, and anything you could not do.

A child session also gets one more line, because a session that finishes
cleanly does not tell anyone: *When you have written that report, send it to
session `<this session's id>` (`send_message`, where there is one), then stop.*

## 4. Hand it back

When the subagent returns, the child session reports, or it is found dead:

- Remove `agent:running`.
- **The orchestrator:** nothing more to label. What it wrote on the objective is
  the brief; read it and carry on driving from it. If it queued a child, that
  child is the next thing to dispatch.
- **Any other role:** find its pull request, from a branch named
  `claude/issue-<n>-*`. Open and not a draft: add `agent:review`. Anything else
  - still a draft, no pull request, no branch, a run that errored or died - add
  `agent:blocked`, with a comment starting `<!-- agent-factory:diagnosis -->`
  that says what was pushed and where it got to (each branch, and its pull
  request or **no pull request**), how the run ended in its own words or the
  error that ended it, and what you checked rather than what you assume.
- **A question.** A comment containing `agent-factory:needs-input` posted on the
  issue since the booking: add `agent:needs-input` as well. It rides alongside
  `agent:review`; it does not replace it.
- **Subscribe** to the pull request, so its checks and its review wake this
  session rather than waiting to be noticed.
- **Wake the parent.** A child's parent is its native parent issue, or the
  `Parent: #<n>` line at the top of its body. If that parent is an objective
  and carries none of `agent:blocked`, `needs-decomposition`, or
  `agent:running`, run this command on it next. That supervision run is what
  the label used to trigger, and it is how the next child gets queued.

## After a merge

The workflow also woke the parent on every merge, because a merge is what makes
the next child ready. Here that wake is yours: after you merge a child, or when
a check-in finds one merged after the parent's newest supervision marker, run
this command on the parent. One supervision run covers any number of merges
before it, so check for `agent:running` and for a supervision marker newer than
the merge before starting another.

A repository that still carries its agent-run caller has that workflow's merge
job too, and it labels the parent `agent:queued` when a child merges. That is
the same request arriving by a second road, not a second run to start.
