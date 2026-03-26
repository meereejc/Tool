# ScriptMan

ScriptMan is a lightweight local-first script manager built with Tauri 2 +
React + TypeScript. The project is intentionally scoped to one main workflow:
configure local script directories, scan executable scripts, understand them
quickly, and run them with minimal friction.

Current product direction:

- Keep the app small, responsive, and easy to run
- Prefer local scanning, metadata reading, and direct execution
- Avoid growing into a large “all-in-one” platform
- Keep environment help lightweight: checks + suggested commands, not automatic installation

Explicitly out of the current mainline:

- AI metadata generation
- AI installation-command generation
- package/export flows
- a large settings surface
- complex themes or multi-step interaction systems

## Development

- Install dependencies:
  - `npm install`
- Run the frontend only:
  - `npm run dev`
- Build the frontend:
  - `npm run build`
- Run frontend tests:
  - `npm test`
- Check the Rust backend:
  - `export PATH="/opt/homebrew/opt/rustup/bin:$PATH" && cargo check --manifest-path src-tauri/Cargo.toml`
- Run Rust tests:
  - `export PATH="/opt/homebrew/opt/rustup/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml`
- Start the Tauri development flow:
  - `npm run tauri -- dev`

## Current App Behavior

- On first launch, if the saved config has no `watchPaths`, the app opens
  `OnboardingPage`.
- The onboarding flow lets you add or remove multiple watched directories and
  save them into local config.
- After at least one watch path is saved, the app switches to the workbench
  dashboard and reuses the saved config on the next launch.
- The dashboard keeps scanning manual:
  - `Start scan` / `Scan again`
  - configured count
  - pending-metadata count
  - saved watch path management
- The script workspace currently includes:
  - lightweight list filtering
  - lightweight sorting by path, name, or language
  - right-side inspector for script details
  - parameter input, environment checks, suggested install commands, run/stop,
    and streamed logs
- `PendingMeta` scripts can now be completed inside the inspector with a small
  local form. Saving writes a minimal `@sm` block back into the script header
  and refreshes the scan result.

## Scan Behavior

- The Rust backend exposes `scan_directories`.
- The command scans either:
  - explicit `paths` passed in the request, or
  - the saved `watchPaths` from config as fallback.
- Strict mode follows the project rules for Python / Shell / Node candidates.
- Loose mode falls back to extension-based inclusion for supported script
  extensions.
- The command returns:
  - `configuredScripts`
  - `pendingScripts`
  - `ignoredCount`
  - `errors`

## Config Storage

- Config is stored in the Tauri app config directory as `config.json`.
- With the current bundle identifier `com.scriptman.app`, the macOS path
  resolves to `~/Library/Application Support/com.scriptman.app/config.json`.
- The config file should only store non-sensitive settings used by the current
  lightweight product direction such as `watchPaths`, `defaultCwd`, and
  `scanLooseMode`.
- Some earlier placeholder config fields may still exist in code during the
  transition away from larger product plans. They should be treated as legacy,
  not as future roadmap commitments.

## Scan Verification Notes

- `@sm` parsing only reads the first 50 lines of a script.
- Only the first valid `@sm` block is parsed.
- Invalid single `@sm` lines are ignored without aborting the whole script.
- Manual verification of `scan_directories` through the running Tauri app is
  still limited by the current sandboxed environment.

## Near-Term Focus

- Keep startup and interactions fast
- Preserve the current thin `Tauri command + Rust core + lightweight React`
  boundary
- Limit future work to polish and maintenance, not new platform-scale modules

## Environment Notes

- In this environment, Rust is installed through Homebrew `rustup`, so
  `cargo`/`rustc` may require:
  `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`
- `npm run tauri -- dev` can fail in constrained or sandboxed environments if the Vite dev server cannot bind to its local port.
