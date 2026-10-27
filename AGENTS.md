# Repository guidance

- Add distributable skills directly under `skills/<skill-name>/`.
- Keep every skill self-contained; do not import files from sibling skills.
- Use TypeScript for deterministic helpers. Do not add Python helpers.
- Keep shared repository tooling under `tooling/`; it is not part of a published skill.
- Add optional directories only when they contain resources used by the skill.
- Run `pnpm run check` and `pnpm run test:smoke` after changing skills or helper scripts.
- Preserve safe defaults: inspection commands may run automatically, but mutations, publishing, deployments, external messages, and commands that execute project lifecycle hooks require explicit user authorization.
