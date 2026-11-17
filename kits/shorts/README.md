# Shorts kit: series of 9:16 shorts from Flow Studio

**[Bahasa Indonesia](#bahasa-indonesia)** · **[English](#english)**

## Bahasa Indonesia

Cara seri 8 episode *Sirah Nabawiyah untuk anak* (YouTube Shorts 33 detik) dibuat dengan Flow Studio, beserta skrip
lokal yang menyelesaikan setiap episode tanpa kredit. Flow Studio membuat still, klip, dan narasi; kit ini membuat
cover, judul, campuran backsound, subtitle, serta ekspor 360p / 1080p.

| File | Fungsinya |
|---|---|
| `build_ep.sh` | Satu episode: cover 1 detik dengan zoom dan kartu judul, 4 klip, narasi, backsound dengan ducking, subtitle dibakar ke video. `RES=360` (bawaan) atau `RES=1080` |
| `title_overlay.py` | Kartu judul: Comfortaa Bold, dipecah 2–3 baris seimbang, sebesar yang muat, baris terakhir kuning hangat, dengan gradasi gelap lembut di belakangnya. Juga membuat thumbnail |
| `backsound.py` | Membuat latar ambient Timur Tengah yang bisa diulang (drone D Hijaz, petikan mirip oud, duff lembut). Tanpa sampel, tanpa API |

### Folder film

`build_ep.sh <film> "<judul>"` membaca `$FLOW_STUDIO_OUTPUT/<film>/` (bawaan `~/flow-studio-out/<film>/`):

```
cover.jpg            still 9:16 untuk detik pertama dan thumbnail
scene-01..04.mp4     klip untuk build 360p
hd-01..04.mp4        klip upscale untuk build 1080p
vo_id.wav            narasi
subs/en.srt          subtitle dengan waktu dari film jadi 33 detik (detik cover ikut dihitung)
```

dan menulis `exports_360p/<film>_360p.mp4` atau `exports_1080p/<film>_1080p.mp4`, masing-masing dengan
`<film>_thumbnail.png`.

### Urutan kerja per episode

1. **Storyboard** (`flow_storyboard`): naskah, cast, dan per scene prompt still (`frame_prompt`) serta prompt gerak.
   Simpan aturan visual seri di `style`.
2. **Cast**: satu portrait seluruh badan per karakter (`flow_character`, atau still gratis). Pakai file portrait yang
   tersimpan sebagai `reference_images` di setiap still karakter itu; itulah yang menjaga wajah tetap konsisten.
3. **Still, gratis**: 4 keyframe scene + 1 cover per episode di Nano Banana, 9:16. Periksa sebelum membuat video.
   Perbaiki anakronisme di tahap ini (pernah ada sahabat abad ke-7 yang memakai baju zirah pelat Eropa).
4. **Klip, 8 kredit per klip**: Omni Flash dengan `economy: "draft"` (360p, 8 detik) dari setiap still sebagai
   `first_frame`. Jangan isi `duration` untuk Omni Flash 360p: tidak ada pilihan durasi, selalu 8 detik.
5. **Narasi, gratis**: `flow_narrate` (suara `Leda` cocok untuk narator anak). Targetkan ~32 detik. Naskah yang dibaca
   lebih dari ~37 detik terdengar terburu-buru kalau dipercepat; rekam ulang dengan style seperti *"very quick and
   energetic, almost no pauses"* (cara ini menurunkan 42 detik menjadi 32 detik, tetap natural).
6. **Subtitle**: tulis `subs/en.srt` dalam 5 cue (0–5, 5–12, 12–19,5, 19,5–26,5, 26,5–33 detik cocok untuk 4 scene).
   Tulis "(PBUH)", bukan "ﷺ": ligatur itu tampil sebagai kotak kosong di font subtitle.
7. **Backsound**: `python3 backsound.py ~/flow-studio-out/audio_bg/islamic_oud_duff_loop.wav`.
8. **Build**: `./build_ep.sh ep05_abu_umair "Abu Umair & His Little Sparrow"`, lalu cek frame di detik 0,7
   (cover/judul), satu subtitle, dan detik terakhir.
9. **1080p**: `flow_download` setiap klip dengan `quality: "upscaled"` sebagai `hd-0N`, lalu `RES=1080 ./build_ep.sh …`.
   Flow menaikkan klip 720p ke 1080p, tapi klip 360p hanya ke 720p; sisanya diselesaikan lanczos.

Biaya satu episode dengan cara ini: still gratis, 4 klip × 8 = **32 kredit**, sisanya lokal dan gratis.
Memakai ulang klip yang sudah ada di Flow (`flow_assets`, lalu `flow_download`) tidak memakai kredit.

### Pelajaran dari produksi

- **Anak-anak + filter keamanan Flow**: beberapa klip anak-anak kembali sebagai tile *Failed* ("might violate our
  policies about … minors"), dan kreditnya dikembalikan. Mengganti kata *"the boy"* di prompt gerak menjadi
  *"the animated character"* selalu berhasil.
- **Cek unduhan**: sebelum kit ini, satu batch unduhan yang terputus karena browser bermasalah membuat file tertukar
  nama (episode 8 kebagian klip episode 7). Sekarang Flow Studio melacak setiap unduhan lewat ID DevTools-nya. Tetap
  saja, setelah batch apa pun, bandingkan setiap `hd-0N` dengan `scene-0N`:
  `ffmpeg -ss 2 -i hd-01.mp4 -ss 2 -i scene-01.mp4 -filter_complex "[0:v]scale=180:320,format=gray[a];[1:v]scale=180:320,format=gray[b];[a][b]ssim" -frames:v 1 -f null -`
  Klip yang sama bernilai ≥ 0,96; klip yang berbeda sekitar 0,1.
- **Level backsound**: backsound di volume 0,12 berada 14 dB di bawah narasi dan drone rendahnya tidak terdengar di HP.
  Campurannya sekarang memakai volume 0,6 dengan sidechain ducking lembut (threshold 0,10, ratio 2): backsound ≈ −25 dB
  di bawah narasi ≈ −19 dB. Ducking kuat (threshold 0,03, ratio 4) membuatnya tenggelam lagi di −34 dB.
- **Ukuran kartu judul**: jaga blok judul di bawah ~21 % tinggi layar supaya tidak menutupi wajah di bagian atas
  cover; skripnya memilih 2–3 baris dan menghindari baris berisi satu kata.
- **Cek fakta spec**: spec episode 8 menyebut Abdullah bin Zubair sebagai anak yang membawa kabar ke Gua Tsur, padahal
  ia lahir sesudah Hijrah; naratornya diganti menjadi Abdullah bin Abi Bakar. Periksa nama dan tanggal dalam naskah
  sejarah sebelum merekam.

---

## English

How the 8-episode *Sirah Nabawiyah for kids* series (33 s YouTube Shorts) was made with Flow Studio, and the local
scripts that finish each episode for no credits. Flow Studio makes the stills, clips and narration; this kit makes the
cover, titles, backsound mix, subtitles and the 360p / 1080p exports.

| File | What it does |
|---|---|
| `build_ep.sh` | One episode: 1 s zoom-in cover with title card, 4 clips, narration, ducked backsound, burned-in subtitles. `RES=360` (default) or `RES=1080` |
| `title_overlay.py` | Title card: Comfortaa Bold, wrapped over 2–3 balanced lines, as large as fits, last line in warm yellow, soft dark gradient behind it. Also writes the thumbnail |
| `backsound.py` | Generates a loopable Middle-Eastern ambient bed (D Hijaz drone, oud-like plucks, soft duff). No samples, no API |

### Film folder

`build_ep.sh <film> "<title>"` reads `$FLOW_STUDIO_OUTPUT/<film>/` (default `~/flow-studio-out/<film>/`):

```
cover.jpg            9:16 still for the first second and the thumbnail
scene-01..04.mp4     clips for the 360p build
hd-01..04.mp4        upscaled clips for the 1080p build
vo_id.wav            narration
subs/en.srt          subtitles timed on the finished 33 s film (cover second included)
```

and writes `exports_360p/<film>_360p.mp4` or `exports_1080p/<film>_1080p.mp4`, each with `<film>_thumbnail.png`.

### Working order per episode

1. **Storyboard** (`flow_storyboard`): script, cast, and per scene the still prompt (`frame_prompt`) and the motion
   prompt. Keep the series' visual rule in `style`.
2. **Cast**: one full-body portrait per character (`flow_character`, or a free still). Use the saved portrait file
   as `reference_images` for every still of that character; that is what keeps faces consistent across scenes.
3. **Stills, free**: 4 scene keyframes + 1 cover per episode on Nano Banana, 9:16. Check them before any video.
   Fix anachronisms here (one take put a 7th-century companion in European plate armour).
4. **Clips, 8 credits each**: Omni Flash with `economy: "draft"` (360p, 8 s) from each still as `first_frame`.
   Do not pass `duration` for Omni Flash at 360p: it has no length choice and is always 8 s.
5. **Narration, free**: `flow_narrate` (voice `Leda` fits a child narrator). Aim for ~32 s. A script that reads
   longer than ~37 s sounds rushed when sped up; record it again with a style like *"very quick and energetic,
   almost no pauses"* instead (that brought 42 s down to 32 s, still natural).
6. **Subtitles**: write `subs/en.srt` in 5 cues (0–5, 5–12, 12–19.5, 19.5–26.5, 26.5–33 s works for 4 scenes).
   Write "(PBUH)" rather than "ﷺ": the ligature renders as an empty box in the burned-in subtitle font.
7. **Backsound**: `python3 backsound.py ~/flow-studio-out/audio_bg/islamic_oud_duff_loop.wav`.
8. **Build**: `./build_ep.sh ep05_abu_umair "Abu Umair & His Little Sparrow"`, then check frames at 0.7 s
   (cover/title), a subtitle and the last second.
9. **1080p**: `flow_download` each clip with `quality: "upscaled"` as `hd-0N`, then `RES=1080 ./build_ep.sh …`.
   Flow upscales a 720p clip to 1080p but a 360p clip only to 720p; lanczos covers the rest.

Cost of one episode this way: stills free, 4 clips × 8 = **32 credits**, everything else local and free.
Reusing clips that already exist in Flow (`flow_assets`, then `flow_download`) costs nothing.

### Lessons from production

- **Children + Flow's safety filter**: some clips of children came back as a *Failed* tile ("might violate our
  policies about … minors"), refunded. Rewording the motion prompt to say *"the animated character"* instead of
  *"the boy"* went through every time.
- **Verify downloads**: before this kit, a batch of downloads interrupted by a browser hiccup shifted files onto the
  wrong names (episode 8 got episode 7's clips). Flow Studio now tracks each download by its DevTools id. Still, after
  any batch, compare each `hd-0N` with `scene-0N`:
  `ffmpeg -ss 2 -i hd-01.mp4 -ss 2 -i scene-01.mp4 -filter_complex "[0:v]scale=180:320,format=gray[a];[1:v]scale=180:320,format=gray[b];[a][b]ssim" -frames:v 1 -f null -`
  The same clip scores ≥ 0.96; a different clip scored ~0.1.
- **Backsound level**: a bed at volume 0.12 sat 14 dB under the narration and its low drone was inaudible on phones.
  The mix now uses volume 0.6 with gentle sidechain ducking (threshold 0.10, ratio 2): bed ≈ −25 dB under a narration
  of ≈ −19 dB. Strong ducking (threshold 0.03, ratio 4) buried it again at −34 dB.
- **Title card size**: keep the title block within ~21 % of the height so it never covers a face near the top of the
  cover; the script picks 2–3 lines and avoids one-word orphan lines.
- **Fact-check the spec**: the episode 8 spec named Abdullah bin Zubair as the boy carrying news to Cave Thawr, but
  he was born after the Hijrah; the narrator was changed to Abdullah bin Abi Bakr. Check names and dates of a
  historical script before recording.
