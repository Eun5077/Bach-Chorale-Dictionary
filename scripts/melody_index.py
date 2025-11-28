from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
AUDIO_NOTES_DIR = DATA_DIR / "audio_notes"

OUTPUT_PATH = DATA_DIR / "melody_index.json"

print(f"BASE_DIR: {BASE_DIR}")
print(f"AUDIO_NOTES_DIR: {AUDIO_NOTES_DIR}")

if not AUDIO_NOTES_DIR.exists():
    raise FileNotFoundError(f"audio_notes directory not found: {AUDIO_NOTES_DIR}")


def build_part_melody(part_obj):
    notes = part_obj.get("notes", [])
    if not notes:
        return None

    pitches = []
    durations = []
    measures = []

    for n in notes:
        pitch = n.get("pitch")
        dur = n.get("duration")
        meas = n.get("measure")

        if pitch is None or dur is None:
            continue

        pitches.append(int(pitch))
        durations.append(round(float(dur), 3))
        measures.append(int(meas) if meas is not None else None)

    if not pitches:
        return None

    intervals = []
    for i in range(len(pitches) - 1):
        intervals.append(int(pitches[i + 1] - pitches[i]))

    return {
        "index": part_obj.get("index"),
        "name": part_obj.get("name"),
        "pitches": pitches,
        "durations": durations,
        "intervals": intervals,
        "measures": measures,
    }


entries = []

json_files = sorted(AUDIO_NOTES_DIR.glob("bwv*.json"))
print(f"Found {len(json_files)} audio_notes JSON files.")

for json_path in json_files:
    try:
        with json_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {json_path.name}: {e}")
        continue

    riem = data.get("riem")
    bwv = data.get("bwv")
    parts = data.get("parts", [])

    if bwv is None:
        print(f"{json_path.name}: missing BWV, skipped")
        continue

    entry_parts = []

    for part_obj in parts:
        part_melody = build_part_melody(part_obj)
        if part_melody is not None:
            entry_parts.append(part_melody)

    if not entry_parts:
        print(f"{json_path.name}: no valid parts, skipped")
        continue

    entry = {
        "riem": riem,
        "bwv": bwv,
        "parts": entry_parts,
    }
    entries.append(entry)

    print(f"BWV{bwv}: {len(entry_parts)} parts processed")


OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

with OUTPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

print(f"Saved melody index for {len(entries)} chorales:")
print(f" -> {OUTPUT_PATH}")
