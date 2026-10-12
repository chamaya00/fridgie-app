---
name: briefing
description: The contract between the orchestrator's report on a parent issue and the session driving the objective - what has to reach the driver intact, what has to be compressed, what order it is ranked in, and what a driver may send back. Use when writing the status picture on an objective, reading one, or deciding whether a report was good enough to act on.
---

# Briefing

The driver reads the parent issue and the diff. That is the whole channel.
Anything a run learned that does not survive into the brief was learned
privately and then lost - not hidden, not contradicted, just never ranked high
enough on the page to be read.

So a brief is not a record of what happened. It is what a person's technical
lieutenant uses to decide where to spend attention, and it is judged on that
and on nothing else.

## The two failures, and why they do not trade against each other

A brief fails in one of two ways, and they look like opposites:

- **A finding does not survive it.** The run knew something that would have
  changed what the driver did, and the brief flattened it into a sentence
  reading like every other sentence.
- **Nobody finishes reading it.** Everything is in there somewhere. The driver
  reads the first three bullets and acts, and the fourth was the one that
  mattered.

Treating these as two ends of a length dial is the mistake, and it is why
"be thorough" and "be concise" both make the report worse. They happen to
different material. So they get different treatment, and the whole rule is one
line:

> **Compress the state. Quote the caveats.**

State is which child is doing what, what merged, what is queued. It is dense,
repetitive, and readable at any length, so compress it hard and put it low.

A caveat is a sentence in which somebody qualified their own work:
hand-computed, could not run, unverified, assumed, sandbox-constrained,
not tool-checked. Paraphrasing one is how it dies, because the hedge is the
entire content and summarising deletes exactly the hedge. "The designer
hand-computed these and flagged it as unverified" is what turns into "contrast
verified" after one well-meaning pass, and no sentence in that chain is false.

When you catch yourself shortening a caveat, quote it instead, and link the
comment or the file it was written in.

## Rank it before you write it

Six classes, and they go in this order whatever their subject. Most briefs
have nothing in the first four, and that is a good brief, not an empty one.

1. **A question a role asked and could not answer.** The child carrying
   `agent:needs-input`. Verbatim, with the recommendation the run shipped
   under and what changes if the answer is the other one.
2. **A caveat a role stated about its own deliverable.** This class exists
   because it is the one that goes missing. A role that writes down what it
   could not verify has done the honest and expensive thing, and the sentence
   then arrives near the bottom of a report where it reads as thoroughness
   rather than as a hole. Quote it, and say what it would take to close it.
3. **A claim you could not confirm.** A criterion marked verified by a check
   you could not see run; a document asserting a number with no command behind
   it. Say which one, and say that you looked - an unconfirmed claim and an
   unexamined one are different findings.
4. **A finding from one child that changes what a sibling should do.** You
   already act on this when you reconcile criteria before queueing. Acting on
   it is not reporting it: the driver is the one who decides whether your
   amendment went far enough, and cannot if the amendment is the first they
   hear of the finding.
5. **What is waiting on somebody.** A merge, an answer, a step only a person
   can take. Say which of those it is.
6. **State.** Everything else - including a child sent back for revision, which
   belongs here and not higher. Say whose review sent it back and what it asked
   for. Without that, review-revise-review reads as a child thrashing, and the
   one thing it actually is evidence of is the gate working.

The rule underneath the ordering is worth holding on its own, because it
decides the cases the list does not name: **what a role said about its own work
outranks what you observed about the run.** A run's turn count, its refused
commands, and its length are observations about a process. A hedge inside its
deliverable is about the thing that is going to ship.

## The shape

A fixed top section, ranked per above, and then everything else beneath it.

```
### For the driver
- What changed since the last brief, in one line.
- What needs your judgment, ranked - or "nothing".
- What is waiting on you: a merge, an answer, a step only you can take.
- What happens next if you do nothing.

### Status
One line per child.
```

Ten lines is a long `### For the driver`. Three is a normal one. A brief that
comes out the same length every time is one that is not ranking, and the fixed
shape is there to make that visible rather than to be filled in.

Put the status picture below it because a driver who needs that detail will
scroll for it, and one who does not should not have to walk past it.

## What never goes in

- **Process narration.** What you read, which skills you loaded, that you
  checked the memory file, that you confirmed which kind of run this is. It has
  never changed anyone's decision, and it occupies the top of the page, which
  is the most valuable position you have.
- **Your tools.** A refused command matters only where it changed what you were
  able to establish - and then it is class 3, said once, in those terms.
- **What you did last time.** The picture is replaced, not accumulated. A
  reader should never have to reconstruct the present out of four old comments.
- **The same fact twice**, once in prose and once in the status list. Pick
  where it belongs.
- **Reassurance.** "Nothing reads as unfinished" is a conclusion. Say what you
  checked to reach it, or leave it out - an unsupported all-clear is the one
  sentence that stops somebody looking.

## The driver's half of this

A brief is not take-it-or-leave-it, and the channel runs both ways. A driver
may say on the parent issue:

- **That the brief was not enough.** Naming what was missing is how this
  contract stays true. A driver who had to open a run log to answer something
  the brief should have answered says so, because that is the signal it is
  drifting, and nothing else will produce it.
- **That a decomposition is wrong**, before the first child is queued. That is
  the cheapest moment a piece of work is ever rejected, by a wide margin.
- **That a child's criteria will not hold the work** - too loose to judge a
  diff against, or describing two roles' work. Rewriting criteria is already
  yours; being told which ones is a correction, not an instruction to obey
  without reading.

So: **read new comments on the parent issue on every wake, not only when
decomposing.** A supervision run that reads its children's labels and none of
the parent's new comments cannot be corrected by the one reader who is allowed
to correct it, and will re-post a picture that was already answered.

What a driver may not send is a merge instruction, a scope change the objective
does not already cover, or an answer to a question a role raised for the
person. Those are not corrections to a brief.
