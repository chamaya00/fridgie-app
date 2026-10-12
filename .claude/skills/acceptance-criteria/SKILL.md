---
name: acceptance-criteria
description: The format for writing acceptance criteria that are observable and checkable, used when creating child issues, judging whether an issue is ready to start, or deciding whether a pull request actually satisfies its issue.
---

# Acceptance criteria

A criterion is a statement that a test can prove false. If nobody can say precisely what would make it fail, it is an aspiration, and aspirations cannot gate a merge.

## The format

Each criterion is one line, in the form:

`Given <starting state>, when <action>, then <observable result>.`

Attach to each criterion the check that proves it: a test name or a command. If the criterion is something a user can see, attach both - the check, and where a human looks to confirm it with their own eyes.

Both, rather than either, because each one alone fails in its own direction. A check nobody can see passing sends the reviewer back to reading the diff, which is the thing checks exist to replace. A screen nobody tested regresses quietly, with nothing going red.

## The test

Read the criterion and ask: could two reasonable people disagree about whether it is met? If yes, rewrite it.

Good: "Favorites persist across a tab switch, verified by a test that reloads the page and asserts the list length."

Bad: "Favorites work well."

Good: "An empty favorites list shows the empty state, not a spinner, verified by a component test."

Bad: "Handle the empty case gracefully."

Good: "Given three entries in the content directory, when the page is built, then all three are listed in date order - covered by `lists entries newest first`, and visible as three rows on the entries page."

Bad: "The entries page looks right." Nothing here says what a reviewer would be looking at, so two people can disagree about whether it passed.

## Coverage

Criteria cover the states, not just the happy path. For anything a user touches, that means at least: the normal case, the empty case, and the failure case. An issue whose criteria only describe success is an issue that will ship a broken error path.

Criteria describe behaviour, not implementation. "Uses a reducer" is not a criterion; it is a decision, and it belongs in an ADR.

**A criterion about a built artifact names which build produced it.** "Checked against the built output" sounds rigorous and is not: it says a file was read, not that the file is the one a user gets. A project's own build and the build that publishes it are frequently different programs, and a criterion that does not say which one it means will be satisfied by whichever is convenient. That is not a hypothetical - a repository once proved every criterion against output from a builder that never ran in production, and shipped a site nobody could load.

So write the builder into the criterion: *when built by `<the thing that publishes this>`, then ...*. If the two builds differ and the checkable one is the local one, say that too, and say what covers the gap. A criterion that quietly measures the wrong artifact is worse than a missing one, because it ends the search.

**A criterion that names a value says what the value has to be, not that it is there.** "Then the page contains a link back to the listing", "then the config sets a timeout", "then the response includes a user id" are all satisfied by a value that is present and wrong. The check written from one greps for existence, goes green, and the criterion is ticked - so the reviewer stops looking, which is the whole cost.

Presence is the right shape only when presence is genuinely the requirement - an optional field rendering at all, an element being absent in an empty state. Whenever the thing could be present and still broken, write the correct value into the criterion and let the check assert that: *then the page contains a link to the listing that resolves from the entry's own URL*, not *then the page contains a link*.

The tell is that you can imagine a plausible wrong implementation passing. A repository lost this one twice over in a single objective: a spec said an entry page's "back" link should be a bare relative path, a criterion asked only that the built page "contains a link back to its collection's listing", and the one grep that might have caught it only looked for root-absolute paths. Every criterion would have passed with the link 404ing from every entry page on the site.

**A criterion about how something looks names what a reviewer opens and what they should see in it.** "Then the page is visually distinct from default browser styling" is the floor: any stylesheet at all satisfies it, including one nobody would ship, and work written against a floor clears the floor and stops. "Matches the design spec" is no better when the spec is prose - two readers of the same paragraph disagree about what it asked for, which is the disagreement this whole file exists to prevent.

So name the artifact and the treatment: *given the mock at `docs/design/<file>`, when the built page is opened beside it at a desktop width and at 375px, then the card is the element the eye lands on first at both widths, and the two variant accents still read as cool against warm.* The mock is what makes that checkable at all - it is the place a human looks, which every user-visible criterion is supposed to name, and a criterion written before one exists is usually a criterion nobody can settle.

