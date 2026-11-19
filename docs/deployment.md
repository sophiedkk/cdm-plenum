<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Deployment

cdm-plenum runs on one host as two containers from `compose.yaml`
([ADR 0008](adr/0008-compose-with-podman.md)): the app, built from
`Containerfile`, and PostgreSQL. A reverse proxy on the same host
terminates TLS and forwards to the app (Q-SEC-2). E-mail goes out through
your institution's SMTP server.

This page is for the operator of that host. You need Podman with
`podman compose` (Docker with Compose works too), a DNS name for the app,
a TLS certificate for it, and an SMTP account that may send from the
address you put in `MAIL_FROM`.

## Configure

Copy `.env.example` to `.env` in the checkout and fill it in. Compose reads
`.env` from the directory it runs in. The file holds secrets, so make it
readable by its owner only (`chmod 600 .env`) and never commit it.

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | The database password, for example from `openssl rand -hex 32`. `compose.yaml` builds `DATABASE_URL` from it, so use hex or other characters that need no escaping in a URL. |
| `BETTER_AUTH_SECRET` | At least 32 random characters that sign the sessions, for example from `openssl rand -base64 48`. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | The public `https://` address of the app, exactly as the proxy serves it. Sign-in links and invitation links start with it. |
| `SMTP_URL` | The SMTP server, as `smtps://user:password@smtp.example.org:465` or `smtp://...:587`. Escape special characters in the password with percent-encoding. |
| `MAIL_FROM` | The sender address. Required when `SMTP_URL` is set. |
| `CKM_BASE_URL` | The CKM REST API. Leave it empty for the international CKM. |
| `CDM_PLENUM_PORT` | The loopback port the proxy forwards to. The default is 3000. |
| `CDM_PLENUM_IMAGE` | The app image. The default is `localhost/cdm-plenum:latest`, which `podman compose build` makes. |

The app checks its variables when it starts. A missing or malformed one stops
the app before it serves a request, and `podman compose logs app` shows
`Invalid environment configuration:` with the variable's name (never its
value). Without `SMTP_URL` the app sends no
e-mail at all: facilitators can still copy invitation links, but nobody
receives a sign-in link, so a production stack needs SMTP.

## First start

Build the image, start the database, run the migrations and give the first
person a way in:

```sh
podman compose build
podman compose up -d postgres
podman compose run --rm app node src/server/db/migrate.ts
podman compose run --rm app node src/server/admin/grant.ts grant admin@example.org
podman compose run --rm app node src/server/admin/grant.ts grant admin@example.org --facilitator
podman compose up -d
```

Start PostgreSQL on its own first: `podman compose run` does not wait for
the database's health check, so a migration run straight after a cold
start can fail with `ECONNREFUSED`. Run it again once
`podman compose ps` shows the database as healthy.

There is no open registration (PR1). The grant command gives an e-mail
address the `administrator` role, or with `--facilitator` the right to
create projects; the person then signs in at `/sign-in` with that address.
`grant.ts revoke <email> [--facilitator]` takes a role back. The command
prints `granted`, `already_granted`, `revoked` or `not_granted`, never the
address.

`curl http://127.0.0.1:3000/api/health` answers `{"status":"ok"}` once the
app runs. The image and `compose.yaml` both run this check, so
`podman compose ps` shows the app as healthy or unhealthy. The check tells
you the process is up; it does not touch the database.

## Reverse proxy and TLS

The app listens on `127.0.0.1:3000` only and speaks plain HTTP. Put a
reverse proxy in front of it that serves HTTPS on the public name, redirects
HTTP to HTTPS, and forwards every request to `http://127.0.0.1:3000`
(Q-SEC-2). Never publish port 3000 on another interface.

The proxy must also tell the app the client's address. The app limits how
often one client may ask for a sign-in link or open one: 5 requests per
60 seconds per address, the default of the better-auth magic link plugin
(<https://www.better-auth.com/docs/plugins/magic-link>,
<https://www.better-auth.com/docs/concepts/rate-limit>). better-auth reads
the address from the `X-Forwarded-For` header and trusts it only when the
header holds a single address. The app sets no `advanced.ipAddress` option,
so this default applies. When the header is missing or holds a chain of
addresses, the app logs `Rate limiting could not determine a client IP`
and every client shares one limit, so 5 link requests a minute for the
whole site.

So the proxy must replace `X-Forwarded-For` with the address it received
the connection from, and drop whatever the client sent. With Caddy,
`reverse_proxy` does this by default for clients that are not in its
`trusted_proxies` list
(<https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults>):

```caddyfile
cdm-plenum.example.org {
	reverse_proxy 127.0.0.1:3000
}
```

With nginx, set the header to `$remote_addr`. The common
`$proxy_add_x_forwarded_for` appends to the client's header and makes a
chain, which better-auth ignores
(<https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header>):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

A class that sits behind one school network address shares one limit too:
30 students who ask for a link in the same minute get refused after the
fifth. Hand out invitations ahead of the session, or stagger the first
sign-in.

## Updates

```sh
git pull
podman compose build
podman compose run --rm app node src/server/db/migrate.ts
podman compose up -d
```

Read `CHANGELOG.md` before an update. Take a backup first: a migration
changes the schema, and `migrate.ts down` reverts only one migration at a
time.

## Backups

All data lives in PostgreSQL, in the named volume `cdm-plenum_pgdata`. The
app keeps nothing on disk. Back up with `pg_dump`, which works while the
app runs:

```sh
podman compose exec -T postgres pg_dump -U cdm_plenum -Fc cdm_plenum > cdm-plenum-$(date +%F).dump
```

Run it daily, for example from a systemd timer or cron, and copy the dumps
to another machine: a dump on the same disk does not survive the loss of
that disk. The dump holds names, e-mail addresses and every rating (Q-PRIV-1),
so store it with the same care as the database.

To restore into an empty stack, start PostgreSQL alone, restore, then start
the app:

```sh
podman compose up -d postgres
podman compose exec -T postgres pg_restore -U cdm_plenum -d cdm_plenum --clean --if-exists < cdm-plenum-2026-11-19.dump
podman compose up -d
```

`podman compose down` keeps the volume. `podman compose down -v` deletes it
with all data.

## Logs

`podman compose logs app` shows the server log. It carries record ids and
outcome codes; Q-PRIV-2 rules out ratings, element texts and names in it.
