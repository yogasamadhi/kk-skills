# Mini-app manual release gates

Verify these gates against current official documentation for the selected platform and account:

- production app identifier, project type, build mode, and environment;
- request, upload, download, WebSocket, and embedded-webview domain allowlists;
- privacy-sensitive API inventory, user-facing purpose descriptions, consent timing, and privacy declaration consistency;
- required scopes, plugin providers and versions, cloud environment, and service categories;
- production API endpoints, TLS, analytics, logging, source maps, and debug switches;
- main package, subpackage, resource, and total upload limits using the actual built artifact;
- version, release notes, reviewer test path, test account, and feature-flag state;
- preview on representative devices, cold start, network failure, permission denial, update flow, and rollback plan.

Do not interpret missing local configuration as approval. Some gates exist only in the platform console or organization account.
