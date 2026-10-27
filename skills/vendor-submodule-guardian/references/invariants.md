# Submodule invariants

Keep these facts separate in reports:

- `.gitmodules` configuration: declared name, path, and URL.
- Parent gitlink: the commit recorded by the containing repository.
- Child HEAD: the commit currently checked out in the submodule.
- Child worktree: local tracked or untracked changes inside the submodule.
- Remote reachability: whether the intended immutable commit can be fetched from the expected remote.

A leading `+` in `git submodule status` means child HEAD differs from the recorded gitlink. A leading `-` means the submodule is not initialized. Neither fact alone proves that files inside the child worktree were edited.
