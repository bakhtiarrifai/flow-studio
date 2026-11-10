# Flow Studio

Drive Google Flow (flow.google.com) from Claude Code, Claude Desktop, Codex, Antigravity (`agy`) or Gemini CLI, or
from a local control panel, using the Flow credits your Google account already has. Runs on Linux, macOS and Windows.
A small program on this computer opens its own browser window, uses the session you signed in to, and clicks Flow's
real buttons.

```
assistant (Claude, Codex, agy, Gemini) ──stdio──> flow-studio ──DevTools protocol──> browser (own profile) ──> Flow
```

Modelled on Guney Topcu's Flow Studio (github.com/GTAI-1/flow-mcp), rewritten for this machine: plain JavaScript with
no build step and any Chromium-family browser (Chrome, Chromium, Edge, Brave).

## Setup

The same three commands on every system, in a terminal (PowerShell or Command Prompt on Windows):

```bash
npm install
npm run login      # opens the browser: sign in to Google, open or create a Flow project, leave the window open
npm run register   # adds the server to every assistant found on this computer
```

Then, in any of them: *"Check Flow and tell me my credit balance."*

`npm run register -- codex desktop` registers only the ones named: `claude`, `desktop`, `codex`, `agy`, `gemini`. It
uses absolute paths and each assistant's own command, which you can also type yourself:

| Assistant | Command |
|---|---|
| Claude Code | `claude mcp add --scope user flow -- node /path/to/flow-studio/src/mcp.js` |
| Codex | `codex mcp add flow -- node /path/to/flow-studio/src/mcp.js` |
| Antigravity | `agy mcp add flow node /path/to/flow-studio/src/mcp.js` |
| Gemini CLI | `gemini mcp add --scope user flow node /path/to/flow-studio/src/mcp.js` |

Claude Desktop has no such command. `register` adds a `flow` entry under `mcpServers` in its
`claude_desktop_config.json` and keeps the rest of the file; quit and reopen Claude Desktop afterwards. The chat
websites (claude.ai, ChatGPT, gemini.google.com) cannot start a program on your computer, so they cannot use this.

Several assistants can be open at once: the first one to start owns the queue and the panel, the others join it.

The control panel works without an assistant:

```bash
npm run studio     # http://127.0.0.1:8791
```

Needs Node 22+, FFmpeg (cut, narration, exact joins), and a display that stays awake while it works.

| | Linux | macOS | Windows |
|---|---|---|---|
| FFmpeg | `sudo dnf install ffmpeg` or `sudo apt install ffmpeg` | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |
| Local voice | espeak-ng | `say` (built in) | System.Speech (built in) |
| Browser found in | `PATH` | `/Applications`, `~/Applications` | Program Files, `%LOCALAPPDATA%` |

Linux is the system this is developed and tested on. The macOS and Windows paths are written to each system's
conventions but have not been run there yet; `FLOW_STUDIO_BROWSER` and `FLOW_STUDIO_FFMPEG` override discovery if
needed.

## Working order

