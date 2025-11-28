from pathlib import Path
import json
from music21 import corpus

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
META_PATH = DATA_DIR / "chorales_meta.json"

AUDIO_NOTES_DIR = DATA_DIR / "audio_notes"
AUDIO_NOTES_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_TEMPO_QPM = 80

with META_PATH.open("r", encoding="utf-8") as f:
    chorales_meta = json.load(f)

print(f"Loaded {len(chorales_meta)} chorales from chorales_meta.json")


def extract_parts_notes(score):
    parts_data = []
    default_names = ["Soprano", "Alto", "Tenor", "Bass"]

    for idx, part in enumerate(score.parts):
        if idx >= 4:
            break

        name = default_names[idx] if idx < len(default_names) else (
            part.partName or f"Part {idx + 1}"
        )
        notes_list = []

        flat_part = part.flat

        for el in flat_part.notesAndRests:
            if el.isRest:
                continue

            start_time = float(el.offset)
            duration = float(el.quarterLength)

            try:
                midi_pitch = int(el.pitch.midi)
            except Exception:
                continue

            try:
                measure_number = el.measureNumber
            except Exception:
                measure_number = None

            notes_list.append(
                {
                    "time": start_time,
                    "pitch": midi_pitch,
                    "duration": duration,
                    "measure": int(measure_number) if measure_number else None,
                }
            )

        notes_list.sort(key=lambda n: n["time"])

        parts_data.append(
            {
                "name": name,
                "index": idx,
                "notes": notes_list,
            }
        )

    return parts_data


for ch_meta in chorales_meta:
    riem = (
        ch_meta.get("riem")
        or ch_meta.get("riemenschneider")
        or ch_meta.get("id")
    )
    bwv = ch_meta.get("bwv")
    corpus_path = ch_meta.get("corpus_path")
    time_sig = ch_meta.get("time_signature")

    if not corpus_path or not bwv:
        print(f"Skip R{riem}: missing corpus_path or bwv")
        continue

    bwv_str = str(bwv).replace(".", "_")
    out_path = AUDIO_NOTES_DIR / f"bwv{bwv_str}.json"

    try:
        score = corpus.parse(corpus_path)

        total_duration_beats = float(score.highestTime)

        parts_data = extract_parts_notes(score)
        if not parts_data:
            print(f"Warning R{riem}: BWV{bwv} has no parts data")
            continue

        out_obj = {
            "riem": riem,
            "bwv": str(bwv),
            "tempo_qpm": DEFAULT_TEMPO_QPM,
            "time_signature": time_sig,
            "total_duration_beats": total_duration_beats,
            "parts": parts_data,
        }

        with out_path.open("w", encoding="utf-8") as f:
            json.dump(out_obj, f, ensure_ascii=False, indent=2)

        print(f"OK R{riem}: BWV{bwv} -> {out_path.name}")

    except Exception as e:
        print(f"Error R{riem}: BWV{bwv} ({corpus_path}) -> {e}")

print("Done")
