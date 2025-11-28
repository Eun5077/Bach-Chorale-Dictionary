from music21 import corpus
from music21.corpus.chorales import ChoraleListRKBWV
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_PATH = DATA_DIR / "chorales_meta.json"

bcl = ChoraleListRKBWV()
riem_dict = bcl.byRiemenschneider

print(f"Chorales found: {len(riem_dict)}")

records = []

for riem_num in sorted(riem_dict.keys()):
    info = riem_dict[riem_num]

    bwv = info.get("bwv")
    kalmus = info.get("kalmus")
    title = info.get("title")

    corpus_path = f"bach/bwv{bwv}"

    try:
        score = corpus.parse(corpus_path)

        try:
            key_obj = score.analyze("key")
            key_original = f"{key_obj.tonic.name} {key_obj.mode}"
        except Exception:
            key_original = None

        time_sigs = list(score.recurse().getTimeSignatures())
        if time_sigs:
            ts = time_sigs[0]
            time_signature = f"{ts.numerator}/{ts.denominator}"
        else:
            time_signature = None

        bwv_str = str(bwv).replace(".", "_")
        musicxml_filename = f"bwv{bwv_str}.musicxml"
        musicxml_path = f"xml/scores/{musicxml_filename}"

        record = {
            "id": riem_num,
            "riemenschneider": riem_num,
            "bwv": bwv,
            "kalmus": kalmus,
            "title": title,
            "key_original": key_original,
            "time_signature": time_signature,
            "corpus_path": corpus_path,
            "musicxml_path": musicxml_path,
        }

        records.append(record)
        print(f"OK: R{riem_num} BWV{bwv} {title}")

    except Exception as e:
        print(f"Error: R{riem_num} BWV{bwv} {title} -> {e}")

with OUTPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"Saved {len(records)} records to {OUTPUT_PATH}")
