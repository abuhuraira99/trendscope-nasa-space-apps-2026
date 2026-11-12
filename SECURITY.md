# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026/security/advisories/new)
instead. We aim to reply within 7 days.

## Secrets

TrendScope reads NASA Earthdata credentials from environment variables or a local `.env` file
(see `.env.example`). The `.env` file is git-ignored. If a credential is ever committed by mistake,
change the password on Earthdata at once and tell the team lead; deleting the commit is not enough.
