#!/bin/sh
# Scaffold a new crayon wisdom film from the approved template.
#   sh .claude/skills/mind-story/scripts/new-film.sh <target-dir>
# Also writes a Chromium wrapper (headless Chrome must run with --no-sandbox as root in cloud sessions).
set -e
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$1"
[ -n "$TARGET" ] || { echo "usage: new-film.sh <target-dir>"; exit 1; }
[ -e "$TARGET" ] && { echo "$TARGET already exists"; exit 1; }
cp -r "$SKILL_DIR/template" "$TARGET"
mkdir -p "$TARGET/out"
# keep the big working files (frames, stems, video.mp4) out of git; only the final film is kept
# (written here because hidden files can be dropped when the skill is uploaded as a zip)
printf 'out/*\n!out/*.mp4\nout/video.mp4\n' > "$TARGET/.gitignore"

CHROME=""
for c in "$CHROME_PATH" /opt/pw-browsers/chromium "$(command -v chromium 2>/dev/null)" "$(command -v google-chrome 2>/dev/null)" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -n "$c" ] && [ -x "$c" ] && { CHROME="$c"; break; }
done
if [ -n "$CHROME" ]; then
  printf '#!/bin/sh\nexec "%s" --no-sandbox "$@"\n' "$CHROME" > "$TARGET/out/chrome.sh"
  chmod +x "$TARGET/out/chrome.sh"
  echo "chrome: $CHROME  (use CHROME_PATH=$(cd "$TARGET" && pwd)/out/chrome.sh)"
else
  echo "✗ Chrome/Chromium not found — set CHROME_PATH"
fi
command -v ffmpeg >/dev/null && echo "✓ ffmpeg" || echo "✗ ffmpeg missing"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' && echo "✓ node $(node -v)" || echo "✗ need Node 22+"
echo "created $TARGET"
