import json
import math
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

from music21 import converter, stream, note


ROOT = Path("/Users/joeun/Desktop/ChoraleDictionary")
PHRASE_DIR = ROOT / "xml" / "scores_phrase"
OUTPUT_JSON = ROOT / "data" / "soprano_groups.json"


def round_q(q: float, ndigits: int = 3) -> float:
    return float(round(q, ndigits))


def get_soprano_part(score: stream.Score) -> Optional[stream.Part]:
    if not hasattr(score, "parts") or len(score.parts) == 0:
        return None
    for p in score.parts:
        if getattr(p, "id", None) == "P1":
            return p
    return score.parts[0]


def extract_soprano_pattern(sop: stream.Part) -> Optional[Dict[str, Any]]:
    notes_list = list(sop.recurse().getElementsByClass(note.Note))
    if len(notes_list) < 1:
        return None

    pitches = []
    durs = []

    for n in notes_list:
        pitches.append(int(n.pitch.midi))
        durs.append(round_q(float(n.quarterLength)))

    intervals = []
    for i in range(len(pitches) - 1):
        intervals.append(pitches[i + 1] - pitches[i])

    return {
        "pitches": pitches,
        "durations": durs,
        "intervals": intervals,
    }


def make_signature(intervals: List[int], durations: List[float]) -> str:
    int_part = ",".join(str(i) for i in intervals)
    dur_part = ",".join(str(d) for d in durations)
    return f"INT:{int_part}|DUR:{dur_part}"


def get_measure_range_label(sop: stream.Part) -> str:
    nums = []
    for m in sop.getElementsByClass(stream.Measure):
        if m.number is not None:
            nums.append(str(m.number))
    if not nums:
        return ""
    first = nums[0]
    last = nums[-1]
    if first == last:
        return f"m.{first}"
    return f"m.{first}–{last}"


def parse_phrase_filename(path: Path) -> Dict[str, Any]:
    stem = path.stem
    piece_id = stem
    phrase_idx = None

    if "_phrase" in stem:
        piece_id, tail = stem.split("_phrase", 1)
        try:
            phrase_idx = int(tail)
        except ValueError:
            phrase_idx = None

    return {
        "id": stem,
        "pieceId": piece_id,
        "phraseIndex": phrase_idx,
    }


def build_soprano_groups() -> Dict[str, Any]:
    if not PHRASE_DIR.exists():
        raise SystemExit(f"Phrase directory not found: {PHRASE_DIR}")

    print(f"Scanning {PHRASE_DIR}")

    groups: Dict[str, Dict[str, Any]] = {}
    total_phrases = 0

    xml_files = sorted(
        [p for p in PHRASE_DIR.iterdir() if p.suffix.lower() in (".xml", ".musicxml", ".mxl")]
    )

    for path in xml_files:
        print(f"  Processing {path.name}")
        try:
            score = converter.parse(path)
        except Exception as e:
            print("    Parse failed:", e)
            continue

        sop = get_soprano_part(score)
        if sop is None:
            print("    No soprano part, skipped")
            continue

        pattern = extract_soprano_pattern(sop)
        if pattern is None:
            print("    No soprano notes, skipped")
            continue

        intervals = pattern["intervals"]
        durations = pattern["durations"]

        if len(intervals) == 0:
            print("    Not enough notes (no intervals), skipped")
            continue

        signature = make_signature(intervals, durations)

        meta = parse_phrase_filename(path)
        phrase_id = meta["id"]
        piece_id = meta["pieceId"]
        phrase_idx = meta["phraseIndex"]

        md = score.metadata
        title = None
        if md is not None:
            title = (
                getattr(md, "movementName", None)
                or getattr(md, "movementTitle", None)
                or getattr(md, "title", None)
                or getattr(md, "workTitle", None)
            )
        if not title:
            title = piece_id

        measure_label = get_measure_range_label(sop)

        phrase_entry = {
            "id": phrase_id,
            "pieceId": piece_id,
            "phraseIndex": phrase_idx,
            "xmlPath": f"xml/scores_phrase/{path.name}",
            "title": title,
            "measures": measure_label,
        }

        if signature not in groups:
            groups[signature] = {
                "signature": signature,
                "intervals": intervals,
                "durations": durations,
                "phrases": [],
            }

        groups[signature]["phrases"].append(phrase_entry)
        total_phrases += 1

    group_list: List[Dict[str, Any]] = []

    for idx, (sig, g) in enumerate(groups.items(), start=1):
        phrases = g["phrases"]
        phrases_sorted = sorted(
            phrases,
            key=lambda x: (
                x.get("pieceId", ""),
                x.get("phraseIndex", math.inf if x.get("phraseIndex") is None else x["phraseIndex"]),
            ),
        )

        group_list.append(
            {
                "groupId": f"grp_{idx:04d}",
                "signature": g["signature"],
                "intervals": g["intervals"],
                "durations": g["durations"],
                "size": len(phrases_sorted),
                "phrases": phrases_sorted,
            }
        )

    group_list.sort(key=lambda g: g["size"], reverse=True)

    return {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "phraseCount": total_phrases,
        "groupCount": len(group_list),
        "groups": group_list,
    }


def main():
    data = build_soprano_groups()

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("\nSaved:", OUTPUT_JSON)
    print(" phraseCount =", data["phraseCount"])
    print(" groupCount  =", data["groupCount"])


if __name__ == "__main__":
    main()
