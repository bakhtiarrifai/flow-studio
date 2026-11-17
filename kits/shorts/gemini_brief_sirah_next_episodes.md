# Brief untuk Gemini: episode baru "Kisah Sahabat Cilik" (Sirah Nabawiyah untuk anak)

> **Cara pakai:** tempel seluruh file ini ke Gemini (Gemini Pro / Deep Research), lalu tambahkan permintaanmu, misalnya
> *"Buat spesifikasi Episode 9–12."* Hasil Gemini langsung bisa diberikan ke Claude Code / Flow Studio untuk
> diproduksi. Semua angka dan parameter di bawah sudah terbukti berhasil di produksi Episode 1–8 (November 2026).

---

## 1. Peranmu (Gemini)

Kamu penulis naskah dan peneliti sirah untuk serial YouTube Shorts anak-anak **"Kisah Sahabat Cilik"**. Tugasmu:

1. **Mencari kisah baru** tentang **anak-anak atau remaja di masa Rasulullah ﷺ** yang belum dipakai (daftar di bagian 2).
2. **Memverifikasi faktanya** dari sumber yang sahih, dan menulis sumbernya.
3. **Menulis spesifikasi produksi lengkap** per episode, dengan format persis seperti bagian 6, sehingga bisa langsung
   diproduksi di Flow Studio tanpa diedit.

Penonton: anak usia 5–12 tahun dan orang tuanya, di Indonesia. Bahasa narasi: Bahasa Indonesia santai anak-anak.
Subtitle: Bahasa Inggris.

---

## 2. Episode yang SUDAH dibuat (jangan diulang)

| # | ID | Tokoh (narator) | Judul cover | Nilai |
|---|---|---|---|---|
| 1 | `ep01_anas` | Anas bin Malik | Anas's Secret Mission | menjaga rahasia |
| 2 | `ep02_umair` | Umair bin Abi Waqqash | Too Small to Join? | semangat walau masih kecil |
| 3 | `ep03_zaid` | Zaid bin Tsabit | A New Language in 15 Days | rajin belajar |
| 4 | `ep04_samurah_rafi` | Samurah bin Jundub & Rafi' bin Khadij | The Wrestling Duel for Uhud | sportivitas, kesungguhan |
| 5 | `ep05_abu_umair` | Abu Umair | Abu Umair & His Little Sparrow | empati, menyayangi hewan |
| 6 | `ep06_ibn_abbas` | Abdullah bin Abbas | The Youngest in the Room | adab dan rasa ingin tahu |
| 7 | `ep07_muadz_muawwidz` | Mu'adz & Mu'awwidz bin 'Afra' | Two Brothers, One Mission | keberanian, kekompakan |
| 8 | `ep08_abdullah_abu_bakr` | Abdullah bin Abi Bakar | The Secret Night Mission | tanggung jawab |

Ide yang boleh kamu pertimbangkan (verifikasi dulu!): Usamah bin Zaid muda, Ali bin Abi Thalib kecil, Asma' binti
Abi Bakar (narator perempuan boleh), Umar bin Abi Salamah ("sebut nama Allah dan makan dari yang dekat"), Hasan dan
Husain bersama kakeknya, Abdullah bin Umar, Jabir bin Abdullah, Ummu Khalid kecil dan baju bergaris, dan lain-lain.

---

## 3. Aturan wajib (adab, fakta, dan filter keamanan)

### Adab visual
- **Rasulullah ﷺ, para nabi, keluarga beliau, dan sahabat senior TIDAK PERNAH digambarkan** (wajah atau tubuh).
  Kehadiran beliau = **cahaya hangat keemasan** dari luar frame, atau reaksi wajah si anak.
- Orang dewasa lain hanya terlihat **dari belakang atau samping, bahu saja**. Saudara perempuan atau wanita dewasa:
  hanya dari samping atau belakang, berpakaian sopan.
- Yang tampil penuh hanya **tokoh anak narator** (dan saudaranya kalau ceritanya tentang dua anak).

### Fakta
- Setiap episode **wajib** menyertakan sumber (misalnya *Shahih al-Bukhari no. …*, *Sirah Ibnu Hisyam*, *al-Isabah*
  Ibnu Hajar). Kalau riwayatnya lemah atau diperselisihkan, tulis itu.
- **Cek usia dan tahun.** Contoh kesalahan nyata di spec lama: Abdullah bin Zubair disebut membawa kabar ke Gua Tsur,
  padahal ia lahir sesudah Hijrah; yang benar Abdullah bin Abi Bakar. Pastikan tokoh memang masih anak-anak saat
  kejadian.
- Jangan menambah dialog Nabi ﷺ di luar riwayat. Kutipan beliau harus sesuai hadits, dan boleh diparafrasekan dengan
  sederhana.

