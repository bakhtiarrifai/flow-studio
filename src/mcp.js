#!/usr/bin/env node
// MCP entry point, over stdio. `npm run register` adds it to the assistants installed on this computer.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Studio, shapes } from "./core.js";
import { ownerGone, remoteStudio, startServer } from "./server.js";

const local = new Studio();
const remote = remoteStudio();
let studio = local;
const claim = async () => {
  studio = (await startServer(local, { onHandover: () => (studio = remote) })) === "client" ? remote : local;
};
await claim();

// A client whose owner has exited takes the port itself instead of failing every call from then on.
async function call(operation, args) {
  try {
    return await studio[operation](args);
  } catch (err) {
    if (studio !== remote || !(await ownerGone())) throw err;
    await claim();
    return studio[operation](args);
  }
}

// name -> [operation, description]. set_key, outputs and discard are panel-only on purpose.
const TOOLS = {
  flow_status: ["status", "Check the Flow session: signed in, project open, plan, credits left, what is running. Also returns the working playbook. Call this first."],
  flow_generate: ["generate", "Queue stills (free) or video clips (credits) in Flow, one scene each, with optional start/end frames, references, an exact join to the previous clip, a camera preset and a per-scene credit limit. Returns job ids; collect results with flow_wait. Tell the user the expected credit total and get agreement before queueing video."],
  flow_wait: ["wait", "Wait for queued work and return file paths, credits and errors. Answers within about 40 s; call again until `finished` is true."],
  flow_cancel: ["cancel", "Cancel a job that has not started."],
  flow_retry: ["retry", "Queue failed or cancelled jobs again with the same settings and file names."],
  flow_assets: ["assets", "List the images, clips and scenes in the open Flow project. Their titles work as 'asset:<title>'."],
  flow_download: ["download", "Download something already in the Flow project without generating it again. Free, including the upscale."],
  flow_trash: ["trash", "Move one item in the Flow project to Flow's Trash (restorable there). Ask the user first."],
  flow_character: ["character", "Create a reusable character from a description or an image, with optional personality and stock voice. Free. Reference it in scenes as 'asset:<name>'."],
  flow_character_edit: ["character_edit", "Redraw an existing character in place (free), keeping its name, personality and voice; or just save its current portrait."],
  flow_characters: ["characters", "List the project's characters with the descriptions on record."],
  flow_restyle: ["restyle", "Change a clip that already exists (light, weather, background). Costs credits with no quote beforehand; ask the user first."],
  flow_techniques: ["techniques", "Camera moves, transitions and product/image presets to pass as a scene's `technique`."],
  flow_voices: ["voices", "Narrator voices available, and whether Google's are set up."],
  flow_narrate: ["narrate", "Record narration to a WAV file, free: Google AI Studio voices (with a style note) or a voice on this computer. Returns the duration, which tells you how much footage the film needs."],
  flow_cut: ["cut", "Join clips into one MP4 with optional narration and music, locally with FFmpeg. No credits."],
  flow_motion_plan: ["motion_plan", "Prepare motion control from a reference video: split it into short reference clips, grab the pose at each boundary and report shot changes. Local, no credits. The playbook's motion section gives the next steps."],
  flow_motion_info: ["motion_info", "Read the current motion plan, extracted poses, and segments for a project. Local, no credits."],
  flow_motion_transfer: ["motion_transfer", "True motion transfer with Kling Motion Control on kie.ai: one character image performs the movement of one reference video (3-30 s). Paid in dollars from the user's kie.ai balance, not Flow credits. Call with quote_only first, tell the user the estimate, and set confirmed only after they agree. Returns a job id for flow_wait."],
  flow_motion_join: ["motion_join", "Retime the clips made from a motion plan to the reference video's timing and join them, optionally with its sound. Local, no credits."],
};

const server = new McpServer({ name: "flow-studio", version: "0.1.0" });

for (const [name, [operation, description]] of Object.entries(TOOLS)) {
  server.registerTool(name, { description, inputSchema: shapes[operation] }, async (args) => {
    try {
      const result = await call(operation, args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
    }
  });
}

await server.connect(new StdioServerTransport());
