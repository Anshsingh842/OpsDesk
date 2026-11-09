# Deploying OpsDesk to Render (Cloud Hosting Guide)

This guide explains how to deploy OpsDesk to Render's free web tier using the bundled `render.yaml`.

> [!IMPORTANT]
> **Honest Operational Notes on Render Free Tier:**
> 1. **Sleep / Spin-down**: The Render free tier spins down web services after 15 minutes of inactivity. When a new request arrives, it takes roughly 50-60 seconds to wake up.
> 2. **Ephemeral Disk**: The local filesystem on the free tier is ephemeral. Every time the instance restarts or wakes from sleep, any local disk changes are discarded. Because of this, OpsDesk operates in `CLOUD` mode on Render, automatically reseeding the 5 clean hackathon demo stories on boot (`SEED_ON_START=true`).
> 3. **Sandbox Verification**: This deployment was not deployed or tested directly on Render from within this local build sandbox.

---

## 3-Step Deployment Procedure

### Step 1: Push Repository to GitHub or GitLab
Push the OpsDesk project folder to a GitHub repository (Node.js 22 LTS or newer).

### Step 2: Connect Repository on Render
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** > **Blueprint**.
3. Select your GitHub repository.
4. Render will automatically parse `render.yaml` and configure the environment:
   - **Runtime**: Node
   - **Node Version**: 22 (via `.node-version`)
   - **Start Command**: `node server/index.js`
   - **Environment Variables**:
     - `IS_CLOUD=1`
     - `DEMO_MODE=true`
     - `SEED_ON_START=true`
     - `SESSION_SECRET` (auto-generated securely by Render)

### Step 3: Launch
Click **Apply**. Render will deploy the application and provide a public URL like:
`https://opsdesk-xxxx.onrender.com`

---

## Going Beyond Ephemeral Free Tier (Production Path)
For real enterprise deployment beyond the free hackathon demo:
1. Provision a managed PostgreSQL instance or persistent SQLite disk.
2. Configure external OIDC / SAML SSO IdP (Okta / Azure AD).
3. Connect external object storage (AWS S3 / Cloudflare R2) for archival attachments.