1. **Cast**: create each character once. Free.
2. **Frames**: draw the key stills. Free on Flow's default image model, so fix the look here.
3. **Voice**: record the narration early; its length says how much footage the film needs. Free.
4. **Shots**: turn stills into clips. Costs credits; Flow's own quote is read first and a shot over its
   `max_credits` is skipped. To spend less, set `economy` (the panel's **Save credits**): `"draft"` uses
   Omni Flash at 360p and `"lite"` uses Veo 3.1 - Lite at 720p. For an 8-second clip Flow quoted 8 and 10 credits,
   against 20 on Veo 3.1 - Fast (November 2026).
5. **Cut**: join clips, narration and music with FFmpeg. Free.

Continuity between shots:

- `first_frame` + `last_frame`: the clip animates from one still to the other.
- `chain_previous` / `chain_from`: the clip opens on the real last frame of an earlier clip (an exact join).
- `reference_images: ["asset:<character>"]`: locks the character, not the surroundings.

Flow takes frames or references in one clip, never both.

## Tools

| Tool | What it does |
|---|---|
| `flow_status` | Signed in, project open, plan, credits, queue, and the working playbook |
| `flow_generate` | Queue stills or clips: frames, references, exact joins, presets, credit limit |
| `flow_wait` | Collect results; answers within about 40 s, call again until `finished` |
| `flow_cancel`, `flow_retry` | Drop a queued job; queue failed jobs again |
| `flow_assets`, `flow_download`, `flow_trash` | Browse the Flow project, re-download for free, move to Flow's Trash |
| `flow_character`, `flow_character_edit`, `flow_characters` | Create, redraw in place, list |
| `flow_restyle` | Change an existing clip. No quote beforehand; needs explicit confirmation |
| `flow_techniques` | 45 presets: camera moves, transitions, product and image looks |
| `flow_voices`, `flow_narrate` | Narration with Google AI Studio voices (free key) or a voice on this computer |
| `flow_cut` | Join clips with narration and music |
| `flow_motion_plan`, `flow_motion_join` | Motion control from a reference video: split it into poses and clips, then retime and join the results |
| `flow_motion_transfer` | True motion transfer with Kling Motion Control on kie.ai (paid from your kie.ai balance) |

Files land in `~/flow-studio-out/<film>/`: `frame-NN` stills, `scene-NN` clips, `edit-NN` restyles, `clip-NN`
downloads. State (browser profile, key, token) lives in `~/.flow-studio/`.

## Motion control

Puts one person's movement from a reference video onto your character, in the spirit of Kling Motion Control but built
from what Flow's composer is known to accept:

1. `flow_motion_plan` splits the video into segments of at most `segment_seconds` and saves the pose at each boundary
   in `<film>/motion/`. Free.
2. Draw your character in each pose with `flow_generate` stills, using the character and the pose as references. Free.
3. Make one clip per segment, from one still to the next, with `first_frame` and `last_frame`. Costs credits.
4. `flow_motion_join` retimes the clips to the source's timing and joins them. Free.

The stills pin the poses, but the movement between two poses is the model's own, so this follows the source less
closely than true motion transfer. Shorter segments follow it better and cost more. Use one continuous shot of one
person at moderate speed.

For an exact copy of the movement, `flow_motion_transfer` (the Motion tab's **Kling** section) sends one character
image and one reference video of 3 to 30 seconds to Kling Motion Control on [kie.ai](https://kie.ai). It is paid in
dollars from your kie.ai balance, billed per second of the reference video: about $0.063/s on Kling 2.6 and $0.11/s on
Kling 3.0 at 720p (November 2026). Ask for `quote_only` first; a transfer runs only with `confirmed` and within
`max_usd`. Save the API key in the Motion tab, or set `KIE_API_KEY`. It is checked with kie.ai and stored in
`~/.flow-studio/kie-key`. Uploads stay on kie.ai's storage for 24 hours.

## Google narration voices

Create a free key at aistudio.google.com/apikey and paste it into the panel's **Voice** tab. It is checked with
Google and stored in `~/.flow-studio/gemini-key`, readable only by you. Do not paste it into a chat. Without a key,
`engine: "local"` uses a voice on this computer (espeak-ng, `say` or System.Speech), which is fine for timing.

## Settings

`FLOW_STUDIO_BROWSER` (browser executable), `FLOW_STUDIO_FFMPEG` / `FLOW_STUDIO_FFPROBE`, `FLOW_STUDIO_PORT` (8791),
`FLOW_STUDIO_CDP_PORT` (9344),
`FLOW_STUDIO_OUTPUT`, `FLOW_STUDIO_HOME`, `FLOW_STUDIO_PAUSE_MIN_S` / `FLOW_STUDIO_PAUSE_MAX_S` (25 / 70),
`GEMINI_API_KEY`, `KIE_API_KEY`, `FLOW_STUDIO_GEMINI_TTS` (text-to-speech model name).

## When Flow changes

This automates a web page with no public interface, so it breaks when Google changes that page. Every control name
the driver relies on is in the `UI` table at the top of `src/flow.js`; that is the place to update.

## Not included

Compared with the original: Flow's Agent-mode bulk image batch (stills are queued one at a time here instead) and
continuing a clip with a character attached through Agent mode (use an exact join, or a character reference).

## Risk

Automated use may be against Google's terms of service. It runs one generation at a time at a person's pace and does
nothing to get around Flow's checks. Use it on your own account, at your own risk.

## License

MIT. See [LICENSE](LICENSE).