### Kata-kata yang lolos filter Flow
- Di **prompt gerak (video)**, jangan tulis *"the boy"* / *"the girl"* / *"the child"*. Tulis **"the animated
  character"** (atau "both animated characters"). Prompt dengan kata anak-anak sering ditolak filter keamanan Flow.
- Di **prompt still**, frasa *"3D animated 9-year-old Arab boy … Pixar style, 9:16"* aman dan konsisten.
- Hindari kekerasan eksplisit: tidak ada darah, senjata yang mengenai orang, atau tubuh tergeletak. Untuk kisah perang,
  tunjukkan keberanian lewat ekspresi, berlari, atau berdiri tegak.
- **Hindari anakronisme:** jangan pakai *armor*, *armored*, *knight*, *helmet*, atau *castle*. Tulis pakaian abad ke-7
  secara eksplisit, misalnya *"plain 7th-century Arabian head cloth, a long robe, a simple leather belt … no plate
  armor and no metal helmet"*. Prompt "armored companion" pernah menghasilkan baju zirah Eropa.

---

## 4. Format film (sudah terbukti)

| Bagian | Waktu | Isi | Biaya |
|---|---|---|---|
| Cover | 0–1 dtk | still 9:16 + zoom pelan + kartu judul (dibuat lokal) | gratis |
| Scene 1–4 | 1–33 dtk | 4 klip × 8 dtk, Omni Flash 360p dari still | 4 × 8 = **32 kredit** |
| Narasi | sepanjang film | Google AI Studio TTS, suara **Leda** | gratis |
| Subtitle, backsound, judul, 1080p | – | dibuat lokal | gratis |

- Total film **33 detik**, 9:16. Biaya per episode **32 kredit** (still dan narasi gratis).
- **Narasi: 70–80 kata** Bahasa Indonesia. Hasil nyata: 77–86 kata menghasilkan 33,7–36,6 dtk, dan build mempercepat
  sampai ±12 % (masih natural). Lebih dari 86 kata akan terdengar terburu-buru.
- Struktur naskah (dipakai di semua episode):
  1. **Hook pertanyaan ke penonton** ("Pernah nggak sih kamu …?")
  2. **Perkenalan** ("Namaku …")
  3. **Kejadian** (2–3 kalimat, ada ketegangan kecil)
  4. **Momen hangat** (cahaya keemasan / bantuan / keberhasilan)
  5. **Pelajaran untuk anak hari ini** (1 kalimat, ajakan positif)
- Tulis "Rasulullah ﷺ" atau "Rasulullah shallallahu 'alaihi wa sallam" di narasi. Di **subtitle Inggris tulis
  "(PBUH)"**, bukan "ﷺ", karena ligatur itu tampil sebagai kotak kosong.

---

## 5. Parameter Flow Studio yang dipakai (jangan diubah)

**Storyboard** (`flow_storyboard`): `title`, `script`, `style`, `aspect_ratio: "9:16"`, `cast`, dan 4 `scenes`.
Contoh `style` yang berhasil:
`"Pixar 3D animation, vertical 9:16. Elders are only ever seen from behind or shoulders only; the Prophet is never shown."`

**Portrait cast** (gratis): satu still seluruh badan per tokoh anak, latar netral. Portrait ini dipakai sebagai
`reference_images` di setiap still tokoh itu; inilah yang menjaga wajah tetap sama di semua scene.
Pola prompt: `3D stylized full-body character portrait of a <usia>-year-old Arab <boy/girl> in 7th-century <Medina/Mecca>, <rambut/mata>, <pakaian dengan warna khas>, Pixar 3D animation style, neutral studio background, vertical 9:16`

**Still scene dan cover** (`flow_generate`, gratis):
```json
{ "type": "image", "model": "Nano Banana", "aspect_ratio": "9:16", "max_credits": 0,
  "reference_images": ["<portrait tokoh>"],
  "prompt": "3D animated 9-year-old Arab boy … , Pixar style, 9:16" }
```
- Cover: close-up ekspresif, **ruang kosong di bagian atas untuk judul** (*"clean top space for title text"*).
- Satu tokoh dengan satu warna pakaian yang konsisten di semua prompt (misalnya *"light-blue linen tunic"*).

**Klip video** (`flow_generate`, 8 kredit per klip):
```json
{ "type": "video", "economy": "draft", "aspect_ratio": "9:16", "max_credits": 10,
  "first_frame": "<still scene N>",
  "prompt": "The animated character … (satu aksi sederhana, 1–2 kalimat)" }
```
- **Jangan isi `duration`**: Omni Flash 360p selalu 8 detik.
- Prompt gerak berisi **satu aksi yang terlihat** (menoleh, tersenyum, berlari, mengangguk) plus suasana (cahaya,
  debu, angin). Jangan menulis aksi yang butuh lebih dari 8 detik.

