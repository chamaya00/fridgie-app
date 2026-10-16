# Lessons for the designer in this repository

<!--
One line per lesson, specific to this repository, stated as a rule with the
reason attached. Hard cap of 40 non-blank lines, enforced by the guard.

Past the cap, rewrite rather than append: merge two lessons that say the same
thing, drop the one that has stopped being relevant, tighten what survives.

Delete any lesson that has graduated into a test, a lint rule, or a type.
-->

- Put Chromium's `headless_shell` first on PATH as `chromium` before `./scripts/design-render` - the full `/opt/pw-browsers/chromium` lays headless pages out at a 500 px minimum and crops to 375, so the "narrow" picture silently shows a 500 px layout cut off (#6).
- Give `./scripts/design-render` an absolute out-dir and keep `TMPDIR` short - with a relative out-dir or a long `TMPDIR` Chromium writes no file and the script only says "produced no picture" (#6).
