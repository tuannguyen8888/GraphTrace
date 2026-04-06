# Changesets

Use Changesets to describe versioned changes before publishing `graphtrace`.

GraphTrace now treats the workspace as one fixed version set:

- `graphtrace`
- `@graphtrace/web`
- all internal `@graphtrace/*` packages
- the private root `package.json` version is synced to the same release number

Typical flow:

1. `pnpm changeset`
2. write the summary
3. merge changes
4. let the release workflow run `pnpm release:version` and publish
