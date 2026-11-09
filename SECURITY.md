# Security and privacy

River processes browser readings and selected-window captures locally. It has no analytics, cloud OCR or remote account integration.

- The browser bridge binds to `127.0.0.1`, checks origins, and requires an app-session token tied to one extension ID.
- Electron renderers run with isolation and sandboxing. Only the main workspace can request capture or OCR.
- Window IDs must come from the app’s source picker. Regions are bounded and validated again in the main process.
- OCR screenshots are written to a private temporary folder for the native helper and removed after success or failure. A process or OS crash can leave temporary files until the OS cleans them; do not capture sensitive windows unnecessarily.
- Saved map exports contain coordinates and roles, not screenshots or recognised text. Browser history and player observations stay in local app storage.
- Automatic play is client-specific, user-started and bounded. OCR mode does not send clicks or enter bets.

For a suspected security issue, use GitHub’s private vulnerability reporting for this repository if enabled. Otherwise contact the maintainer through the contact options on the `kerol-dev` GitHub profile. Do not publish a token, exploit against a live account, private screenshot or personal session in a public issue.

The project is a development release. A signed and notarized public binary, broader client testing and a dedicated security review are still required before representing it as production-certified software.
