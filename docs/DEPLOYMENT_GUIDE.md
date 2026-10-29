# Deployment & Operations Guide (Railway)

## 1. Prerequisites

- A [Railway](https://railway.app) account.
- A GitHub account and repository.
- A standard Gmail account with 2-Step Verification enabled.

---

## 2. Environment Variables Specification

Configure the following variables in the Railway Dashboard under your service's **Variables** tab:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port Railway routes traffic to (default provided by Railway). |
| `NODE_ENV` | `production` | Enables production optimizations. |
| `APP_BASE_URL` | `https://your-app.up.railway.app` | Base public domain used in Magic Link email URLs. |
| `DATABASE_PATH` | `/data/auction.db` | Absolute path to the SQLite file mounted on Railway Volume. |
| `SESSION_SECRET` | `a_very_long_secure_random_string` | Secret key used for signing session cookies. |
| `GMAIL_USER` | `yourname@gmail.com` | Gmail address sending automated auction invites. |
| `GMAIL_APP_PASSWORD` | `abcd efgh ijkl mnop` | 16-character Google App Password (not your Gmail login password). |

---

## 3. Persistent Volume Setup on Railway (Crucial for SQLite & PDFs)

Because Railway containers have ephemeral filesystems on restart, you must attach a **Volume** to persist your database file and generated PDF reports:
1. In your Railway Project view, click **+ New** $\rightarrow$ **Volume**.
2. Mount the volume to your backend service at the mount path: `/data`.
3. Set your environment variable: `DATABASE_PATH=/data/auction.db`.
4. Now, your SQLite database and all generated auction PDFs will survive code deployments and container restarts permanently.

---

## 4. Setting up Gmail App Password (₹0 Email Setup)

To send 20–30 invite emails per auction with zero paid APIs:
1. Go to your **Google Account** $\rightarrow$ **Security**.
2. Ensure **2-Step Verification** is turned **ON**.
3. Search for **App Passwords** (or visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Create a new App Password named `AuctionMailer`.
5. Copy the 16-character string into your `GMAIL_APP_PASSWORD` environment variable.

---

## 5. Git Commands: Initialize and Push to GitHub

Run these commands in PowerShell or your terminal inside `e:\Projects\BiddingSite` to create and push your GitHub repository:

```bash
# 1. Navigate to the project folder
cd e:\Projects\BiddingSite

# 2. Initialize a new git repository
git init

# 3. Create a standard .gitignore file to exclude local data and node_modules
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "*.sqlite" >> .gitignore
echo "*.sqlite-journal" >> .gitignore
echo "dist/" >> .gitignore
echo "storage/reports/*.pdf" >> .gitignore

# 4. Stage all documents and configuration
git add .

# 5. Commit the initial blueprint
git commit -m "Initial commit: Architecture, specifications, and documentation"

# 6. Rename default branch to main
git branch -M main

# 7. Link to your GitHub repository (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 8. Push to GitHub
git push -u origin main
```

---

## 6. Continuous Deployment Workflow

1. Connect your Railway project directly to your GitHub repository (`YOUR_USERNAME/YOUR_REPO_NAME`).
2. Railway will automatically detect `package.json` and deploy every time you run `git push origin main`.
3. Persistent WebSockets for Socket.io are handled automatically on Railway without additional proxy configuration.

