---
description: Run the orchestrator on an issue by hand, without waiting for a label event.
argument-hint: <issue-number>
allowed-tools: Bash, Read, Glob, Grep, mcp__github__issue_read, mcp__github__list_issues, mcp__github__search_issues, mcp__github__add_issue_comment, mcp__github__issue_write, mcp__github__sub_issue_write
---

Invoke the `orchestrator` agent on issue `$1` in the current repository.

If `$1` is empty, list the open issues labelled `objective` and ask which one.

Before invoking it, check three things and stop if any fails:

1. The issue is labelled `objective`. If it is not, it is a task, and a task does not get decomposed. Say so.
2. The issue is not labelled `needs-decomposition` or `agent:blocked`. Either means a human already decided this one waits.
3. The issue has no child issues already. Re-running the orchestrator on an issue it has already split produces duplicates, and duplicates are worse than nothing here because each one looks like real work.

Then hand the issue to the orchestrator and let its own definition govern the rest. Do not decompose the issue yourself in this session - the whole point is that the role definition, not the conversation, decides how work gets split.

Report what it produced: the child issue numbers, their role labels, and anything it refused to split.
