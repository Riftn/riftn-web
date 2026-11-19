# Team skills and working notes

## Team skills: check these first
Before starting a task, open the team skill that matches it and follow its steps:

| Task | Skill |
|---|---|
| Anything on the Requests board (riftn.com/app/features) | `riftn-requests-sweep` |
| Opening, merging and deploying any change | `riftn-ship-flow` |
| Proving a UI change works (screenshots, themes, phone web + app) | `riftn-visual-check` |
| App store builds, TestFlight testers, App Store / Play release | `riftn-store-builds` |
| Design options before building ("concepts first") | `riftn-concept-round` |

If a workflow changes, update the matching skill too, so the next person gets the new steps.

## Requests board rule
If a request needs more info from the person who posted it, or we can't test it ourselves (for example it only happens on iPhone or one browser), reply to them on the request from the @assistant account. Never leave a request silent. Full rules: [requests-board.md](requests-board.md).

## This repo
- Default branch: `main`. Ships with the "Deploy production" workflow (`production-deploy.yml`, revision = full main sha).
- Supabase migrations in `supabase/migrations` do not apply on merge; apply them to prod right after.
- New pages need theme icons for every theme, social share cards and SEO metadata. Check visuals on `/app/state-gallery?theme=hazy` (swap the theme).

## Always
- Start from the latest default branch on GitHub. Others merge all the time, so check again right before merging.
- Commits and PRs as maldoteth. Squash-merge with a plain one-line message. PR bodies say intent, constraints and result, and nothing about how the work was produced.
- "Mobile" means phone web AND the app. Desktop must not change when only mobile is asked for.
