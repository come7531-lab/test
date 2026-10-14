# Agent instructions (Codex and other coding agents)

## 크레파스 마음 영상 (mind-story)
When asked for a "mind-story" / 크레파스 손그림 마음 영상 / "그 스타일로 영상":
1. Read and follow `.claude/skills/mind-story/SKILL.md` exactly, and `references/style-guide.md` before writing anything.
2. Scaffold with `sh .claude/skills/mind-story/scripts/new-film.sh <kebab-case-topic>`.
3. Requirements: Node 22+, ffmpeg, Chrome/Chromium (headless; the script writes a `--no-sandbox` wrapper at `out/chrome.sh`). Ask before installing anything.
4. Fonts: only the bundled Gaegu Bold (SIL OFL, licence in the template's `fonts/`). Never add fonts, images or music with unclear licences.
5. The approved example film is in `lester-levenson-wisdom/` (final video: `lester-levenson-wisdom/out/lester-levenson-wisdom.mp4`).
