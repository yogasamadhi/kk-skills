# Dependency incident evidence method

Classify each conclusion at the strongest level supported by evidence:

1. **Declared** — a manifest directly requests the package.
2. **Resolved** — the lockfile or installed tree contains a concrete version.
3. **Affected** — the concrete version falls inside the advisory's affected range.
4. **Reachable** — repository code, build tooling, tests, or a transitive dependency uses the vulnerable feature or compromised execution path.
5. **Observed** — logs, artifacts, network records, or reproduction show the behavior occurred.

Do not skip levels in the report. A build-only dependency can still matter when the advisory concerns install scripts, compiler plugins, test hooks, generated artifacts, or credential access in CI.

For every remediation candidate, record:

- resulting resolved version;
- package that forced the old version;
- production, development, build, or optional scope;
- compatibility risk;
- verification performed;
- whether old generated artifacts or caches remain relevant.
