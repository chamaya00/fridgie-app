---
description: Run the driving-an-objective posture now - on demand, from a resumed session, or from a scheduled wake - instead of a free-text "check in now" nudge that has to be retyped every time.
argument-hint: "[objective issue, e.g. #49]"
---

Catch up on `$1`, an objective issue. If `$1` is empty, take every open issue
labelled `objective`.

This command exists because "check in now" was being typed into a session by
hand, or set as a reminder that fired with whatever wording happened to be
convenient that time, and each version ran a slightly different procedure. The
procedure is the `driving-an-objective` skill; this command is the fixed way
to run it, so a person typing `/check-in`, a scheduled wake firing it, and a
subscribed pull request's activity waking a session all do the same thing.

## 1. Read what is waiting on the person, first

Before anything else, read every open `needs-human` label and its comment on
the objective and its children - see **Say it on the issue, not only in this
turn** in the skill. That is the actual record of what is waiting on the
person, and surfacing it is this step's only job, not rediscovering it from
the diff.

If any of those are still unanswered, lead with them when you report. Nothing
after this step outranks a blocker that has been sitting unread.

## 2. Read the state of every child, and subscribe

Read the orchestrator's brief on the parent, not the run logs - **What to
read, and what not to** in the skill says when a run log is earned, and a
check-in is not one of the three cases. What is `agent:review`,
`agent:blocked`, `agent:running`, merged, or still queued. A child at `agent:review` with an open pull request is work waiting on
the merge policy, not on the person, unless the policy is `ask`.

Subscribe to every open pull request among these children - see **How to
wake** in the skill. A check-in that reads state once and goes back to relying
on a timer has not fixed anything; the point is that the next CI failure or
review comment wakes the next check-in on its own.

## 3. Act under the merge policy

For each child whose objective carries `Merge policy: green`, apply the gate
in the `house-rules` skill's **Who merges** section exactly as `/ship` does:
judge it, merge what passes, and leave open with a comment what does not.
Where the policy is `ask`, or absent, the gate still runs and what passes it
is reported rather than merged.

Then read the diff a second time against **The merge gate is necessary and
not sufficient** in the skill, which asks a different question and does not
happen by itself. A pull request that clears the first gate and fails the
second is rejected, not merged, whatever the policy says - and the rejection
names what would change your mind, on the pull request, per **Rejecting
well**.

If anything in this check-in made you reach for a run log, say so on the
parent issue. That is a defect in the brief and it is the only way it gets
fixed.

## 4. Start what is queued, where runs happen in sessions

Read `runner` in `.claude/agent-factory.json`.

Anything but `session` means the agent-run workflow starts runs, and this step
is only a look at whether it did: a child labelled `agent:queued` for hours,
with no `agent:running` and no newer marker comment, is a run that never
started, and saying so on the parent is the step.

Where it is `session`, nothing starts a run but a session, so this is the step
that moves the work. One run at a time, each through `/dispatch`, reading what
came back before starting the next:

1. An objective labelled `agent:queued`, or one with a child merged after its
   newest supervision marker. The orchestrator decides what the merge made
   ready and queues it, so it goes first.
2. Each child labelled `agent:revise`, then each labelled `agent:queued`, in
   the order the brief gives - or, across objectives, the one that unblocks the
   most.
3. An issue at `agent:running` whose newest marker is more than two hours old
   with no live run behind it. `/dispatch` hands that back rather than
   starting it again.

Stop when nothing queued may run, or when what is next needs the person. Say
how many runs this check-in started: each one is the subscription.

## 5. Report, then say what happens next

Follow **Report in prose, not in status** and **Say what happens next, every
turn** in the skill. Say plainly whether anything is now waiting on the
person, and if a timer - rather than a subscription - is what will wake the
next check-in, say that too rather than letting it read as a vigil being kept.