A repository learned this the expensive way. Every visual criterion across a four-child objective read "visually distinct from default browser styling" or "checked visually against the spec", none of them named anything to look at, the agents that could not open a browser discharged them by reading compiled CSS, and every one was ticked. No eye reached the rendered page until after the last pull request had merged.

**A criterion that compares the built page against the mock names the command that photographs it.** `./scripts/app-render <route> <out-dir>` builds this repository, serves it, and photographs a route at the mock's two widths, and a criterion that says "compared against the mock" without naming it is one an engineer can only discharge by reading compiled CSS - which is exactly what happened, twice, on a card that had shipped with none of its content. Write the command in: *given the mock's wide picture, when `./scripts/app-render /entries docs/design/shots` is run, then the two pictures show the same element leading at both widths - both attached to the pull request.* The same goes for a number: a criterion naming a contrast ratio names `./scripts/contrast <foreground> <background>`, which prints it, because a ratio worked out by hand is a value nothing checked.

**And a design child's criteria may not be satisfiable by a text search alone.** This is the same failure wearing the opposite disguise. A criterion like "the document contains three direction sections, checked by `grep -c '^## '` returning 3", or "two hex values under each accent heading", is observable, checkable, and named - it passes every test on this page - and it still gates nothing that anybody can see, because every one of those checks is a count of characters in a file. Work written against a countable criterion produces countable output: a run given exactly those criteria returned a document of type scales, spacing tokens and hex codes in under four minutes, satisfied all of them, and left nobody able to say what any of it looked like.

So on a child whose role is design and whose issue is visual, at least one criterion names the rendered mock and what a person should see in it, and structural greps are the *supporting* half of a criterion rather than the whole of one. Write it as the pair this page already asks for: *given `docs/design/<file>.html` rendered by `scripts/design-render`, when the wide and narrow pictures are opened, then the card is what the eye lands on first at both widths and no heading clips at the narrow one - and `grep` confirms each of the three directions has its own palette block.* The grep keeps the document honest; the picture keeps the design honest; neither does the other's job.

**Do not write a design child's scope so that it excludes the mock.** "No code, no stylesheets" is a reasonable thing to want from a specification and a catastrophic thing to write on a visual issue, because a mock is markup and a role reading that line will take it as covering one. It has happened: the line went in, the mock was skipped, the criteria were greps, and three separate engineer runs were then spent building previews so that a person could see the thing at all. If the intent is "do not ship this into the product", say that - the mock lives in `docs/` and never reaches a user, which is the distinction the scope line needs to draw.

## What a criterion costs to satisfy

A criterion is also an instruction to spend a run's budget, and the agent writing it is not the agent paying. Write them knowing that.

The cost is in *setups*, not assertions. A fixture that has to be built, seeded, torn down, or compiled is expensive; another assertion against a fixture that already exists is nearly free. Three criteria each demanding their own build cost roughly three times one criterion demanding a build that three assertions then read - and the observable behaviour proved is identical.

So when several criteria describe the same starting state, say so once: `Given <that state>, when <action>, then <result>, and <result>, and <result>`. Split them only when the starting states genuinely differ.

This is not a licence to ask for less. Nothing about what "done" looks like changes - the same behaviours are still proved, and a criterion that needs its own expensive setup keeps it. What changes is that the issue fits in the budget that has to satisfy it, instead of dying at the turn cap with the work half done and the attempt spent.

If an issue cannot be stated inside its budget even written this way, that is the finding: it is two issues, and saying so costs nothing compared to discovering it from a run that ran out.

## How many

Between two and six per issue. One criterion means the issue is a task and probably belongs inside another issue. More than six means it is two issues wearing a coat.

## Readiness

An issue is ready to start when every criterion is observable, checkable, and covered by a named check. An issue that fails that test does not get worked on - it gets sent back with the specific criterion that needs rewriting quoted in the comment.
