# Guest cards — 5.3.5

Create and save vocabulary cards without signing in or providing an OpenAI API key.
The guest card includes a translation, usage examples, grammar, word audio and an
optional image. Saved cards and review work locally; an account is only needed for sync.

The production guest allowance starts at 5 card attempts per installation, 20 per
network each UTC day and 100 per day for the service. New card requests are also
limited to 3 per network per minute and 10 per minute for the service. One card may
run per installation, one per network, and four for the service. These are attempt
limits: provider failures retain their reservation to prevent unlimited costly retries.

Admission is atomic in Postgres and shared across workers and restarts. Only HMAC
hashes of installation IDs and network prefixes are stored. IPv6 addresses within
the same /64 share the network allowance. Resetting local storage cannot bypass
network and global limits. Completed retries return the cached card without a new
AI request or credit. Rejected admission spends no credit and returns Retry-After;
the extension explains the limit and waits before enabling Create again.

Example audio has separate daily and minute limits. Images use the card allowance
and low-quality 1024×1024 JPEG generation. An image failure preserves the text card.

Deployed to production on 2026-10-05: schema `20261005_01`, backend `344a9ea`;
guest images enabled. All 63 server tests passed against an isolated PostgreSQL 18
database. TypeScript, the guest-client checks and the extension build passed.
An anonymous production request created a card with three examples, audio and a
JPEG image in 23.2 seconds; its cached retry spent no additional credit. Nginx
burst rejection (429 with Retry-After) and the 16 KB payload limit (413) were verified.
