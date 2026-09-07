---
name: release-deploy
description: Deploy the current project changes through a reviewed GitHub pull request, merge them, and verify the production Cloudflare Pages deployment. Use when the user asks to deploy, publish, release, or push the current work live.
metadata:
  short-description: PR review, merge, and production deployment
---

# Release deployment

Use this skill for an explicit deployment request. Treat deployment as a controlled release, not as a simple branch push.

## Required release flow

1. Inspect the worktree, current branch, remote, and the changes intended for release. Preserve unrelated user changes and stop if the release scope is unclear.
2. Run the project checks appropriate to the repository. For this project, prefer the local Windows binaries:
   - `& .\node_modules\.bin\tsc.cmd --noEmit`
   - `& .\node_modules\.bin\next.cmd build`
3. Create or update a GitHub pull request from the current development branch into the repository's deployment branch, normally `main`. Include a concise summary and validation results.
4. Perform a code review of the PR diff before merging. Look for calculation regressions, API-key exposure, persistence changes, responsive UI regressions, and missing tests. Report blocking findings and do not merge while a blocking finding remains.
5. Merge the reviewed PR using the repository's configured merge method. Do not bypass required checks or merge an unrelated PR. If GitHub authentication or repository permissions prevent the operation, report the exact blocker instead of claiming completion.
6. Wait for the deployment workflow triggered by the merged `main` commit. Verify the workflow conclusion is successful and identify the resulting production URL.
7. Verify the live site with an HTTP request and, when browser control is available, load the deployed page and check the changed user-facing area. A successful local build or a successful Git push alone is not deployment verification.

## Provider and safety rules

- Prefer Cloudflare Pages deployment status when the repository is connected to Cloudflare. If the repository is actually configured for another provider, inspect its workflow/configuration and verify that provider instead; state the provider used.
- Never claim that a PR was created, reviewed, merged, or deployed without checking the corresponding remote result.
- Do not force-push, reset the worktree, or discard unrelated changes.
- If a PR is already open for the current branch, update and use it rather than creating a duplicate.
- Keep API keys and user credentials out of commits, PR descriptions, logs, and browser-visible output.
- If deployment fails, report the failing workflow step and leave the branch/PR state intact for diagnosis.

## Final report

Report the PR URL, review result, merge commit, deployment provider/status, live URL, and the validation commands/results. Clearly separate completed items from anything blocked.
