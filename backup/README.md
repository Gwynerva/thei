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
--run                   back up now, as a manual copy
--run --auto            back up only if the interval has passed
--run --force           back up even though the site shrank sharply
--status                print state and copies
--install-schedule [H]  run daily at hour H (default 3)
--remove-schedule       remove the schedule
--config <path>         use a different settings file
```

Settings live in `thei-backup.conf` beside the script, together with the time
and size of the last backup. That file holds the backup token, so it deserves
the same care as the copies themselves. Besides what the menu asks for, it
takes:

| Key             | Default | Meaning                                                  |
| --------------- | ------- | -------------------------------------------------------- |
| `keepCount`     | `3`     | scheduled copies kept                                    |
| `intervalDays`  | `7`     | days between scheduled copies                            |
| `shrinkPercent` | `30`    | how much the site may lose before a run stops            |
| `alertCommand`  | —       | a command run when a run stops, with `THEI_BACKUP_ALERT` |

A script downloaded again with a new token takes that token over once; a token
typed into Settings later wins.

Backing up several sites from one machine: give each its own settings file
with `--config`. Each gets a schedule of its own, named after that file.

## The schedule

Installed from the menu or with `--install-schedule`. It fires daily and backs
up only once the interval has passed (with half a day of slack, so a weekly
copy stays weekly), so a machine that was switched off catches up the next
time it runs, and a manual backup restarts the interval on its own.

- **Windows** — a Task Scheduler task that starts when available, so a run
  missed while the machine was off or restarting happens as soon as it is back.
  It runs while you are signed in, and writes what it did to
  `thei-backup.log` beside the settings.
- **Linux as root** — a system systemd timer with `Persistent=true`.
- **Linux as a user** — a user systemd timer, with lingering enabled so it runs
  after a reboot without anyone logging in. If lingering cannot be enabled, the
  menu says so and gives the command to run as root.
- **No systemd** — cron, plus an `@reboot` entry to catch up after restarts.
- **macOS** — a launchd agent that also runs at every login.

## Copies

Copies are named by when they finished:

```
auto-20260915T030000Z/     scheduled copies, the newest keepCount of them
manual-20260910T142233Z/   manual copies, kept until you delete them
```

A new scheduled copy is renamed into place before the oldest is removed, so
the destination is never without a complete copy. Manual copies do not take a
slot and are never rotated out.

Every copy is a complete folder of ordinary files that can be copied anywhere.
An asset that did not change since an earlier copy is shared with it as a hard
link rather than stored twice, so each new copy costs only what changed;
deleting one copy never touches another. Asset files are named by the SHA-256
of their bytes, and each one downloaded or reused is checked against its name.

A run in progress fills `.partial` in the destination. If it stops, the next
run picks up what was already fetched. The site is told a copy exists only
once it is renamed into place.

## When the site shrinks

Before downloading anything, the client compares the site with the last
backup. If it lost more than 30% of its files or of its size, or more than 30%
(and more than two) of its projects, events, diary entries or pages, the run
stops: nothing is copied, no old copy is rotated out, and the client raises the
alarm — `ALERT.txt` in the destination folder, the `alertCommand`, a dialog on
Windows, a desktop notification or `wall` message elsewhere, and a window left
open when someone is watching. Every later run stops the same way.

If the site lost that much on purpose, choose **Back up anyway** in the menu (or
run with `--force`) to accept the new size.

What a copy holds, and how to restore one: `update/README.md`, "Backups".
