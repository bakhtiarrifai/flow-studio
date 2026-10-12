# Flow Studio

Drive Google Flow (flow.google.com) from Claude Code, or from a local control panel, using the Flow credits your
Google account already has. A small program on this computer opens its own browser window, uses the session you
signed in to, and clicks Flow's real buttons.

```
Claude Code ──stdio──> flow-studio ──DevTools protocol──> browser (own profile) ──> Flow
```

Modelled on Guney Topcu's Flow Studio (github.com/GTAI-1/flow-mcp), rewritten for this machine: plain JavaScript with
no build step, Linux first, and any Chromium-family browser (Chrome, Chromium, Edge, Brave).

## Setup

```bash
npm install
npm run login      # opens the browser: sign in to Google, open or create a Flow project, leave the window open
claude mcp add --scope user flow -- node "$PWD/src/mcp.js"
```

Then, in Claude Code: *"Check Flow and tell me my credit balance."*

The control panel works without Claude:

```bash
npm run studio     # http://127.0.0.1:8791
```

Needs Node 22+, FFmpeg (cut, narration, exact joins), and a display that stays awake while it works.

## Working order

1. **Cast**: create each character once. Free.
2. **Frames**: draw the key stills. Free on Flow's default image model, so fix the look here.
3. **Voice**: record the narration early; its length says how much footage the film needs. Free.
4. **Shots**: turn stills into clips. Costs credits; Flow's own quote is read first and a shot over its
   `max_credits` is skipped.
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
| `flow_voices`, `flow_narrate` | Narration with Google AI Studio voices (free key) or espeak-ng / macOS `say` |
| `flow_cut` | Join clips with narration and music |

Files land in `~/flow-studio-out/<film>/`: `frame-NN` stills, `scene-NN` clips, `edit-NN` restyles, `clip-NN`
downloads. State (browser profile, key, token) lives in `~/.flow-studio/`.

## Google narration voices

Create a free key at aistudio.google.com/apikey and paste it into the panel's **Voice** tab. It is checked with
Google and stored in `~/.flow-studio/gemini-key`, readable only by you. Do not paste it into a chat. Without a key,
`engine: "local"` uses espeak-ng, which is robotic but fine for timing.

## Settings

`FLOW_STUDIO_BROWSER` (browser executable), `FLOW_STUDIO_PORT` (8791), `FLOW_STUDIO_CDP_PORT` (9344),
`FLOW_STUDIO_OUTPUT`, `FLOW_STUDIO_HOME`, `FLOW_STUDIO_PAUSE_MIN_S` / `FLOW_STUDIO_PAUSE_MAX_S` (25 / 70),
`GEMINI_API_KEY`, `FLOW_STUDIO_GEMINI_TTS` (text-to-speech model name).

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
