---
name: instrumentation
description: How an event is chosen, emitted, verified, and stored - the implementation half of a measurement contract. Use when deciding what is worth logging, building or reviewing event logging, wiring the exposure point of an experiment, or judging where events should be kept.
---

# Instrumentation

A measurement contract says what must be true. This says how to make it true and how to prove it. The contract is the analyst's; the code and the store are not.

## What earns an event

Work backward from the decision, never forward from the interface. An interaction earns an event when knowing how often it happens would change what somebody does next. If no answer changes anyone's behaviour, the event is a cost with no return, and the cost is not storage.

Three ways the wrong things get logged:

- **Logging what is easy to capture.** Every click is easy and tells you almost nothing, because the rate of an interaction nobody had a question about cannot be read as good or bad.
- **Logging what is already derivable.** If an existing event plus a timestamp answers it, the new event adds schema and no information.
- **Logging what nobody named a decision for.** "We might want it later" is how a log becomes unreadable. Later is when you add it, and the contract says how.

Every event is schema surface for as long as the product lives. It has to survive every refactor, it has to be correct in every state, and a log crowded with events nobody reads makes the ones that matter harder to find. So say explicitly what is *not* logged and why - an omission that was decided reads completely differently from one that was overlooked, and only the written one stops the question being reopened every quarter.

When only one thing can be logged, log the outcome. The steps in the middle of a flow are worth less than the thing the flow exists to produce, and a funnel with a missing middle is still readable while a funnel with a missing end is not.

## Verifying a logged event

"The function was called" is not verification. Each event in the contract needs four things proved, and the fourth is the one that gets skipped:

1. It fires **when** the contract says.
2. It fires **exactly as often** as the contract says.
3. It carries **every property** the contract names, with the right values.
4. It does **not** fire in the cases the contract excludes.

Double counting lives in the fourth. Write the test that performs the interaction twice and asserts one event. Write the test for the path where the write itself fails, because a log that silently drops on a full or refusing store is worse than no log - it reads as a real number that happens to be wrong.

**Never assert against a fixture the system cannot produce.** A test whose setup describes an impossible state proves nothing and is worse than a missing test, because it reads as coverage and ends the search. If the contract says an arm is fixed per person, a fixture mixing two arms in one person's log is not a test of anything. Build fixtures by driving the real entry points wherever you can, so an impossible state is impossible to set up.

## Exposure points

The exposure event fires when the arm is assigned, before the first render that differs between arms. Getting that wrong is the most common way an experiment ends up unreadable, and it never announces itself - the numbers arrive, they are just not the numbers anyone thinks they are.

The traps, each of which inflates or deflates the denominator silently:

- **Re-render and remount.** Exactly-once needs a guard that outlives the component, not a flag that resets with the render path.
- **Rendering in two places.** When a page is produced once on a server and again in the browser, both can fire. Decide which one is the truth and make the other silent.
- **Firing on read instead of on assignment.** If the event is emitted every time the arm is looked up, every page load emits one, and the denominator becomes a page-view count wearing the name of a person count.
- **Assignment that does not persist.** The arm flips on the next load and exposure inflates. Persist or exclude: if the arm cannot be stored, emit nothing and treat that person as unexposed.
- **Unassigned is not a third arm.** People who were never assigned are outside the experiment, not a comparison group.

Two tests carry most of this: someone who is exposed and never acts still produces exactly one exposure event, and someone who acts five times still produces exactly one.

## Judging where events are stored

Not which product - what any candidate has to satisfy. Answer these before the choice, and record the answers in the ADR:

- **Do events leave the device at all?** If they do not, there is no aggregate and no experiment - only each person's own history, and any per-arm number on a page is an artefact of where state is kept rather than a result. This is the first question because a yes to everything below is worthless without it.
- **Can it answer the queries the metric definitions need?** A store that holds the events but cannot group them the way the contract counts them means a second system, which is a decision of its own rather than a detail.
- **Can a record change after it is written?** If it can, a number computed yesterday will not reproduce tomorrow, and nobody will be able to say which run was right.
- **Is there a key that makes a repeat harmless?** Retries and double-fires are the normal case, not the exception. At-least-once delivery with no key to collapse duplicates is a counting error waiting for traffic.
- **What happens to events that arrive late or out of order?** A metric windowed by when something happened reads differently from one windowed by when it arrived. Say which the contract means.
- **What happens to old records when a property is added?** Absent and empty are different, and a metric that cannot tell them apart will quietly report the day of the schema change as a cliff.
- **Is anything kept for as long as the longest window a metric needs?** A retention period shorter than the comparison makes the comparison impossible, and it fails at the moment somebody first wants it.
