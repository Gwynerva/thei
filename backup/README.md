# Thei backup client

One file, no dependencies. Copy `thei-backup.mjs` onto the machine that should
keep the copies and run it there; the launchers beside it are conveniences.

```sh
node thei-backup.mjs                 # menu
node thei-backup.mjs --run           # back up now, as a manual copy
node thei-backup.mjs --run --auto    # back up only if a week has passed
node thei-backup.mjs --status        # print state and copies
node thei-backup.mjs --config <path> # use a different settings file
```

Settings live in `thei-backup.config.json` beside the script, which is also
where the last-run timestamp is kept. That file holds the backup token, so it
deserves the same care as the copies themselves.

Requires Node 20 or newer. Everything else — the site address, the token, the
destination — is asked for on first run.

Full documentation, including how to restore, is in `update/README.md`.
