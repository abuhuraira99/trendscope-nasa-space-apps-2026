# Team and ownership

| Member | Role | Owns | Branch prefix |
|---|---|---|---|
| Abu Huraira (@abuhuraira99) | Team lead, analysis, integration | `src/trendscope/analysis/`, `tests/analysis/`, `assets/` (except screenshots), final say on everything | `abu/` |
| Hafiz Muhammad Haris | Repository, docs, CI, deployment | `docs/` (except `docs/design/`), `tests/conftest.py`, `tests/fixtures/`, `tests/test_app.py`, `.github/workflows/`, `.github/ISSUE_TEMPLATE/`, PR template, `.pre-commit-config.yaml`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | `haris/` |
| Muhammad Zawar Khan | Data engineering | `src/trendscope/data/`, `tests/data/`, `data/demo/` | `zawar/` |
| Sania Shafiq | UI/UX and content | `app/`, `content/`, `docs/design/`, `.streamlit/config.toml`, `assets/screenshots/` | `sania/` |
| Muhammad Mohsin | Media and communications | Photos, video and social posts (shared in the team chat, outside the repo) | none |

## Rules

- Change files in the folders you own. If you need a change elsewhere, open an issue or ask the owner.
- `.github/CODEOWNERS`, dependencies in `pyproject.toml` and `requirements*.txt`, and repository
  settings are changed only by the team lead.
- Every pull request into `main` is reviewed and merged by the team lead.

## Schedule (Pakistan time)

| When | What |
|---|---|
| Sat 14 Nov, 09:00 | Kickoff call; tasks become GitHub issues |
| Sat 13:00, 18:00, 22:00 | Check-ins |
| Sun 15 Nov, 10:00 and 15:00 | Check-ins |
| Sun 15 Nov, 18:00 | Code freeze: last feature pull requests merged |
| Sun 15 Nov, before 23:59 | Project submitted |

## Communication

Day-to-day talk happens in the team WhatsApp group. Decisions that affect the code are written down as
GitHub issues so they are not lost.
