---
kind: issue
status: implemented
github_issue: 49
github_state: open
github_url: https://github.com/phodal/pero/issues/49
---

# Shared App SDK resolves React outside the App dependency tree

The local fix is implemented. Upstream scope and acceptance are awaiting
maintainer discussion in #49; no upstream PR has been opened.

## Problem

An App built from a checkout nested below another JavaScript project can render
a blank page. Paper Agent's first render throws `Cannot read properties of null
(reading 'useState')` before its error boundary can mount.

At source `0847ddca12ca7d034417d1bd88a4f04696e13ba2`, `node scripts/build/apps.mjs
--app paper-agent` succeeds, but Paper Agent resolves its own React 19.2.8 while
the shared App SDK resolves an ancestor project's React 19.3.1. The build's
`nodePaths` is a fallback; it does not override an ancestor package found through
normal module resolution. The renderer and SDK consequently use separate React
instances.

The builder is unchanged at `c5e5ac3ad20939f896fe29701fd1c432a0ab6213`.
The branch is based on that revision, and the regression fails against its
unmodified builder while passing with the scoped fix.

## Scope

Bind `react`, `react-dom` and their subpaths to each App's installed dependency
tree in the existing builder. Keep App dependency versions and runtime code
unchanged. The regression check invokes the actual builder in an isolated
fixture with and without ancestor React packages, then evaluates the generated
bundle to compare App and SDK runtime identities.

## Acceptance

- The fixture succeeds with and without ancestor dependencies.
- The original fixture fails when ancestor dependencies are present.
- Paper Agent renders and completes local import, search and reopening after
  backend restart with its real UI and Python backend.
- Browser/App validation is distinct from full Electron, Host and release
  validation. Model execution is outside this test's scope.

## Local verification

On macOS arm64 with Node 24.12.0 and Python 3.13, the runtime regression and
the two related App/workbench bundle tests pass. The regression is included in
the existing cross-platform build CI job. Paper Agent builds and typechecks;
all 22 Python tests pass on the final run.

The real built UI and Python backend, served through a loopback-only preview
adapter, imported a mixed Chinese/English Markdown file and a two-page PDF.
After terminating the backend and starting a new process against the same data
directory, both documents remained searchable. Search results reopened the
complete Markdown and PDF page 2. Saved JSON and PDF bytes were unchanged.

The first Python suite run hit the existing three-second HTTP test timeout;
the unchanged HTTP test and subsequent full suite passed. This does not
establish a separate product defect. Full Desktop, remote CI, Windows/Linux,
model execution and release packaging remain unverified.
