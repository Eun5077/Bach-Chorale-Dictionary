import json
from pathlib import Path
from music21 import converter, meter, stream

BASE_DIR = Path(__file__).resolve().parent.parent
SCORES_DIR = BASE_DIR / "xml" / "scores"
OUTPUT_JSON = BASE_DIR / "data" / "pickup_beats.json"


def get_pickup_beats(score):
    part = score.parts[0]

    ts_list = part.recurse().getElementsByClass(meter.TimeSignature)
    if not ts_list:
        return 0.0
    ts = ts_list[0]

    full_measure_qL = ts.barDuration.quarterLength

    measures = part.getElementsByClass(stream.Measure)

    pickup_measure = None
    for m in measures:
        if m.number == 0 or m.number == "0":
            pickup_measure = m
            break

    if pickup_measure is None:
        if not measures:
            return 0.0

        first = measures[0]
        actual_qL = first.duration.quarterLength
        if actual_qL == 0:
            actual_qL = sum(n.duration.quarterLength for n in first.notesAndRests)

        if abs(actual_qL - full_measure_qL) < 1e-6:
            return 0.0
        return float(actual_qL)

    actual_qL = pickup_measure.duration.quarterLength
    if actual_qL == 0:
        actual_qL = sum(n.duration.quarterLength for n in pickup_measure.notesAndRests)

    return float(actual_qL)


def main():
    data = {}

    if not SCORES_DIR.exists():
        print("Scores directory not found:", SCORES_DIR)
        return

    for path in sorted(SCORES_DIR.glob("*.musicxml")):
        try:
            score = converter.parse(path)
            pickup_beats = get_pickup_beats(score)
            data[path.name] = pickup_beats
            print(f"{path.name}: pickup = {pickup_beats} beats")
        except Exception as e:
            print(f"failed to process {path.name}: {e}")

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Saved pickup metadata to:", OUTPUT_JSON)


if __name__ == "__main__":
    main()
