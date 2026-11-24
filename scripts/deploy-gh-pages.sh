#!/usr/bin/env bash
# Build Foundy Flashcards for GitHub Pages and publish dist/ to the gh-pages
# branch. Usage: npm run deploy:gh-pages
set -euo pipefail

REPO_NAME="$(basename -s .git "$(git config --get remote.origin.url)")"
export BASE_PATH="/${REPO_NAME}/"
export VITE_SOURCE_URL="${VITE_SOURCE_URL:-$(git config --get remote.origin.url | sed 's/\.git$//')}"

npm run typecheck
npm test
npm run build

touch dist/.nojekyll
TMP="$(mktemp -d)"
cp -R dist/. "$TMP/"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" \
  commit -q -m "Deploy Foundy Flashcards ($(git -C "$OLDPWD" rev-parse --short HEAD))"
git push -q -f "$(git -C "$OLDPWD" config --get remote.origin.url)" gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "Published to the gh-pages branch."
