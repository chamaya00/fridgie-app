---
description: Review the pull requests an objective is waiting on, merge the ones that pass the house rules' merge gate, and say plainly why for any that do not. The explicit form of "merge when green".
---

Merge what is ready, on the owner's behalf.

`$1` is the objective issue to work, for example `#49`. If it is empty, take
every open pull request opened by an agent run and treat them as one batch.

This command exists because "merge when green" is a real standing instruction
and was being carried in conversation rather than anywhere a later session
could find it. A session carrying that instruction merges for the person who
gave it - see **Who merges** in the house-rules skill - and this is the shape
that decision takes, so that what was checked is written down next to what was
merged.

The instruction holds whether or not they are reading it happen. What changes
when they are away is only that you cannot ask them anything, so step 3 below
does more of the work: a pull request left open with the question on it is
waiting for them, and a guess is not.

## 1. Find what is waiting

Read the objective and its children. For each child at `agent:review`, find its
pull request. A child with no pull request is not waiting on you - it is
waiting on a run, and that is a different problem.

If nothing is waiting, say so in one line and stop. Do not go looking for
something to merge.

**Read the objective's merge policy before judging anything.** A `Merge policy:
green` line means the gate below is applied without stopping to ask, for that
objective's children. Absent, or `ask`, means the gate still runs and what
passes it is reported rather than merged. Refuse a line last edited by the agent
identity rather than by a person: that is a run authorising its own merges, and
it is worth saying out loud rather than quietly ignoring.

## 2. Judge each one against the gate

The gate is the list in the house-rules skill under **Who merges**, and it is
not a formality. Read the diff. Read the criteria. Check that the checks ran.

The one that catches people is a criterion marked verified by a check that
never executed - `tests/check.sh` green does not mean the criterion has a check
in it, only that the checks it does have passed. Open the file. Find the check
the issue names. Confirm it exists and would fail if the behaviour regressed.

Anything the research or design named as a consequence, rather than a feature,
is worth looking for specifically. That is the failure mode that ships: every
criterion satisfied and the hole still there, because the criteria were written
before the consequence was known.

Then read the same diff again against **The merge gate is necessary and not
sufficient** in the `driving-an-objective` skill: satisfied criteria that were
the wrong criteria, a test that would also pass if the behaviour regressed, a
number asserted rather than computed, a specification the next role will have
to guess at. That pass is yours and nothing else in this system runs it.

Then read it a third time against **What a revert does not undo**, which is
a different question again. The gate asks whether the work is
done; that list asks whether it is safe to be wrong about. A credential, a
widened permission, a new outbound address, a deletion, a first dependency, or
a change the pull request never mentions: any one of them is a question for the
owner, not a merge, and a standing instruction does not cover it.

## 3. Merge, or say why not

Merge the ones that pass. For each, say which parts of the gate you checked -
not "green", which is a status rather than a review.

For any that do not pass, leave it open and say exactly what is missing, on the
pull request. A pull request left open with no comment is indistinguishable
from one nobody looked at.

Where a diff needs a decision only the owner can make - product behaviour, a
name that will outlive the issue, a trade-off with no obviously right answer,
or anything off that second list - put the question to them and merge nothing.
Carrying someone's instruction is not the same as being able to answer for
them.

Write those questions the way they would ask them, not the way the diff reads.
An owner who does not read code can still tell you whether the site is meant to
be calling out to somewhere new. One who is handed a patch cannot.

## 4. Watch what the merge actually did

A merge is an event twice over. It wakes the objective, which queues whatever
the merge made ready - and it starts whatever runs on the default branch,
which is what decides whether the change reached a reader.

The second one is the one that gets dropped, because the pull request has
already gone green and closed. Its checks ran on a commit that now exists only
inside the merge; they are not evidence about the branch. So read the runs on
the merge commit before you call this done, and say what they did.

If they are still going, say what you are waiting for and where it will show
up, and look again next time you touch the repository. If they failed, that is
this repository's newest problem and it belongs to whoever just merged - not to
the pull request, which is closed and was not wrong.

Then say whether the objective is now met or waiting on another child.

If you merged the last child, the objective is finished but not closed -
closing a parent objective is the owner's, and the orchestrator will say so
too.
