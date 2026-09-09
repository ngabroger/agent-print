#!/usr/bin/env bash
#
# Rilis satu langkah untuk Print Agent — auto-update via GitHub Releases.
#
#   scripts/release.sh [patch|minor|major|<versi eksplisit>]   (default: patch)
#
# Yang dilakukan berurutan:
#   1. cek prasyarat (git bersih, di branch utama, GH_TOKEN ada, gh CLI opsional)
#   2. npm version <bump>            -> naikkan versi + commit + tag vX.Y.Z
#   3. npm run release              -> build .exe + latest.yml + upload ke GitHub (draft)
#   4. git push && git push --tags  -> dorong commit + tag
#   5. publish draft release        -> lewat gh CLI kalau ada, kalau tidak: kasih link manual
#
# Jalankan dari root repo:  bash scripts/release.sh minor
#
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
MAIN_BRANCH="master"
REPO="ngabroger/agent-print"

c_red=$'\e[31m'; c_grn=$'\e[32m'; c_ylw=$'\e[33m'; c_dim=$'\e[2m'; c_rst=$'\e[0m'
step() { echo "${c_grn}▶${c_rst} $*"; }
warn() { echo "${c_ylw}!${c_rst} $*"; }
die()  { echo "${c_red}✗ $*${c_rst}" >&2; exit 1; }

# ── 1. prasyarat ──────────────────────────────────────────────────────────
step "Cek prasyarat"

[ -n "${GH_TOKEN:-}" ] || die "GH_TOKEN belum di-set. Jalankan:  export GH_TOKEN=ghp_xxx   (bash)  /  set GH_TOKEN=ghp_xxx  (cmd)"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Bukan di dalam repo git."

branch="$(git branch --show-current)"
if [ "$branch" != "$MAIN_BRANCH" ]; then
  warn "Kamu di branch '$branch', bukan '$MAIN_BRANCH'."
  read -r -p "Lanjut rilis dari '$branch'? [y/N] " ans
  [ "${ans,,}" = "y" ] || die "Dibatalkan."
fi

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "Working tree tidak bersih. Commit / stash dulu sebelum rilis."
fi

step "Ambil tag terbaru dari remote"
git fetch --tags --quiet origin || warn "git fetch gagal — lanjut dengan tag lokal."

HAVE_GH=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  HAVE_GH=1
  step "gh CLI terdeteksi & login — draft akan di-publish otomatis."
else
  warn "gh CLI tidak ada / belum login — draft harus di-publish manual di akhir."
fi

old_version="$(node -p "require('./package.json').version")"

# ── 2. bump versi ─────────────────────────────────────────────────────────
step "Naikkan versi (dari $old_version, bump: $BUMP)"
# npm version bikin commit + tag vX.Y.Z. --no-git-tag-version TIDAK dipakai: kita mau tag.
new_version_raw="$(npm version "$BUMP" -m "chore(release): v%s")"
new_version="${new_version_raw#v}"
tag="v$new_version"
step "Versi baru: $new_version  (tag $tag)"

# rollback helper kalau langkah berikutnya gagal
rollback() {
  warn "Gagal — membatalkan bump versi lokal…"
  git tag -d "$tag" >/dev/null 2>&1 || true
  git reset --hard HEAD~1 >/dev/null 2>&1 || true
  warn "Sudah di-rollback ke $old_version. Tidak ada yang ter-push."
}
trap rollback ERR

# ── 3. build + upload ─────────────────────────────────────────────────────
step "Build installer + upload ke GitHub Releases (draft)"
npm run release

# ── 4. push ───────────────────────────────────────────────────────────────
step "Push commit + tag ke origin"
git push origin "$branch"
git push origin "$tag"

trap - ERR  # mulai sini, rollback lokal tidak aman lagi (sudah ter-push)

# ── 5. publish draft ─────────────────────────────────────────────────────
if [ "$HAVE_GH" = "1" ]; then
  step "Publish release $tag"
  # electron-builder bikin draft dgn tag ini; jadikan non-draft + latest.
  gh release edit "$tag" --repo "$REPO" --draft=false --latest
  echo
  echo "${c_grn}✓ Rilis $new_version selesai & ter-publish.${c_rst}"
  gh release view "$tag" --repo "$REPO" --web >/dev/null 2>&1 || true
else
  echo
  echo "${c_grn}✓ Build ter-upload sebagai DRAFT.${c_rst}"
  echo "  Langkah terakhir (manual): buka link ini, Edit → Publish release:"
  echo "  ${c_dim}https://github.com/$REPO/releases${c_rst}"
fi

echo
echo "Pengguna akan dapat update ini dalam ≤ 6 jam (atau saat agent restart)."
