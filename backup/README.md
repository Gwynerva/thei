# Thei backup client

Two scripts that do the same thing, and need nothing installed:

| File              | Runs on                  | Needs                                 |
| ----------------- | ------------------------ | ------------------------------------- |
| `thei-backup.cmd` | Windows                  | PowerShell 5.1, which ships with it   |
| `thei-backup.sh`  | Linux, macOS, NAS, a VPS | `bash` and `curl`, which ship with it |

Download the one you need from **Settings → Backups** in the admin panel: the
site address is already filled in, and so is the token if you download right
after generating it. Put the script on the machine that should keep the copies
and run it:

```sh
thei-backup.cmd                        # Windows: double-click, or from a console
bash thei-backup.sh                    # anything else
```

Both open a menu driven by the arrow keys and Enter (numbers work too). The
same actions are available as flags, which is what the schedule uses:

```sh
--run            back up now, as a manual copy
--run --auto     back up only if a week has passed
--run --force    back up even though the site shrank sharply
--status         print state and copies
--config <path>  use a different settings file
```

Settings live in `thei-backup.conf` beside the script, together with the time
and size of the last backup. That file holds the backup token, so it deserves
the same care as the copies themselves.

## The weekly schedule

Installed from the menu. It fires daily and backs up only once a week has
passed, so a machine that was switched off catches up the next time it runs,
and a manual backup restarts the week on its own.

- **Windows** — a Task Scheduler task that starts when available, so a run
  missed while the machine was off or restarting happens as soon as it is back.
- **Linux as root** — a system systemd timer with `Persistent=true`.
- **Linux as a user** — a user systemd timer, with lingering enabled so it runs
  after a reboot without anyone logging in. If lingering cannot be enabled, the
  menu says so and gives the command to run as root.
- **No systemd** — cron, plus an `@reboot` entry to catch up after restarts.
- **macOS** — a launchd agent that also runs at every login.

## When the site shrinks

Before downloading anything, the client compares the site with the last
backup. If it lost more than 30% of its files or of its size, the run stops:
nothing is copied, no old copy is rotated out, and the client raises the alarm —
`ALERT.txt` in the destination folder, a dialog on Windows, a desktop
notification or `wall` message elsewhere, and a window left open when someone
is watching. Every later run stops the same way.

If the site lost that much on purpose, choose **Back up anyway** in the menu (or
run with `--force`) to accept the new size.

Full documentation, including how to restore, is in `update/README.md`.
