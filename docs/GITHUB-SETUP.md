# GitHub Setup - Adding a Second Remote

## Step 1: Create New Repository on GitHub

1. Go to: https://github.com/new
2. Enter repository name: `tensionai-mcp`
3. Choose visibility: **Public** or **Private**
4. **DO NOT** initialize with README, .gitignore, or license (we already have them)
5. Click "Create repository"

## Step 2: Note Your New Repo URL

After creating, GitHub will show a page with the repo URL. It will look like:
- `https://github.com/YOUR-USERNAME/tensionai-mcp.git`
- OR `git@github.com:YOUR-USERNAME/tensionai-mcp.git`

Copy this URL - you'll need it for the next step.

---

## Step 3: Add Second Remote and Push

In your terminal, run these commands from your project folder:

```bash
# Navigate to your project
cd "e:/Dropbox/DrKim/cursor/Cursor Projects/tensionai-mcp"

# Add the new remote (replace YOUR-NEW-URL with the URL from Step 2)
git remote add origin-v2 YOUR-NEW-URL

# Example:
# git remote add origin-v2 https://github.com/new-account/tensionai-mcp.git

# Stage all files
git add .

# Commit with message
git commit -m "Initial commit: TensionAI-MCP with custom commercial license"

# Push to the new remote (using origin-v2 to avoid conflict with any existing remote)
git push -u origin-v2 main
```

---

## Step 4: Verify

After pushing, visit your new GitHub repo URL to confirm all files are uploaded:
- LICENSE
- README.md
- All source code
- docs/SETUP-GUIDE.md

---

## Troubleshooting

**If you already have an "origin" remote:**
```bash
# Check current remotes
git remote -v

# If origin is already pointing to your current account, 
# just use a different name like "github" or "new-origin"
git remote add github YOUR-NEW-URL
git push -u github main
```

**If you get a permission error:**
- Make sure you're logged into the correct GitHub account in your browser
- Or you may need to set up SSH keys or a Personal Access Token

---

## Summary

1. Create repo on GitHub (don't initialize anything)
2. Copy the repo URL
3. Run: `git remote add origin-v2 <YOUR-URL>`
4. Run: `git push -u origin-v2 main`