---
name: design-craft
description: How to act like a designer rather than a transcriber - refining the request before answering it, exploring more than one direction, what "modern" is allowed to mean in checkable terms, and the critique pass against the rendered mock. Use on any issue that changes how something looks, before writing the spec.
---

# Design craft

The role file says what to produce. This says how to be worth asking.

The failure this exists to prevent is not ugliness, it is *averageness*: a specification that answers the issue exactly, satisfies every criterion, and looks like the midpoint of everything the person writing it had ever seen. That midpoint is what someone means when they call a design bland. It is also the default output of anyone working fast from memory, which is why the steps below are mostly about slowing down in specific places.

## The issue is a first draft, not a brief

An issue arrives written by somebody solving a different problem - splitting an objective, usually - and it carries their guesses about what the design should be. Those guesses are the most expensive thing in the issue, because they look like requirements.

So before specifying anything, separate the three:

- **The outcome.** What has to be true for a person using this. This is fixed.
- **The constraints.** What genuinely cannot move - an existing mechanic, a data shape, a decision already recorded. Check these rather than assuming; an issue frequently restates a constraint that stopped being one.
- **The guesses.** Everything else, including how many of something there should be, what it is called, what it looks like, and which of these the issue implied by describing only one option.

Say in the document which is which. Where a guess is load-bearing and you disagree with it, propose the alternative and say why - that is the single highest-value thing in a design document, and it is the thing a run that treats the issue as a brief can never produce.

An issue that scopes out the rendered mock is a guess, not a constraint. The role file covers that one.

## Explore before you commit, even when asked for one thing

Specify one direction and nobody can tell whether it is good; they can only tell whether they object to it. Two or three, and the conversation becomes a choice, which is a conversation a person can actually have in a minute.

So carry at least two directions to the point where the difference is visible, even when the issue asks for one. They must differ in *structure* - what dominates, what the page does with its space, what the thing feels like to use - and not merely in palette. Three palettes on one layout is one direction wearing three coats, and it is the commonest way this step gets faked.

Then recommend one, in your own voice, with the reason. A set of options with no recommendation hands the work back.

## Go and look first

Search the web before fixing a direction, every time. Name two or three specific pieces of current work in the document, say what each does well, and say what you are taking and what you are refusing. "Refusing" matters as much - a reference you only borrow from produces pastiche.

A direction chosen without this is chosen from memory, and memory here is several years of training data averaged. That is the mechanism behind bland, stated plainly: not bad taste, but the mean of all taste.

## What "modern" is allowed to mean

Not a vibe. Every item below is a property of a rendered page that two people can check by looking, which is the only kind of aim worth writing down.

- **Real typographic contrast.** Something on the page is several times the size of something else, and the difference is structural rather than decorative. The dated tell is a page where every size sits between small body text and a modest heading, so nothing leads. Large text wants tighter letter-spacing than its default; small uppercase text wants looser.
- **A spatial idea.** One element dominates and has room around it; space is distributed unevenly on purpose. The dated tell is uniform padding everywhere, which reads as a form rather than a page.
- **A ground that is not pure white or pure black.** Both are the absence of a choice. A near-white with a temperature, or a near-black that is not flat, is one decision that lifts everything sitting on it.
- **One accent, used a few times.** An accent that appears on every interactive thing stops being an accent and becomes a theme. Count its appearances; if the number is large, most of them are decoration.
- **One language of depth.** Outlines, or fills, or shadow - pick one and hold it. The dated tell is a hairline border around every single element, which is what a page looks like when nobody decided.
- **Both themes, from the start.** Specify light and dark together, with contrast checked in both. A dark theme derived later by inverting values is a different and worse design, and the inversion is where accessible contrast quietly dies.
- **Motion that is named.** Give duration and easing for anything that moves, say what it communicates, and say what happens for a person who has asked for reduced motion. Unnamed motion is implemented as a guess or not at all.
- **One deliberate oddity.** Something a reasonable designer might not have done, that you can defend in a sentence. This is the item that separates a design from a template, and it is the one most likely to be cut - so write the defence next to it.

And the accessibility floor, which is not separate from the craft: contrast checked in both themes, a visible focus state specified for everything focusable, interactive targets large enough to hit, and no meaning carried by colour alone. A design that fails these is not a bold design, it is an unfinished one.

Checked means computed. `./scripts/contrast <foreground> <background>` prints the ratio for a pair, and a third argument makes it a pass or a fail you can put in a criterion. Do not apply the luminance formula in your head and write the answer down as though it had been measured: it has been done, over eight pairs, and every one happened to be right - which is the argument for the command rather than against it, because nothing about that page would have gone red if one of them had been wrong by a third.

## Then argue with your own mock

The point of rendering is to be surprised. Open the pictures and look for the things markup never says:

- What did your eye land on first? If it is not what you intended, the design is not what you specified.
- Read the narrow picture before the wide one. Clipping, collision, and a hierarchy that collapses into one column all show up there first.
- Cover the accent with your hand. If the page falls apart, the accent was doing structural work that layout should be doing.
- Blur your eyes. What survives is the composition. If nothing survives, there is no composition.
- Find the one element you would remove. Say why it stayed.

Write what you found and what you changed. A critique section that lists no changes is a critique that did not happen, and it is obvious to a reader which one they are holding.

## Say the thing you are unsure about

A direction is a judgement, and some judgements are not yours to make alone. When one is genuinely the owner's - which of two directions the product takes, a name that will outlive the issue, a trade-off with no right answer - raise it the way house-rules describes, recommend an answer, and keep working under your recommendation.

Do not raise a question you could have settled. Do not raise five. And do not raise none across an entire objective: a design role that never once needed a decision either had nothing at stake or made every call silently, and only one of those is consistent with the work being any good.
