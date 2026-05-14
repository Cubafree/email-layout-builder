#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy-to-github.sh
# Создаёт GitHub репо и пушит туда email-layout-builder
#
# Использование:
#   chmod +x deploy-to-github.sh
#   GH_TOKEN=ghp_xxx GH_USER=твой_ник ./deploy-to-github.sh
#
# Или интерактивно (скрипт спросит сам):
#   ./deploy-to-github.sh
# ─────────────────────────────────────────────────────────────

set -e

REPO_NAME="email-layout-builder"
REPO_DESC="Email layout assembly UI — CSV upload → Supabase queue → n8n → preview"

# ── Запрос токена/юзера если не в env ────────────────────────
if [ -z "$GH_TOKEN" ]; then
  read -rsp "GitHub Personal Access Token (repo scope): " GH_TOKEN
  echo
fi

if [ -z "$GH_USER" ]; then
  read -rp "GitHub username: " GH_USER
fi

echo "→ Создаём репо ${GH_USER}/${REPO_NAME}..."

# ── Создать репо через API ────────────────────────────────────
CREATE_RESP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"${REPO_NAME}\",\"description\":\"${REPO_DESC}\",\"private\":true,\"auto_init\":false}")

HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
BODY=$(echo "$CREATE_RESP" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo "✓ Репо создано: https://github.com/${GH_USER}/${REPO_NAME}"
elif [ "$HTTP_CODE" = "422" ]; then
  echo "⚠  Репо уже существует, продолжаем пуш..."
else
  echo "✗ Ошибка создания репо (HTTP ${HTTP_CODE}):"
  echo "$BODY"
  exit 1
fi

# ── Git init & push ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if [ ! -d ".git" ]; then
  git init -b main
  echo "✓ git init"
fi

git add -A
git diff --cached --quiet || git commit -m "feat: initial email-layout-builder"
echo "✓ commit готов"

REMOTE_URL="https://${GH_TOKEN}@github.com/${GH_USER}/${REPO_NAME}.git"

# Удалить старый origin если был
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

git push -u origin main
echo ""
echo "✅ Готово!"
echo "   Репо: https://github.com/${GH_USER}/${REPO_NAME}"
echo "   Railway: https://railway.app/new/github → выбери это репо"
