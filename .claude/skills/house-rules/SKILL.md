---
name: house-rules
description: The non-negotiable process rules for any repo built by the factory - acceptance criteria before work, tests before merge, an ADR when a decision changes a category, and the three-strike rule. Use at the start of any agent run and whenever deciding whether a piece of work is ready to start or ready to merge.
---

# House rules

These apply to every repository this system touches. They are process, not preference. If a rule and a project convention disagree, the project convention wins on style and these rules win on process.

## Before work starts

Every child issue has acceptance criteria before anyone opens an editor. No criteria means the work is not ready, and starting anyway produces a diff nobody can judge. Ask for criteria instead of inferring them.

Every issue names one role. Work that needs two roles is two issues.

## Asking a question you cannot answer yourself

Some decisions are not yours at any level of effort: which of two credible directions a product takes, a trade-off with no right answer, a name that will outlive the issue, anything the issue simply did not settle. Guessing at one of these is the most expensive thing a run can do, because a guess arrives looking exactly like a decision and nobody downstream knows to question it.

Say so, and say it where it will still be there tomorrow:

1. Comment on your issue with the question. One question, not a list of five - if you have five, the issue was scoped wrong and that is itself the finding. Enough context to answer without opening anything else, in the owner's language rather than the diff's. Give your recommendation and say what you will do if nobody answers, because a question with no default attached stalls the work while one with a default only improves it.
2. Put `<!-- agent-factory:needs-input -->` in that comment. The run's handback reads the marker and labels the issue `agent:needs-input`, which is how the question outlives every later rewrite of every status comment. You do not apply the label yourself and you do not need permission to; writing the marker is the whole of your part.
3. Then **finish the work anyway**, under the answer you recommended, and say in the pull request which way you went and what changes if the answer is the other one.

That last step is the one that makes this worth having. `agent:needs-input` is not a way to stop: it rides alongside `agent:review`, costs no attempt, and blocks nothing except the merge. A run that asks and delivers gives a person a real thing to respond to, which is a far better question than the same words with nothing attached.

Do not use it for something you could have found out. A question whose answer is in the repository, in the issue, or one command away is not a decision only the owner can make, and asking it spends their attention on work that was yours.

## Before merge

Tests before merge. Every acceptance criterion has a test that would fail if the criterion were violated. A criterion covered only by a manual check is not covered.

**Watch each new check fail before you trust it passing.** Break the thing it guards, see it go red, put the thing back. A check that has only ever been green is not evidence; it is a check that has never been tested, and the two are indistinguishable from the outside. This applies to the test harness as much as to the code - a fixture that silently stops working turns its negative cases green for the wrong reason, and those are the cases nobody re-reads.

**And read what the sabotage actually printed, not what your harness said about it.** The run that proves a check has teeth can itself be broken, and it breaks quietly: a patch string the shell expanded before the patcher saw it, a pattern matched against output that indents differently, a substitution that found nothing and reported nothing. Every one of those prints a clean verdict about a check it never exercised. Twice in one sitting a sabotage sweep here reported that nothing was caught, and both times the checks were working and the sweep was not.

The tell is that a broken harness looks exactly like diligence - a tidy table of results, produced by a program that did nothing. So on any sweep, open one case's real output and confirm the failure says what you expect. One is enough; the failure modes are shared across the sweep, so the one you read vouches for the others.

The checks are the gate, and the gate is deterministic. Never skip, disable, or quarantine a test to get to green, and never widen a pull request to get around a failing check.

A pull request changes one issue's worth of code. Things noticed along the way become issues, not commits.

## Who merges

Merging stays outside every agent-run role. No role is granted `gh pr merge`, and none should be: it is the one step that is irreversible, outward-facing, and impossible to review after the fact. A role's job ends at a pull request that is ready and a comment saying what needs a person.

**A session carrying someone's instruction merges on their behalf.** A person who says "merge when green" has decided, in advance, that green is the standard they want applied to this work. That decision holds while the session that received it is working, whether or not they are reading it happen. Watching is not what makes the merge legitimate - the instruction is, and so is being able to revoke it, and so is a merge that points back at the session that made it.

Do not confuse being unwatched with being self-directed. What must not happen is the loop closing on itself: the factory splitting an objective, building it, merging it, and choosing what comes next with no decision from a person anywhere in the chain. That is why roles do not merge - not because someone should be looking, but because a role's instruction comes from the factory rather than from an owner. The rule lives in the tool grant rather than here, so a run that talks itself into merging still cannot.

The difference an absent owner does make is that you cannot ask them anything. So anything that would have been a question becomes a pull request left open with the question written on it. That is a better outcome than a guess, and it is waiting for them when they come back.

