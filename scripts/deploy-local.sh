#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Sven Würth
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Deploys this checkout into the Nextcloud on this machine (the fork's own deployment, not part of upstream):
#   1. refuses uncommitted changes (what runs must be in git),
#   2. runs the JS tests and builds,
#   3. copies the current app out of the container to $BACKUP_DIR,
#   4. replaces the app's files in custom_apps/tasks_board (a full copy, so removed files do not linger).
#
# Usage: make deploy-local   (or: scripts/deploy-local.sh)
# Settings (environment): NC_CONTAINER (nextcloud-app), NC_APP_DIR (/var/www/html/custom_apps/tasks_board),
# BACKUP_DIR (~/backups), ALLOW_DIRTY=1 to deploy uncommitted changes (not recommended).
set -euo pipefail

NC_CONTAINER="${NC_CONTAINER:-nextcloud-app}"
NC_APP_DIR="${NC_APP_DIR:-/var/www/html/custom_apps/tasks_board}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
APP_FILES=(appinfo lib templates img l10n css js CHANGELOG.md LICENSE)

cd "$(dirname "$0")/.."

if [[ -z "${ALLOW_DIRTY:-}" ]] && [[ -n "$(git status --porcelain -- . ':!js' ':!css')" ]]; then
	echo "Uncommitted changes: commit first (or ALLOW_DIRTY=1)." >&2
	git status --short -- . ':!js' ':!css' >&2
	exit 1
fi

echo "== tests"
npx vitest run --reporter=dot
echo "== build"
rm -rf js css/*.chunk.css css/tasks_board-*.css
npx vite build --mode production >/dev/null

version="$(grep -oP '(?<=<version>)[^<]+' appinfo/info.xml)"
commit="$(git rev-parse --short HEAD)${ALLOW_DIRTY:+-dirty}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
backup="$BACKUP_DIR/tasks_board-before-deploy-$stamp.tgz"

echo "== backup of the running app -> $backup"
docker exec "$NC_CONTAINER" tar czf - -C "$(dirname "$NC_APP_DIR")" "$(basename "$NC_APP_DIR")" > "$backup"

echo "== deploy $version ($commit) into $NC_CONTAINER:$NC_APP_DIR"
docker exec "$NC_CONTAINER" sh -c "rm -rf '$NC_APP_DIR'.new && mkdir -p '$NC_APP_DIR'.new"
tar czf - "${APP_FILES[@]}" | docker exec -i "$NC_CONTAINER" tar xzf - -C "$NC_APP_DIR.new"
printf '%s\n' "$commit" | docker exec -i "$NC_CONTAINER" sh -c "cat > '$NC_APP_DIR.new/DEPLOYED_COMMIT'"
docker exec "$NC_CONTAINER" sh -c "chown -R www-data:www-data '$NC_APP_DIR.new' && rm -rf '$NC_APP_DIR'.old && mv '$NC_APP_DIR' '$NC_APP_DIR'.old && mv '$NC_APP_DIR'.new '$NC_APP_DIR' && rm -rf '$NC_APP_DIR'.old"

echo "Deployed tasks_board $version ($commit). Reload the browser with Ctrl+Shift+R."
echo "Undo: docker exec -i $NC_CONTAINER tar xzf - -C $(dirname "$NC_APP_DIR") < $backup"
