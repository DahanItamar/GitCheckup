# deploy/

The parts of the running deployment that live outside the container.

Nothing here is read by the app or by CI — it is a copy of what is installed on
the host, kept in the repository so the origin's configuration is reviewable
and rebuildable rather than existing only on one machine. If you change it on
the server, copy it back here in the same commit.

| File                        | Installed at                                 |
| --------------------------- | -------------------------------------------- |
| `nginx-gitcheckup.conf`     | `/etc/nginx/sites-available/gitcheckup`      |
| `refresh-cloudflare-ips.sh` | `/usr/local/sbin/refresh-cloudflare-ips.sh`  |
| `cloudflare-ips.service`    | `/etc/systemd/system/cloudflare-ips.service` |
| `cloudflare-ips.timer`      | `/etc/systemd/system/cloudflare-ips.timer`   |

The two files the script generates — `/etc/nginx/conf.d/cloudflare.conf` and
`/etc/nginx/snippets/cloudflare-realip.conf` — are not copied here, because
they are derived and would go stale in git faster than on the host.

## Why the origin refuses non-Cloudflare traffic

The app charges its per-IP cold-score limit against `CF-Connecting-IP`
(`TRUSTED_CLIENT_IP_HEADER`). That header is only trustworthy because
Cloudflare overwrites whatever the caller sent — so anyone who found the origin
address could connect to it directly, send the header themselves, and take an
unlimited number of cold scores off the GitHub budget. The allowlist is what
makes the header's guarantee hold, not just a DDoS shield.

Two pieces do it, and they read the address differently on purpose:

- `real_ip` rewrites `$remote_addr` from `CF-Connecting-IP`, so logs and
  `X-Real-IP` carry the visitor rather than a Cloudflare edge.
- `$from_cloudflare` is keyed on **`$realip_remote_addr`** — the address that
  actually opened the socket, before that rewrite. Keying it on `$remote_addr`
  would allowlist visitors instead of Cloudflare, which is the whole point
  inverted.

## Keeping the list current

Cloudflare adds ranges occasionally, and a stale allowlist returns 403 to real
people. `cloudflare-ips.timer` runs weekly; the script re-fetches, refuses to
install an implausibly short list, runs `nginx -t` before reloading, and exits
without touching anything when nothing changed.

```bash
systemctl start cloudflare-ips.service   # run it now
journalctl -u cloudflare-ips.service     # what it did
```

## Verifying it after a change

```bash
# Through Cloudflare — expect 200.
curl -s -o /dev/null -w '%{http_code}\n' https://gitcheckup.com/

# Straight at the origin — expect 403, including with a forged header.
curl -sk -o /dev/null -w '%{http_code}\n' --resolve gitcheckup.com:443:ORIGIN_IP \
  -H 'CF-Connecting-IP: 1.2.3.4' https://gitcheckup.com/

# nginx should log the visitor's address, not 172.6x / 104.x / 162.x.
tail -1 /var/log/nginx/access.log
```

Certificate renewal is unaffected — the port-80 server block is not restricted,
and `certbot renew --dry-run` passes for both vhosts. Re-run it after any
change here.

## What is deliberately absent

`snippets/security-headers.conf` is **not** included in the vhost. Its CSP sets
`script-src 'self'` with no `'unsafe-inline'`, and browsers enforce the
intersection of multiple CSP headers — including it would override the app's
own policy, block Next's inline hydration script, and leave a page that returns
200 and does nothing. The app ships its own headers from `next.config.ts`.