**Where the instruction lives, once they have gone.** "That decision holds while the session that received it is working" was costing the thing it was trying to protect: the decision was durable and only its storage was not, so a person had to give it again to every new session. An objective may therefore carry the decision itself, in its body:

```
Merge policy: green (set by @owner, 2026-01-01)
```

Absent means ask, so nothing changes for an objective that does not carry it. `green` means a driver applies this whole gate to that objective's children without a person present - the review is not weakened, it is just no longer gated on someone being awake. It is scoped to one objective's children, never a repository-wide setting, and revoked by editing the issue.

Two limits, and the mechanism is worthless without both:

- **A run may not write it or act on it.** Roles inside the repository authenticate as the agent identity; a driver authenticates as the person. Honour the line only when the objective body was last edited by an account that is not that identity, and refuse it otherwise. A role writing its own merge authority is the loop closing on itself wearing a record that looks like consent.
- **A driver writes it only when a person answers.** This one has no mechanism behind it and should not pretend to: a driver holding a person's credentials is indistinguishable from that person. What makes it a different risk from an unattended run is structural - a driver is mid-conversation with someone, and a run is not.

A policy authorises merging and nothing else. It never covers the six below, and it never decides what to do about failure: a child that blocks a second time goes to a person, while its siblings keep merging.

**And be more sceptical of green where the person cannot read the diff.** A standing policy usually means they are trusting the gate rather than the change, which makes the gate the only thing left between a bad merge and whatever ships. A check that has only ever passed is indistinguishable from one that cannot fail, so confirm the new ones have teeth before merging on them.

Before merging on someone's behalf, all of these hold. Any one failing is a reason to say so rather than merge:

- **Every acceptance criterion is covered by a check that actually ran.** A criterion marked verified by a check that never executed is the worst case here, because it ends the review - a reader who sees it ticked does not check it again.
- **The required checks are green**, and there are some. A pull request with no checks is not green; it is unmeasured. Know what green covers, too: structural checks say the shape is right, never that the behaviour is correct.
- **The diff is the issue's worth of work** and no more. Something noticed on the way out is a new issue. Read the diff, not the description of the diff - they are different acts, and only one of them catches a change nobody wrote down.
- **An ADR is present** if the diff changes a category: a schema or data shape, a first dependency from a new ecosystem, a new service. A version bump inside something already chosen needs its reasoning in the body, not an ADR.
- **Anything the research or design named as a consequence** is handled or explicitly deferred in writing.
- **Nothing in the diff needs a decision only the owner can make.** Product behaviour, naming that will outlive the issue, a trade-off with no obviously right answer: those get asked, not merged.
- **No issue in front of this pull request carries `agent:needs-input`.** That label means a role asked a question and shipped its recommendation rather than stalling on it, so the work is genuinely ready and the decision genuinely is not. A standing `green` policy does not cover it: the person delegated the *gate*, and this is the one thing they kept. Answer it and clear the label, or say on the pull request that it is still open. Merging past it converts a question into a decision nobody made, silently, which is the exact failure the label was added to stop.

Say which of these you checked. "Merged, green" is not a review; it is a status.

**A merge is not finished when the pull request closes.** Every check in that list is scoped to the pull request, and a pull request's checks stop being true the moment it merges - they ran on a commit that no longer exists anywhere except in the merge. What runs afterwards is what decides whether the work reached anyone: a deployment, a publish, a post-merge suite. Watch the merge commit until that settles, and say what it did.

Where it cannot be watched to the end - a pipeline measured in hours, an environment that promotes on its own schedule - say what you expect and where the answer will appear, and look at the next time you touch the repository. The point is that somebody is carrying the question, not that it is answered inside the minute.

A project once ran nineteen hours and eight merges on a failing deployment, serving a build from before any of them, while every pull request in that window was honestly green. Nobody was wrong about anything they checked. Nobody had checked the thing that mattered.

### What a revert does not undo

The gate above is mostly about whether the work is finished. It is not about whether the work is safe, and a diff can be exactly the issue's worth of work and still do something that outlives being reverted. Read every diff for these six. Any one of them means stop and ask, not merge - even under a standing instruction, because the standing instruction was about green, and this is not that.

