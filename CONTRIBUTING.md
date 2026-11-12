# Contributing to TrendScope

This guide covers how the TrendScope team works in this repository. It applies to every change,
including documentation.

## Ground rules

- `main` is protected. Nobody pushes to it directly. Every change arrives through a pull request that
  the team lead approves and CI passes.
- Each person works in the folders they own (see [docs/team.md](docs/team.md)). A pull request that edits
  another person's folder needs a reason in its description and is reviewed more strictly.
- Never commit secrets, passwords, API tokens or `.env` files. Never commit raw data downloads; they
  belong in `data/raw/`, which is git-ignored.
- Space Apps rules: no challenge work before **14 November 2026, 09:00 PKT**. Setup and learning are fine.

## One-time setup

1. Create a GitHub account if you do not have one and send your username to the team lead.
2. Accept the collaborator invitation from your email or from
   <https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026/invitations>.
3. Clone the repository and set up the environment as described in the [README](README.md#getting-started).
4. Tell Git who you are, if you have not done so before:

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

## Daily workflow

```bash
# 1. Start from the latest main
git switch main
git pull

# 2. Create your branch: <your-name>/<short-task-description>
git switch -c zawar/nasa-power-client

# 3. Work, then check your code
ruff check . --fix
ruff format .
pytest

# 4. Commit in small steps
git add src/trendscope/data/power.py tests/data/test_power.py
git commit -m "feat(data): add NASA POWER monthly client"

# 5. Push the branch and open a pull request
git push -u origin zawar/nasa-power-client
```

GitHub prints a link after the push. Open it, fill in the pull request template and request a review
from `@abuhuraira99`.

If `main` moved while you were working, update your branch before asking for review:

```bash
git switch main && git pull
git switch zawar/nasa-power-client
git merge main
```

## Branch names

`<name>/<task>` in lowercase with hyphens, for example `sania/sidebar-layout`, `haris/ci-cache`,
`zawar/gpm-client`. One branch per task. Delete the branch after it is merged.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|---|---|
| `feat:` | A new feature |
| `fix:` | A bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or fixing tests |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `chore:` | Tooling, dependencies, CI |

Add a scope when it helps: `feat(ui): add variable picker`, `fix(data): handle missing months`.

## Pull requests

- Keep each pull request focused on one task. Small pull requests get merged fast.
- Fill in every section of the template, including how you tested the change.
- Add screenshots for any visible UI change.
- CI must be green. Fix lint and test failures before asking for review.
- Reply to every review comment, then push the fixes to the same branch. The pull request updates itself.
- The team lead merges with **Squash and merge**, so `main` keeps one clean commit per pull request.

## Code style

- Python 3.12 or newer, formatted and linted with Ruff (settings in `pyproject.toml`).
- Type hints on public functions, and a docstring that says what the function returns.
- Tests live in `tests/`, mirroring the `src/` layout.

## Questions

Ask in the team WhatsApp group or open a GitHub issue with the `question` label.
