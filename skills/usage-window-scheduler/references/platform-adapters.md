# Adding a platform

The first release implements Codex native scheduling only. Claude, Gemini, ChatGPT Chat, and other platforms remain unimplemented; no credentials or placeholder integrations are shipped.

Keep the schedule intent independent of provider execution: platform, profile, IANA time zone, hours/minute, minimal prompt, chosen model/effort, and notification preference. Each provider adapter translates that intent into the provider's supported native operation. The current TypeScript planner dispatches by platform and rejects unknown adapters.

Before adding an adapter, establish:

1. **Allowance identity:** official evidence for which subscription pool is metered, how its window starts, whether models share it, and whether API billing is separate. Do not assume all providers use first-message windows.
2. **Supported execution:** an official native scheduler, connector, or CLI with user-authorized sign-in. Avoid credential scraping, private endpoints, automatic browser messaging, and API substitutions that do not touch the intended subscription pool.
3. **Cost control:** inspect model availability without test inference; choose an economical model in the intended pool and its supported lowest appropriate effort. An unavailable cheap model must not silently upgrade.
4. **Clock behavior:** IANA zone, DST semantics, exact local hour/minute pairs, offline/catch-up policy, and retries. A five-hour interval is not equivalent to a fixed daily time list; avoid adding combinations the user did not request.
5. **Lifecycle:** stable task identity, inventory failure handling, reconciliation, read-back, pause/resume, and duplicate handling. Preview is read-only; activation and external requests need authorization.
6. **Evidence:** separately verify configuration, an actual request, and the server-observed quota/reset timestamp. Never report the third from the first two alone.

Add adapter-specific references and deterministic TypeScript behavior tests for these boundaries. Keep resources within this skill; do not import a sibling skill. Update the supported-platform documentation only after the adapter works with a real supported capability. No other platform should be marked supported merely because a schedule can be printed.
