---
description: Start a self-driving stretch - a long autonomous run, day or night, in which this session drives one or more objectives to done on the person's delegated judgment, logging every call it makes for them.
argument-hint: "[objective issues, e.g. #49 #52] [until <time or condition>]"
---

Drive `$ARGUMENTS` without the person in the loop until it is done, the stated
end arrives, or they say stop. With no objectives named, take every open issue
labelled `objective`.

This command exists because "keep this moving while I'm away, make the calls,
write them down" worked when it was typed by hand, and worked because of half a
dozen mechanics nobody would remember to set up the same way twice: the
questions asked before the person left, the log the calls went into, the clock
that kept waking the session, the file that kept its state. The posture is the
`driving-an-objective` skill, and **Self-driving** in it says what the
delegation covers and what it never does. This command is the fixed way to start
one, so a stretch begun at nine in the morning and one begun at midnight run the
same way.

It is not a different kind of driving. Every wake runs `/check-in`. What changes
is who answers the questions that would otherwise wait, and what keeps waking
the session when nobody is typing.

## 1. Settle the scope, and refuse what the person has not given

Before anything runs, have in hand:

- **The objectives.** Named, or every open `objective`. Read each one's body.
- **When it ends.** A time, a condition ("until #52 merges"), or "until every
  named objective is closed". Default to the last when none is given, and say
  so.
- **A merge policy on each.** A `Merge policy:` line the person wrote. An
  objective without one is driven, reviewed and reported, but its children are
  not merged: writing a policy is theirs alone, stretch or no stretch. Say which
  objectives this applies to.

Do not start a stretch the person has not asked for. This command is the ask;
nothing else - a scheduled wake, a pull request's activity, an earlier
stretch's log - may begin one.

## 2. One round of questions, then hand over

Read every objective and every open child, and look ahead for the gates the
work will reach while nobody is there to answer: a dependency a specification
will want, a number a design needs signed off, a default only the person can
pick, anything that needs their account or their hands. Ask those now, in one
round, in their language.

Number each answer (O1, O2, ...) and record it on the decision log in step 3.
Anything they decline to answer stays theirs and goes on the log under what is
still theirs, not guessed later.

## 3. Open the decision log

One issue for the stretch - reuse an open one from an earlier stretch if the
person prefers - that says what was delegated, which objectives, until when,
the standing rules that still hold (the merge gate, **What a revert does not
undo**, no merge policy written, nothing that needs their hands made live), and
the O-answers.

Every call made on their behalf from here is a numbered comment on it (D1,
D2, ...): what was decided, why, the alternative, and how to reverse it.

## 4. Set the wakes

- **Subscribe** to every open pull request among the children, and to each new
  one as it appears.
- **A short durable reminder** - about fifteen minutes - whose text says to
  re-arm itself first, then run `/check-in` on the stretch's objectives, and
  stay silent if nothing changed.
- **A slower recurring backstop** - about hourly - carrying the same
  instruction, in case the chain breaks.

Say which reminders exist and when the first fires. If the environment has no
durable reminder, say so plainly: the stretch then runs only as far as pull
request events carry it, and a run that caps or blocks will sit unseen until
the person looks. Do not imply a watch nobody is keeping.

## 5. Keep a ledger

A scratch file, outside the repository, with one line per state change: what
merged, what was queued, what was sent back, what the next step is. Re-read it
first on every wake. If it is gone, rebuild it from the parents' briefs and the
decision log before acting.

## 6. The loop

Every wake is `/check-in`, plus the mechanics in the skill's **More than one
objective at once** and **Self-driving** sections: one queue slot across every
objective, a turn-cap ending read as a budget finding, and a question a role
raises answered on the record when the delegation covers it and carried to the
log when it does not.

## 7. Close out

When every objective is closed, the stated end arrives, or the person says
stop:

- A final report on each parent: what shipped, what they can now open, what is
  left for their hands. An objective still open gets the same report, saying
  where it stopped and what the next wake would have done.
- A closing comment on the decision log listing what is still theirs.
- Every reminder deleted, and every subscription that no longer has an open
  pull request behind it dropped.
- One message to the person saying all of that in a few lines, and that nothing
  is running any more.
