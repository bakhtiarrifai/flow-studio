# Flow Studio

**[Bahasa Indonesia](#bahasa-indonesia)** · **[English](#english)**

## Bahasa Indonesia

Kendalikan Google Flow (flow.google.com) dari Claude Code, Claude Desktop, Codex, Antigravity (`agy`) atau Gemini CLI,
atau dari panel kontrol lokal, memakai kredit Flow yang sudah ada di akun Google-mu. Jalan di Linux, macOS, dan Windows.
Program kecil di komputer ini membuka jendela browser sendiri, memakai sesi yang sudah kamu login-kan, lalu mengklik
tombol-tombol Flow yang asli.

```
asisten (Claude, Codex, agy, Gemini) ──stdio──> flow-studio ──DevTools protocol──> browser (profil sendiri) ──> Flow
```

Dibuat berdasarkan Flow Studio karya Guney Topcu (github.com/GTAI-1/flow-mcp), ditulis ulang untuk mesin ini:
JavaScript biasa tanpa langkah build, dan bisa memakai browser keluarga Chromium apa pun (Chrome, Chromium, Edge, Brave).

### Pemasangan

Tiga perintah yang sama di semua sistem, di terminal (PowerShell atau Command Prompt di Windows):

```bash
npm install
npm run login      # membuka browser: login Google, buka atau buat project Flow, biarkan jendelanya terbuka
npm run register   # mendaftarkan server ke semua asisten yang ada di komputer ini
```

Lalu, di asisten mana pun: *"Cek Flow dan beri tahu saldo kreditku."*

`npm run register -- codex desktop` hanya mendaftarkan yang disebut: `claude`, `desktop`, `codex`, `agy`, `gemini`.
Perintah ini memakai path absolut dan perintah bawaan tiap asisten, yang juga bisa kamu ketik sendiri:

| Asisten | Perintah |
|---|---|
| Claude Code | `claude mcp add --scope user flow -- node /path/to/flow-studio/src/mcp.js` |
| Codex | `codex mcp add flow -- node /path/to/flow-studio/src/mcp.js` |
| Antigravity | `agy mcp add flow node /path/to/flow-studio/src/mcp.js` |
| Gemini CLI | `gemini mcp add --scope user flow node /path/to/flow-studio/src/mcp.js` |

Claude Desktop tidak punya perintah seperti itu. `register` menambahkan entri `flow` di bawah `mcpServers` dalam
`claude_desktop_config.json` dan membiarkan isi file lainnya; tutup lalu buka lagi Claude Desktop sesudahnya. Situs
chat (claude.ai, ChatGPT, gemini.google.com) tidak bisa menjalankan program di komputermu, jadi tidak bisa memakai ini.

Beberapa asisten boleh terbuka bersamaan: yang pertama jalan memegang antrean dan panel, yang lain bergabung ke situ.

Panel kontrol bisa dipakai tanpa asisten:

```bash
npm run studio     # http://127.0.0.1:8791
```

Butuh Node 22+, FFmpeg (potong, narasi, sambungan presisi), dan layar yang tetap menyala selama bekerja.

| | Linux | macOS | Windows |
|---|---|---|---|
| FFmpeg | `sudo dnf install ffmpeg` atau `sudo apt install ffmpeg` | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |
| Suara lokal | espeak-ng | `say` (bawaan) | System.Speech (bawaan) |
| Browser dicari di | `PATH` | `/Applications`, `~/Applications` | Program Files, `%LOCALAPPDATA%` |

Program ini dikembangkan dan diuji di Linux. Path macOS dan Windows ditulis sesuai kebiasaan tiap sistem tapi belum
pernah dijalankan di sana; `FLOW_STUDIO_BROWSER` dan `FLOW_STUDIO_FFMPEG` bisa dipakai kalau pencarian otomatis gagal.

### Urutan kerja

1. **Cast**: buat setiap karakter sekali. Gratis.
2. **Frame**: gambar still utama. Gratis di model gambar bawaan Flow, jadi rapikan tampilannya di tahap ini.
3. **Suara**: rekam narasi lebih awal; durasinya menentukan berapa banyak footage yang dibutuhkan. Gratis.
4. **Shot**: ubah still jadi klip. Memakai kredit; harga dari Flow dibaca dulu dan shot yang melebihi `max_credits`
   dilewati. Supaya lebih hemat, set `economy` (tombol **Save credits** di panel): `"draft"` memakai Omni Flash 360p
   dan `"lite"` memakai Veo 3.1 - Lite 720p. Untuk klip 8 detik Flow mematok 8 dan 10 kredit, dibanding 20 di
   Veo 3.1 - Fast (November 2026).
5. **Cut**: gabungkan klip, narasi, dan musik dengan FFmpeg. Gratis.

Kesinambungan antar-shot:

- `first_frame` + `last_frame`: klip bergerak dari satu still ke still lainnya.
- `chain_previous` / `chain_from`: klip dimulai dari frame terakhir yang asli dari klip sebelumnya (sambungan presisi).
- `reference_images: ["asset:<karakter>"]`: mengunci karakter, bukan latarnya.

Flow menerima frame atau referensi dalam satu klip, tidak bisa keduanya.

### Tools

| Tool | Fungsinya |
|---|---|
| `flow_status` | Status login, project yang terbuka, paket, kredit, antrean, dan playbook kerja |
| `flow_generate` | Mengantrekan still atau klip: frame, referensi, sambungan presisi, preset, batas kredit |
| `flow_wait` | Mengambil hasil; menjawab dalam sekitar 40 dtk, panggil lagi sampai `finished` |
| `flow_cancel`, `flow_retry` | Membatalkan job yang masih antre; mengantrekan ulang job yang gagal |
| `flow_assets`, `flow_download`, `flow_trash` | Melihat isi project Flow, mengunduh ulang gratis, memindahkan ke Trash Flow |
| `flow_character`, `flow_character_edit`, `flow_characters` | Membuat, menggambar ulang di tempat, menampilkan daftar |
| `flow_restyle` | Mengubah klip yang sudah ada. Tanpa harga di muka; butuh konfirmasi eksplisit |
| `flow_techniques` | 45 preset: gerakan kamera, transisi, tampilan produk dan gambar |
| `flow_voices`, `flow_narrate` | Narasi dengan suara Google AI Studio (key gratis) atau suara di komputer ini |
| `flow_cut` | Menggabungkan klip dengan narasi dan musik |
| `flow_storyboard` | Rencana film di komputer ini: naskah, style atau `style_preset`, cast, lokasi, properti, dan per scene prompt (atau visual/motion/audio), aset tertaut, still, suara, dan pengaturan |
| `flow_resume` | Melanjutkan film dengan akun yang sedang login, hanya membuat scene yang belum punya klip |
| `flow_account` | Akun Google yang login dan kreditnya; membuka halaman Google untuk ganti akun |
| `flow_motion_plan`, `flow_motion_join` | Kendali gerak dari video referensi: memecahnya jadi pose dan klip, lalu menyesuaikan waktu dan menggabungkan hasilnya |
| `flow_motion_transfer` | Motion transfer sungguhan dengan Kling Motion Control di kie.ai (dibayar dari saldo kie.ai-mu) |

File disimpan di `~/flow-studio-out/<film>/`: still `frame-NN`, klip `scene-NN`, restyle `edit-NN`, unduhan `clip-NN`.
State (profil browser, key, token) disimpan di `~/.flow-studio/`.

### Membuat seri video pendek

`kits/shorts/` berisi skrip finishing lokal yang dipakai untuk seri 8 episode YouTube Shorts berdurasi 33 detik: cover
1 detik dengan zoom dan kartu judul, backsound dengan ducking, subtitle yang dibakar ke video, ekspor 360p dan 1080p,
serta pelajaran dari produksi (salah deteksi filter keamanan, cek unduhan, level suara). Lihat
[kits/shorts/README.md](kits/shorts/README.md).

### Storyboard dan ganti akun

Project Flow terikat ke satu akun Google dan tidak bisa dibagikan, jadi apa pun yang tersimpan di Flow tidak ikut
pindah ke akun lain. Flow Studio menyimpan rencana setiap film di `<film>/storyboard.json` (tab **Storyboard** di panel)
bersama still, klip, dan suaranya, lalu mengunggah dari sana setiap kali sebuah scene membutuhkannya.

Isi storyboard (semuanya opsional kecuali prompt atau visual tiap scene):

- **Aset:** `cast` (nama, gambar, `look`, `physical`, `clothing`, `backstory`, `voice`), `locations` (nama, gambar,
  deskripsi, `time_of_day`), dan `props` (nama, gambar, deskripsi).
- **Style:** teks `style` dan/atau `style_preset` (`3d-animation`, `claymation`, `concept-sketch`, `charcoal`); preset
  ditaruh lebih dulu, dan keduanya ditambahkan ke setiap prompt yang belum memuatnya.
- **Scene:** `title`, lalu satu `prompt` atau `visual` + `motion` + `audio`, yang digabung Flow Studio menjadi prompt.
  `assets` menautkan cast, lokasi, dan properti di shot itu: tiga pertama dikirim ke Flow sebagai referensi (kalau scene
  tidak punya frame) dan tampilan setiap karakter yang ditautkan ditulis ulang di prompt.

Storyboard lama yang hanya berisi `prompt`, `style`, dan `cast` tetap berjalan tanpa perubahan.

Saat kredit sebuah akun habis:

1. **Switch account** (header panel, atau `flow_account` dengan `switch`) membuka halaman akun Google di jendela Flow.
   Pilih atau tambahkan akun lain di sana.
2. **Resume production** (atau `flow_resume`) membuka project film itu di akun tersebut, membuat project bernama film
   itu kalau belum ada, menggambar still yang belum ada (gratis), dan hanya membuat scene yang belum punya klip.

Tidak ada yang perlu diunduh dulu: semua file sudah ada di komputer ini. Project yang dipakai di setiap akun dicatat di
storyboard.

### Kendali gerak (motion control)

Memindahkan gerakan satu orang dari video referensi ke karaktermu, mirip Kling Motion Control tapi dibangun dari apa
yang diketahui bisa diterima composer Flow:

1. `flow_motion_plan` memecah video menjadi segmen sepanjang maksimal `segment_seconds` dan menyimpan pose di setiap
   batasnya ke `<film>/motion/`. Gratis.
2. Gambar karaktermu di setiap pose dengan still `flow_generate`, memakai karakter dan pose itu sebagai referensi. Gratis.
3. Buat satu klip per segmen, dari satu still ke still berikutnya, dengan `first_frame` dan `last_frame`. Memakai kredit.
4. `flow_motion_join` menyesuaikan waktu klip dengan sumbernya lalu menggabungkannya. Gratis.

Still mengunci posenya, tapi gerakan di antara dua pose adalah buatan model sendiri, jadi hasilnya kurang persis
dibanding motion transfer sungguhan. Segmen yang lebih pendek lebih mirip tapi lebih mahal. Pakai satu shot utuh
berisi satu orang dengan kecepatan sedang.

Untuk salinan gerakan yang persis, `flow_motion_transfer` (bagian **Kling** di tab Motion) mengirim satu gambar karakter
dan satu video referensi 3 sampai 30 detik ke Kling Motion Control di [kie.ai](https://kie.ai). Biayanya dalam dolar
dari saldo kie.ai-mu, dihitung per detik video referensi: sekitar $0,063/dtk di Kling 2.6 dan $0,11/dtk di Kling 3.0
pada 720p (November 2026). Minta `quote_only` dulu; transfer hanya berjalan dengan `confirmed` dan dalam batas
`max_usd`. Simpan API key di tab Motion, atau set `KIE_API_KEY`. Key dicek ke kie.ai dan disimpan di
`~/.flow-studio/kie-key`. File yang diunggah tersimpan di storage kie.ai selama 24 jam.

### Suara narasi Google

Buat key gratis di aistudio.google.com/apikey lalu tempel di tab **Voice** pada panel. Key dicek ke Google dan disimpan
di `~/.flow-studio/gemini-key`, hanya bisa dibaca olehmu. Jangan tempel key itu di chat. Tanpa key,
`engine: "local"` memakai suara di komputer ini (espeak-ng, `say`, atau System.Speech), yang cukup untuk mengatur durasi.

### Pengaturan

`FLOW_STUDIO_BROWSER` (file browser), `FLOW_STUDIO_FFMPEG` / `FLOW_STUDIO_FFPROBE`, `FLOW_STUDIO_PORT` (8791),
`FLOW_STUDIO_CDP_PORT` (9344),
`FLOW_STUDIO_OUTPUT`, `FLOW_STUDIO_HOME`, `FLOW_STUDIO_PAUSE_MIN_S` / `FLOW_STUDIO_PAUSE_MAX_S` (25 / 70),
`GEMINI_API_KEY`, `KIE_API_KEY`, `FLOW_STUDIO_GEMINI_TTS` (nama model text-to-speech).

### Kalau Flow berubah

Program ini mengotomatiskan halaman web yang tidak punya antarmuka publik, jadi akan rusak saat Google mengubah halaman
itu. Semua nama kontrol yang diandalkan driver ada di tabel `UI` di bagian atas `src/flow.js`; di situlah yang perlu
diperbarui.

### Tidak disertakan

Dibanding versi aslinya: batch gambar massal mode Agent di Flow (di sini still diantrekan satu per satu) dan
melanjutkan klip dengan karakter terpasang lewat mode Agent (pakai sambungan presisi, atau referensi karakter).

### Risiko

Penggunaan otomatis mungkin melanggar ketentuan layanan Google. Program ini menjalankan satu generate dalam satu waktu
dengan kecepatan manusia dan tidak mengakali pemeriksaan apa pun di Flow. Pakai di akunmu sendiri, dengan risiko
ditanggung sendiri.

### Lisensi

MIT. Lihat [LICENSE](LICENSE).

---

## English

Drive Google Flow (flow.google.com) from Claude Code, Claude Desktop, Codex, Antigravity (`agy`) or Gemini CLI, or
from a local control panel, using the Flow credits your Google account already has. Runs on Linux, macOS and Windows.
A small program on this computer opens its own browser window, uses the session you signed in to, and clicks Flow's
real buttons.

```
assistant (Claude, Codex, agy, Gemini) ──stdio──> flow-studio ──DevTools protocol──> browser (own profile) ──> Flow
```

Modelled on Guney Topcu's Flow Studio (github.com/GTAI-1/flow-mcp), rewritten for this machine: plain JavaScript with
no build step and any Chromium-family browser (Chrome, Chromium, Edge, Brave).

### Setup

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

### Working order

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

### Tools

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
| `flow_storyboard` | A film's plan on this computer: script, style or `style_preset`, cast, locations, props, and per scene the prompt (or visual/motion/audio), linked assets, still, voice and settings |
| `flow_resume` | Carry a film on with the account signed in now, making only the scenes that have no clip |
| `flow_account` | The signed-in Google account and its credits; opens Google's page to switch account |
| `flow_motion_plan`, `flow_motion_join` | Motion control from a reference video: split it into poses and clips, then retime and join the results |
| `flow_motion_transfer` | True motion transfer with Kling Motion Control on kie.ai (paid from your kie.ai balance) |

Files land in `~/flow-studio-out/<film>/`: `frame-NN` stills, `scene-NN` clips, `edit-NN` restyles, `clip-NN`
downloads. State (browser profile, key, token) lives in `~/.flow-studio/`.

### Making a series of shorts

`kits/shorts/` holds the local finishing scripts used for an 8-episode series of 33 s YouTube Shorts: a 1 s zoom-in
cover with a title card, ducked backsound, burned-in subtitles, 360p and 1080p exports, and the lessons learned
(safety-filter false positives, download checks, mix levels). See [kits/shorts/README.md](kits/shorts/README.md).

### Storyboard and switching accounts

A Flow project belongs to one Google account and cannot be shared, so nothing stored in Flow follows you to another
account. Flow Studio keeps each film's plan in `<film>/storyboard.json` (the panel's **Storyboard** tab) next to its
stills, clips and voices, and uploads from there whenever a scene needs them.

What a storyboard can hold (all optional except each scene's prompt or visual):

- **Assets:** `cast` (name, image, `look`, `physical`, `clothing`, `backstory`, `voice`), `locations` (name, image,
  description, `time_of_day`) and `props` (name, image, description).
- **Style:** `style` text and/or `style_preset` (`3d-animation`, `claymation`, `concept-sketch`, `charcoal`); the preset
  comes first, and both are added to every prompt that does not already contain them.
- **Scenes:** `title`, then either one `prompt` or `visual` + `motion` + `audio`, which Flow Studio joins into the
  prompt. `assets` links the cast, locations and props in the shot: the first three go to Flow as references (when the
  scene has no frame) and each linked character's look is restated in the prompt.

Older storyboards with just `prompt`, `style` and `cast` keep working unchanged.

When an account runs out of credits:

1. **Switch account** (panel header, or `flow_account` with `switch`) opens Google's account page in the Flow window.
   Pick or add the other account there.
2. **Resume production** (or `flow_resume`) opens the film's project on that account, creating one with the film's
   name if it has none, draws any missing stills (free), and makes only the scenes that have no clip yet.

Nothing has to be downloaded first: the files are already on this computer. The project used on each account is
remembered in the storyboard.

### Motion control

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

### Google narration voices

Create a free key at aistudio.google.com/apikey and paste it into the panel's **Voice** tab. It is checked with
Google and stored in `~/.flow-studio/gemini-key`, readable only by you. Do not paste it into a chat. Without a key,
`engine: "local"` uses a voice on this computer (espeak-ng, `say` or System.Speech), which is fine for timing.

### Settings

`FLOW_STUDIO_BROWSER` (browser executable), `FLOW_STUDIO_FFMPEG` / `FLOW_STUDIO_FFPROBE`, `FLOW_STUDIO_PORT` (8791),
`FLOW_STUDIO_CDP_PORT` (9344),
`FLOW_STUDIO_OUTPUT`, `FLOW_STUDIO_HOME`, `FLOW_STUDIO_PAUSE_MIN_S` / `FLOW_STUDIO_PAUSE_MAX_S` (25 / 70),
`GEMINI_API_KEY`, `KIE_API_KEY`, `FLOW_STUDIO_GEMINI_TTS` (text-to-speech model name).

### When Flow changes

This automates a web page with no public interface, so it breaks when Google changes that page. Every control name
the driver relies on is in the `UI` table at the top of `src/flow.js`; that is the place to update.

### Not included

Compared with the original: Flow's Agent-mode bulk image batch (stills are queued one at a time here instead) and
continuing a clip with a character attached through Agent mode (use an exact join, or a character reference).

### Risk

Automated use may be against Google's terms of service. It runs one generation at a time at a person's pace and does
nothing to get around Flow's checks. Use it on your own account, at your own risk.

### License

MIT. See [LICENSE](LICENSE).
