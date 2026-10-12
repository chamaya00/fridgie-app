---
name: research-craft
description: How to act like an investigator rather than a summariser - reading the issue's guesses before answering them, treating two options as a floor, following a source to the next one, hunting the evidence against your own recommendation, and knowing when to stop. Use on any issue that asks what is true before a decision, before writing the document.
---

# Research craft

The role file says what to produce. This says how to be worth asking.

The failure this exists to prevent is not being wrong, it is *shallowness*: a document that names two options, describes both accurately, cites a page for each, satisfies every criterion, and could have been written without looking at anything. Nobody can object to it. It also changes nobody's mind, because it contains nothing the person reading it did not already suspect - which is the whole of what they asked you for.

That document is the default output of anyone working fast from memory, and memory here is several years of training data averaged. So the steps below are mostly about going somewhere specific rather than thinking harder in place.

## The issue is a first draft, not a brief

An issue arrives written by somebody solving a different problem - splitting an objective, usually - and it carries their guesses about what the answer will be. The most expensive thing in it is the list of options it expects you to compare, because that list looks like scope.

Before searching anything, separate three things:

- **The decision.** What somebody will do differently depending on what you find. Fixed, and it goes at the top of the document in one sentence.
- **The constraints.** What genuinely cannot move - a decision already recorded, a data shape, something already built. Check these rather than assuming; an issue frequently restates a constraint that stopped being one.
- **The guesses.** Everything else, and that includes the candidates the issue names, the vocabulary it uses for the problem, and the shape of answer it implies by asking the question the way it did.

Say in the document which is which. An issue that names two candidates has told you where somebody's attention already was, not where the answer is.

And if the decision as written cannot be settled by reading - if it needs something built and measured - say that in one line and let an engineer do it behind its own issue. A document that guesses at what a spike would have shown is worse than a document that asks for the spike.

## Two options is a floor, not a target

The role file requires two because one is not a comparison. Two is where the work starts.

Three things are almost always missing from a two-option document, and each is cheap to add:

- **What is already here.** Changing nothing, or extending what exists, is a real option with real costs, and it is the one most often left out - because the issue was written by somebody who had already decided something should change.
- **The option nobody asked for.** One candidate that is not on anyone's list, carried far enough to be compared rather than mentioned. This is the item that separates research from a summary, and it is the first thing to get cut for time, so write it early. Most of them lose. A recommendation that beat a serious outsider is worth more than one that beat the obvious alternative.
- **The option you discarded.** Name it and say what ruled it out in one line. A reader who was about to suggest it learns that you looked, and the document stops being a thing they have to check.

## Follow the source, do not stop at it

A citation is where you arrived, not where you should have finished. Every source worth citing has three edges, and taking them is the difference between having looked something up and having investigated it:

- **Backward.** What does this source cite for the claim you are about to repeat? Follow it. A number that travels through three posts and dies at a source that does not say it is the commonest way a document ends up confidently wrong.
- **Forward.** Who cites this, and what did they find when they tried it? The experience report is usually more decision-relevant than the thing it reports on.
- **Against.** Who disagrees, and on what evidence? A source with no critic has not been checked, it has been found. Go looking for the argument on the other side rather than waiting to meet it.

Search more than once, and vary the words. The vocabulary in the issue is one community's name for the problem, and the best writing on it often uses another - the second search, phrased the way a critic would phrase it, routinely returns a different internet than the first.

## Say what you looked for and did not find

An absence is a finding, and it is one nobody else can reconstruct from your document.

"I searched for a comparison of these two under load and found none published since a specific year" tells the reader the ground is thinner than it looks, and that is often the single most decision-relevant sentence available. Left out, the same absence reads as a gap in your effort.

So record the searches that came back empty alongside the ones that did not. A document that only reports hits describes a search you cannot assess.

## Three states, not two

The role file asks you to separate what you verified from what you are inferring. There is a third, and it is the one that breaks decisions:

- **Verified.** You read it in a primary source and could quote the line.
- **Inferred.** You reasoned to it from something verified. Say from what.
- **Assumed.** Neither, and the comparison rests on it anyway.

Assumptions are not a failure of research; every document has them. Leaving them unnamed is the failure, because an unnamed assumption is indistinguishable from a finding to everyone downstream, and it is what the decision quietly rests on six weeks later when nobody remembers there was a choice.

## Then go and argue with your own recommendation

You will have a favourite before you have finished reading. That is fine, and it is also the point at which the document starts getting worse, because every search after it is a search for support.

So make one pass whose only job is to break it. Not a paragraph generated from memory about what somebody might object to - a search for people who chose it and regretted it. If that search returns nothing, say so: it is either a genuinely safe pick or an unexamined one, and which of the two matters.

End on the two sentences a reader actually acts on: the strongest argument against your recommendation, and what would have to change for the answer to flip. The second one is the one that survives - it is what somebody checks against reality a year later, and it is the reason a document is worth keeping rather than re-running.

## Knowing when to stop

Research has no natural end, and a run has a turn budget, so the stopping rule has to be deliberate rather than accidental.

Stop when new sources stop changing the ranking. Two or three in a row that move nothing means the comparison is stable, and reading a fourth is spending the budget on confidence rather than on the answer.

That is a different thing from running out of room. Open the pull request as soon as the document is readable, exactly as the role file says, and keep working on the branch afterwards - so a run that ends early ends with something reviewable rather than nothing. If it ends before the comparison stabilised, say so at the top of the document and name what you would have read next. An unfinished document that knows it is unfinished is useful. One that stops mid-search and reads as complete is worse than no document at all.