1. **A credential.** A key, token, password, or connection string, in product code or a fixture either way. Reverting does not unpublish it; it has to be rotated.
2. **Anything that widens what the automation may do.** A `permissions:` block, a new secret reference, a trigger that runs against a fork's code, a third-party action, an action pinned to a tag that can move. This one has a check behind it: the project guard fails a pull request whose diff widens any of these unless the body carries a line starting `Privilege change:` saying what and why. It does not forbid the change, only doing it quietly - and it exempts nobody, because a pull request merged under a standing instruction is authored by a maintainer and that is the case it is for.
3. **A new outbound destination.** A request, form action, script source, or embedded resource pointing at a host the project does not already use. This one ships to real readers the moment it merges.
4. **Destruction.** Deleted data, deleted files the issue did not name, rewritten history, a force-push.
5. **A dependency from outside the ecosystem already in use.** Adding the first one of anything is a category change, not a feature, and the ADR that documents it is not a substitute for asking.
6. **A change the pull request does not mention.** Unexplained work is the tell for an honest mistake and for an agent that read an instruction from somewhere it should not have. Roles take their input from issue text, and issue text is written by whoever can comment.

Ask about these in the owner's language, not the diff's. "This adds a request to an address the site has not used before - is that expected?" can be answered by someone who does not read code, which is the point: the check exists to turn a rare risky change into a question they can actually answer, not to make them review the patch.

## Decisions

A decision gets an ADR in `docs/decisions/`, in the same diff that makes it. Four sections: context, decision, consequences, alternatives rejected. A dependency added without an ADR is a dependency nobody can remove later, because nobody knows why it is there.

What counts is a change of category, not a change of number: a schema or data shape, the first dependency from an ecosystem this project does not already use, a new service or platform, or swapping one of those for another. Moving a version within something already chosen is not a decision - it is maintenance, and its reasoning belongs in the commit or the pull request body where the diff is.

This line used to read "any change to a dependency", and the effect was not more ADRs. Routine upgrades were shipped with their reasoning in the commit message and the rule was quietly not followed, which costs more than a narrower rule does: a requirement honoured in the breach teaches that the list is aspirational, and the next thing skipped is one that mattered. Ask which this is - would somebody reversing this need to know why, or only that it happened?

## Work that comes back

A pull request can be refused by the person who reads it, and that is a normal
outcome rather than a failure. The issue is labelled `agent:revise`, which
starts a run the way `agent:queued` does and differs in what the run is holding:
a review, on a pull request that already exists, saying what to change.

For the role that receives one:

1. **Read the review first, and the comments since the pull request opened.**
   That is the whole of what changed. The issue has not moved, and re-deriving
   the work from it is how a revision turns into a second first attempt.
2. **Work the branch and the pull request that already exist.** A second pull
   request for one issue loses the thread the review is on, and the reviewer
   has to find the new one to see whether they were answered.
3. **Address what was asked and nothing else.** A revision that widens the diff
   is a new issue wearing an old one, and it arrives unreviewed because the
   reviewer is reading for what they asked about.
4. **Reply on the review**, saying what you changed and what you did not and
   why. A revision that lands silently makes the reviewer diff it themselves,
   which is the work they delegated by writing the review.
5. **Disagreeing is allowed and does not stop you.** Say so on the pull request
   with your reasoning, then do it their way - unless doing it would break one
   of these rules, and then name which one and stop. That is the one case where
   a reviewer does not get the last word, and it is narrow on purpose.

Two rounds, counted separately from attempts, and neither budget spends the
other. The separation is the point: counted as attempts, rejecting a diff cost
exactly what failing to write one costs, so a reviewer who sent work back twice
left a nearly-right issue at `needs-decomposition` with nothing left. Nobody
does that twice, which is how "reject it" became advice with no mechanism under
it.

A third round is refused and goes to a person, and it means something specific.
A run that cannot satisfy a written review after two goes is not short of
ideas: the review is asking for something the issue does not cover, or it is
not specific enough to act on. Both are the reviewer's to fix.

## The three-strike rule

Three attempts on one issue means the issue was scoped wrong. It does not mean try harder. Stop, comment what was tried and how each attempt failed, label the issue `needs-decomposition`, and wait for a human.

The budget counts runs, not outcomes. A run that starts and then refuses - because a dependency is not merged, or because a command it needs is refused - has spent an attempt as surely as one that wrote the wrong code. It says "attempts" rather than "failures" for that reason, and the reason is not pedantry: an issue queued before its dependencies were merged arrives at the human with a third of its budget already gone and nothing to show for it. Check that the issues an issue depends on are merged, not merely labelled done, before applying the run label.

The same applies to a check that fails three times for three different reasons: the problem is the scope, not the fix.

Revision rounds are not attempts and do not count here. An attempt is a run at work that has not been delivered; a revision starts from delivered work that somebody read, and the scope is the one thing it is not evidence against. They have their own budget, above.

## What agents never touch

Workflow files, CODEOWNERS, and branch protection are outside every agent's reach. A system that can rewrite its own gates has no gates. An agent that believes a workflow needs to change says so in a comment and stops.
