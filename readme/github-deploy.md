# GitHub Actions deploy

| Branch | Workflow | Live URL | PM2 process | Port |
|---|---|---|---|---|
| `master` | [Deploy to Testing](../.github/workflows/testing.yml) | https://attendance-test.bylinelms.com | `attendancetest-backend` | 3015 |
| `main` | [Deploy to Production](../.github/workflows/production.yml) | https://attendance.bylinelms.com | `attendance-backend` | 3011 |

Pushing `master` never restarts production. Pushing `main` never restarts the test process.

`.env` and `keys/` are **not** copied from GitHub. They already live on the server.

## Secrets to add

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Both workflows use the **same four secrets**. If testing on `master` already succeeds, you do **not** need new names for production.

| Secret name | Required | What to paste |
|---|---|---|
| `SSH_HOST` | Yes | Server hostname from cPanel → SSH Access (example: `az1-ss107.a2hosting.com`) |
| `SSH_PORT` | Yes | SSH port, usually `22` (or the custom port shown in cPanel) |
| `SSH_USER` | Yes | cPanel username (the folder under `/home/`, e.g. `bylinelm`) |
| `SSH_PRIVATE_KEY` | Yes | Full private key file contents, including the `BEGIN` / `END` lines |

### `SSH_PRIVATE_KEY` format

Paste the **entire** key, exactly:

```
-----BEGIN OPENSSH PRIVATE KEY-----
....
-----END OPENSSH PRIVATE KEY-----
```

Use the matching public key in cPanel → SSH Access → Authorize. The GitHub runner logs in as `SSH_USER@SSH_HOST`.

Do **not** add `SESSION_SECRET`, `MONGODB_URI`, or other app secrets to GitHub. Those stay in:

- `/home/bylinelm/attendance.bylinelms.com/backend/.env` (production)
- `/home/bylinelm/attendance-test.bylinelms.com/backend/.env` (test)
