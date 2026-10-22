## What and why

<!-- What does this change, and what problem does it solve? Link the issue: Fixes # -->

## How to check it

<!-- Steps, or the test that covers it. Add a screenshot for UI changes. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation only

## Checklist

- [ ] I ran `npm run verify` (ideally in a fresh clone) and it passes
- [ ] I added or updated tests; a bug fix has a test that fails without the fix
- [ ] New or changed MCP tools are described in `descriptors.ts`, translated in the three locale files, and `npm run docs:mcp` was run
- [ ] Files loaded by the Kuzu worker match `build.asarUnpack` (patterns are case-sensitive)
- [ ] I updated `CHANGELOG.md` and the documentation where behaviour changed
