// Free narration: Google AI Studio text-to-speech (the same voice set Flow offers), or a voice already on this computer.
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { HOME, KEY_FILE } from "./config.js";
import { masterVoice } from "./media.js";

const exec = promisify(execFile);
const TTS_MODEL = process.env.FLOW_STUDIO_GEMINI_TTS ?? "gemini-2.5-flash-preview-tts";
const API = "https://generativelanguage.googleapis.com/v1beta/models";

export const GOOGLE_VOICES = Object.entries({
  Zephyr: "bright", Puck: "upbeat", Charon: "informative", Kore: "firm", Fenrir: "excitable", Leda: "youthful",
  Orus: "firm", Aoede: "breezy", Callirrhoe: "easy-going", Autonoe: "bright", Enceladus: "breathy", Iapetus: "clear",
  Umbriel: "easy-going", Algieba: "smooth", Despina: "smooth", Erinome: "clear", Algenib: "gravelly",
  Rasalgethi: "informative", Laomedeia: "upbeat", Achernar: "soft", Alnilam: "firm", Schedar: "even", Gacrux: "mature",
  Pulcherrima: "forward", Achird: "friendly", Zubenelgenubi: "casual", Vindemiatrix: "gentle", Sadachbia: "lively",
  Sadaltager: "knowledgeable", Sulafat: "warm",
}).map(([name, description]) => ({ name, description }));

export function googleKey() {
  const key = (process.env.GEMINI_API_KEY ?? (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8") : "")).trim();
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key) ? key : undefined;
}

// The key comes from the panel and goes straight to a file only this user can read; it never passes through a chat.
// Google is asked to accept it before anything is written, so a typo cannot replace a key that works.
export async function saveGoogleKey(raw) {
  const key = String(raw).trim();
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) throw new Error("That does not look like a Google AI Studio key. They start with AIza and are about 39 characters long.");
  const res = await fetch(`${API}?pageSize=1`, { headers: { "x-goog-api-key": key } }).catch(() => null);
  if (!res) throw new Error("Could not reach Google to check the key. Check the connection and try again.");
  if (!res.ok) throw new Error("Google did not accept that key. Copy it again from aistudio.google.com/apikey. Any key saved earlier is unchanged.");
  mkdirSync(HOME, { recursive: true });
  writeFileSync(KEY_FILE, key, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
  return { saved: true, ending: key.slice(-4) };
}

export async function speakWithGoogle(text, voice, target, style) {
  const key = googleKey();
  if (!key) {
    throw new Error(
      "No Google AI Studio key is saved. Create a free one at aistudio.google.com/apikey and paste it into Flow Studio (Voice tab), " +
        "or set GEMINI_API_KEY. Do not paste it into a chat. Meanwhile, engine \"local\" works without a key.",
    );
  }
  const res = await fetch(`${API}/${TTS_MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: style ? `Say ${style}: ${text}` : text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google text-to-speech refused this take (${res.status}): ${body.error?.message ?? "no detail given"}`);
  const audio = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!audio) throw new Error("Google returned no audio for this line.");
  // Raw signed 16-bit mono PCM; the sample rate is only stated in the mime type.
  const rate = Number(audio.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const pcm = target.replace(/\.\w+$/, "") + ".pcm";
  writeFileSync(pcm, Buffer.from(audio.data, "base64"));
  try {
    return await masterVoice(pcm, target, { rate });
  } finally {
    rmSync(pcm, { force: true });
  }
}

const PLATFORM = process.platform;

export const LOCAL_VOICE_HINT =
  PLATFORM === "darwin" ? "Add one in System Settings > Accessibility > Spoken Content" : PLATFORM === "win32" ? "Add one in Settings > Time & language > Speech" : "Install espeak-ng";

// Windows speaks through System.Speech. The text, voice and path travel in environment variables, so nothing is quoted
// into the script.
const SAPI = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ";
const powershell = (script, vars = {}) =>
  exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SAPI + script], { env: { ...process.env, ...vars }, maxBuffer: 4 * 1024 * 1024 });

// Voices installed on this computer: `say` on macOS, System.Speech on Windows, espeak-ng on Linux.
export async function localVoices() {
  if (PLATFORM === "darwin") {
    const { stdout } = await exec("say", ["-v", "?"], { maxBuffer: 4 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
    return stdout
      .split("\n")
      .map((l) => l.match(/^(.+?)\s{2,}(en_\w{2})\s+#/))
      .filter(Boolean)
      .map((m) => ({ name: m[1].trim(), description: `${m[2].replace("_", "-")} · macOS` }));
  }
  if (PLATFORM === "win32") {
    const { stdout } = await powershell("$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }").catch(() => ({ stdout: "" }));
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim().split("|"))
      .filter(([name, culture]) => name && culture)
      .map(([name, culture]) => ({ name, description: `${culture} · Windows` }));
  }
  const { stdout } = await exec("espeak-ng", ["--voices=en"]).catch(() => ({ stdout: "" }));
  return stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((cols) => cols.length >= 5)
    .map((cols) => ({ name: cols[1], description: `${cols[3].replace(/_/g, " ")} · espeak-ng (robotic, good for timing drafts)` }));
}

export async function speakLocally(text, voice, target) {
  const raw = target.replace(/\.\w+$/, "") + (PLATFORM === "darwin" ? ".raw.aiff" : ".raw.wav");
  try {
    if (PLATFORM === "darwin") await exec("say", ["-v", voice, "-r", "168", "-o", raw, text]);
    else if (PLATFORM === "win32") {
      await powershell("$s.SelectVoice($env:FLOW_STUDIO_VOICE); $s.SetOutputToWaveFile($env:FLOW_STUDIO_WAV); $s.Speak($env:FLOW_STUDIO_TEXT); $s.Dispose()", {
        FLOW_STUDIO_VOICE: voice,
        FLOW_STUDIO_WAV: raw,
        FLOW_STUDIO_TEXT: text,
      }).catch((err) => {
        throw new Error(`Windows speech failed: ${String(err.stderr ?? err).trim().slice(-300)}`);
      });
    } else {
      await exec("espeak-ng", ["-v", voice, "-s", "150", "-w", raw, text]).catch((err) => {
        throw new Error(err.code === "ENOENT" ? "No local voice engine found. Install espeak-ng, or use engine \"google\"." : `espeak-ng failed: ${err.stderr ?? err}`);
      });
    }
    return await masterVoice(raw, target);
  } finally {
    rmSync(raw, { force: true });
  }
}
