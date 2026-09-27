# A bare Debian server with systemd as PID 1: what `update/install.sh` expects
# to find on a fresh VPS. `--full` runs start here, so the installer brings Bun
# and Node itself, which is part of what they check.
FROM debian:12 AS bare

ENV container=docker
ENV DEBIAN_FRONTEND=noninteractive

# The packages the installer asks apt for are here already, so a flaky
# mirror fails the image build once rather than a scenario halfway.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    systemd systemd-sysv dbus ca-certificates curl git sqlite3 procps cron \
    unzip build-essential python3 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && systemctl mask getty@tty1.service console-getty.service \
    systemd-firstboot.service systemd-udevd.service \
  # The engine is installed from a local bare repository owned by root, as a
  # different user: git refuses that without this.
  && git config --system --add safe.directory '*'

STOPSIGNAL SIGRTMIN+3
CMD ["/lib/systemd/systemd"]

# The same server with the runtimes the installer would fetch, installed the
# way it installs them. Quick runs start here and skip minutes of downloads.
FROM bare AS ready

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
