## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- What problem does it solve? If it changes a rubric weight, name a repo
     that is currently scored wrong and say what it should score instead. -->

## Checklist

- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm deps:check && pnpm build` passes
- [ ] If this changes the rubric: `RUBRIC_VERSION` is bumped in `lib/config.ts` and `lib/score/rubric.test.ts` is updated
- [ ] If this changes a documented decision: `docs/SPEC.md` is updated in the same commit
- [ ] No new dependency added without a reason in the description
