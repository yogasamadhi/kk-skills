# Runtime matrix method

Record one row per exact runtime and version:

| Target | Entrypoint | Static status | Command or harness | Executed result | Evidence |
| --- | --- | --- | --- | --- | --- |
| Node.js | package root | likely / blocked / unknown | consumer fixture | pass / fail / not run | log path |

Static blockers commonly include:

- browser or edge entrypoints importing Node-only modules;
- CommonJS globals in an ESM-only path;
- native addons without a target build;
- unconditional filesystem, process, socket, or child-process access;
- export targets missing from the packed package;
- runtime detection that executes an unsupported global before guarding it.

Keep server-only subpaths separate from universal entrypoints. Verify both import and require paths when the package claims dual-module support. For browser and edge claims, test a real bundler or deployment harness because successful parsing does not prove that resolution and tree-shaking work.
