# Contributing to GraphTrace

Thanks for contributing to GraphTrace.

## Ground Rules

- Use Node.js 22 or newer within the supported range in `package.json`
- Use `pnpm`
- Keep changes focused and small enough to review
- Prefer discussion in an issue before large changes

## Branch Strategy

- `main` is the stable integration branch
- Do not push feature work directly to `main`
- Create a topic branch from `main`
- Open a pull request back into `main`

Examples:

```bash
git checkout main
git pull --ff-only
git checkout -b feat/your-change
```

## Local Verification

Run these commands before opening or updating a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If your change affects packaging or the web app, also run:

```bash
pnpm build
```

## Pull Requests

- Use a clear title that explains the behavior change
- Describe what changed and why
- Link the related issue when one exists
- Include screenshots or terminal output when the change affects UX or CLI output
- Keep unrelated refactors out of the same pull request

## Issues

When reporting a bug, include:

- what you expected
- what happened instead
- steps to reproduce
- environment details

When proposing a feature, explain the use case first and the proposed API second.