**Narasi** (`flow_narrate`): `voice: "Leda"`, style seperti:
`"in Indonesian, as a <sifat tokoh> boy telling his own story, warm and lively, brisk pace"`
Kalau hasilnya lebih dari 37 dtk: `"in Indonesian, a <sifat> boy telling his story, very quick and energetic, speaking fast with almost no pauses between sentences"`.

**Subtitle** `subs/en.srt`: 5 cue dengan waktu dari film jadi:
`0–5 · 5–12 · 12–19,5 · 19,5–26,5 · 26,5–33` detik (bergeser ±1 dtk mengikuti naskah boleh).

**Judul cover:** Bahasa Inggris, 3–6 kata, menarik untuk anak (contoh: *"The Secret Night Mission"*).

---

## 6. Format output yang diminta (per episode, persis seperti ini)

````markdown
### Episode NN: <Nama tokoh> — <judul Indonesia> (<nilai>)

- **Episode ID:** `epNN_<nama_pendek>`
- **Judul cover (EN):** <3–6 kata>
- **Nilai inti:** <satu kalimat>
- **Sumber:** <kitab, nomor hadits / bab>; <catatan kekuatan riwayat>
- **Usia tokoh saat kejadian:** <angka + dasar perhitungan>

#### Cast (portrait, gratis)
| name | look (Bahasa Inggris, satu baris) |
|---|---|
| <Nama> | <usia>-year-old Arab boy, <rambut/mata>, <pakaian + warna khas> |

#### Narasi (Bahasa Indonesia, 70–80 kata)
> "<naskah>"

`narrate_style`: "in Indonesian, as a <sifat> boy telling his own story, warm and lively, brisk pace"

#### Subtitle (`subs/en.srt`)
```srt
1
00:00:00,000 --> 00:00:05,000
...
(5 cue, sampai 00:00:33,000, pakai "(PBUH)")
```

#### Storyboard (siap untuk `flow_storyboard`)
```json
{
  "title": "EpNN <Nama> - <judul Indonesia>",
  "script": "<narasi yang sama>",
  "style": "Pixar 3D animation, vertical 9:16. <aturan siapa yang tidak boleh tampil di episode ini>",
  "aspect_ratio": "9:16",
  "cast": [{ "name": "<Nama>", "look": "<look>" }],
  "scenes": [
    { "number": 1, "frame_prompt": "3D animated … , Pixar style, 9:16", "prompt": "The animated character …", "economy": "draft", "max_credits": 10 },
    { "number": 2, "frame_prompt": "…", "prompt": "…", "economy": "draft", "max_credits": 10 },
    { "number": 3, "frame_prompt": "…", "prompt": "…", "economy": "draft", "max_credits": 10 },
    { "number": 4, "frame_prompt": "…", "prompt": "…", "economy": "draft", "max_credits": 10 }
  ]
}
```

#### Cover (still terpisah, bukan bagian storyboard)
`Close-up 3D animated <usia>-year-old Arab boy …, clean top space for title text, Pixar style, 9:16`

#### Caption YouTube
- **ID:** <1–2 kalimat + emoji + #SirahNabawiyah #KisahIslamiAnak #KisahSahabatCilik #Shorts>
- **EN:** <1–2 kalimat + emoji + #Seerah #IslamicStoriesForKids #MuslimKids #Shorts>
- Judul video: "Kisah Sahabat Cilik #NN: <judul cover>"
````

Ketentuan penulisan:
- Scene 1–4 mengikuti alur naskah: scene 1 = perkenalan/kejadian, scene 2 = tantangan, scene 3 = momen cahaya
  hangat / keberhasilan, scene 4 = anak tersenyum ke kamera (pelajaran).
- `frame_prompt` selalu dalam Bahasa Inggris, diawali `3D animated <usia>-year-old Arab boy` dan diakhiri
  `Pixar style, 9:16`. `prompt` (gerak) selalu memakai "The animated character".
- Jangan menyertakan model (Nano Banana, Omni Flash), kredit, atau resolusi di dalam teks prompt.
- Jangan menambah field lain ke JSON storyboard: field yang tidak dikenal Flow Studio dibuang diam-diam.

---

## 7. Sebelum mengirim jawaban, periksa sendiri

- [ ] Tokoh belum ada di daftar bagian 2, dan memang masih anak-anak saat kejadian.
- [ ] Ada sumber, dan dialog Nabi ﷺ sesuai riwayat.
- [ ] Narasi 70–80 kata dan mengikuti struktur 5 bagian.
- [ ] Tidak ada Nabi ﷺ atau sahabat senior yang terlihat; orang dewasa hanya dari belakang atau samping.
- [ ] Prompt gerak memakai "The animated character"; tidak ada armor, helm, atau kekerasan.
- [ ] Subtitle memakai "(PBUH)", 5 cue, berakhir di 00:00:33,000.
- [ ] JSON storyboard valid (bisa di-parse).
