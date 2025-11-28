import copy
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from music21 import (
    articulations,
    clef,
    converter,
    expressions,
    key,
    meter,
    note,
    stream,
)

INPUT_DIR = Path("/Users/joeun/Desktop/ChoraleDictionary/xml/scores")
OUTPUT_DIR = Path("/Users/joeun/Desktop/ChoraleDictionary/xml/scores_phrase")

VALID_EXT = {".xml", ".musicxml", ".mxl"}


@dataclass
class FermataEvent:
    measure: int
    offset: float
    length: float


def has_fermata(note_or_rest):
    for e in getattr(note_or_rest, "expressions", []):
        if isinstance(e, expressions.Fermata):
            return True
    for a in getattr(note_or_rest, "articulations", []):
        if isinstance(a, articulations.Fermata):
            return True
    return False


def get_soprano_fermata_events(score: stream.Score):
    parts = score.parts
    if len(parts) == 0:
        return []

    soprano = parts[0]
    events = []

    for n in soprano.recurse().notesAndRests:
        if not has_fermata(n):
            continue

        m = n.getContextByClass(stream.Measure)
        if m is None or m.number is None:
            continue

        ev = FermataEvent(
            measure=int(m.number),
            offset=float(n.offset),
            length=float(n.quarterLength),
        )
        events.append(ev)

    events.sort(key=lambda e: (e.measure, e.offset))
    return events


def get_measure_range(score: stream.Score):
    parts = score.parts
    if len(parts) == 0:
        return 1, 1

    soprano = parts[0]
    measure_numbers = [
        m.number
        for m in soprano.getElementsByClass(stream.Measure)
        if m.number is not None
    ]

    if not measure_numbers:
        return 1, 1

    return int(min(measure_numbers)), int(max(measure_numbers))


def get_first_soprano_onset(score: stream.Score):
    parts = score.parts
    if len(parts) == 0:
        return None, None

    soprano = parts[0]
    first_meas = None
    first_off = None

    for n in soprano.recurse().notes:
        m = n.getContextByClass(stream.Measure)
        if m is None or m.number is None:
            continue
        meas = int(m.number)
        off = float(n.offset)

        if first_meas is None or (meas < first_meas or (meas == first_meas and off < first_off)):
            first_meas = meas
            first_off = off

    return first_meas, first_off


def build_phrase_bounds(score: stream.Score):
    fermatas = get_soprano_fermata_events(score)
    min_meas, max_meas = get_measure_range(score)

    parts = score.parts
    if len(parts) == 0:
        return []

    soprano = parts[0]

    first_meas, first_off = get_first_soprano_onset(score)
    if first_meas is None:
        first_meas, first_off = min_meas, 0.0

    if not fermatas:
        return [(first_meas, first_off, max_meas, None)]

    phrase_bounds = []
    current_start_measure = first_meas
    current_start_offset = first_off

    for f in fermatas:
        end_measure = f.measure
        end_offset = f.offset + f.length

        phrase_bounds.append(
            (current_start_measure, current_start_offset, end_measure, end_offset)
        )

        next_start_measure = end_measure
        next_start_offset = end_offset

        m_obj = soprano.measure(end_measure)
        bar_q = None
        if m_obj is not None and m_obj.barDuration is not None:
            bar_q = float(m_obj.barDuration.quarterLength)

        if bar_q is not None and next_start_offset >= bar_q - 1e-6:
            next_start_measure = end_measure + 1
            next_start_offset = 0.0

        current_start_measure = next_start_measure
        current_start_offset = next_start_offset

    if current_start_measure <= max_meas:
        phrase_bounds.append(
            (current_start_measure, current_start_offset, max_meas, None)
        )

    return phrase_bounds


def extract_phrase_score(
    score: stream.Score,
    start_measure,
    start_offset: float,
    end_measure,
    end_offset: Optional[float],
) -> stream.Score:
    new_score = stream.Score()

    part_base_attrs = []
    for p in score.parts:
        base_key = None
        base_time = None
        base_clef = None

        for m in p.getElementsByClass(stream.Measure):
            ks = m.getElementsByClass(key.KeySignature)
            if ks and base_key is None:
                base_key = ks[0]

            ts = m.getElementsByClass(meter.TimeSignature)
            if ts and base_time is None:
                base_time = ts[0]

            cs = m.getElementsByClass(clef.Clef)
            if cs and base_clef is None:
                base_clef = cs[0]

            if base_key and base_time and base_clef:
                break

        part_base_attrs.append((base_key, base_time, base_clef))

    for part_idx, p in enumerate(score.parts):
        new_part = stream.Part()
        new_part.id = getattr(p, "id", None)
        new_part.partName = getattr(p, "partName", None)

        for m in p.getElementsByClass(stream.Measure):
            num = m.number
            if num is None:
                continue
            num = int(num)

            if num < start_measure or num > end_measure:
                continue

            new_measure = stream.Measure()
            new_measure.number = m.number

            for e in m:
                if not hasattr(e, "offset"):
                    new_e = copy.deepcopy(e)
                    new_measure.insert(0.0, new_e)
                    continue

                off = float(e.offset)
                keep = True

                if num == start_measure and off < start_offset - 1e-6:
                    keep = False

                if end_offset is not None and num == end_measure:
                    if off >= end_offset - 1e-6:
                        keep = False

                if not keep:
                    continue

                new_e = copy.deepcopy(e)

                if num == start_measure:
                    new_off = off - start_offset
                    if new_off < 0:
                        new_off = 0.0
                else:
                    new_off = off

                new_measure.insert(new_off, new_e)

            new_part.append(new_measure)

        measures_in_new = list(new_part.getElementsByClass(stream.Measure))
        if measures_in_new:
            first_m = measures_in_new[0]
            base_key, base_time, base_clef = part_base_attrs[part_idx]

            if base_key is not None and not first_m.getElementsByClass(key.KeySignature):
                first_m.insert(0.0, copy.deepcopy(base_key))

            if base_time is not None and not first_m.getElementsByClass(meter.TimeSignature):
                first_m.insert(0.0, copy.deepcopy(base_time))

            for cobj in list(first_m.getElementsByClass(clef.Clef)):
                first_m.remove(cobj)

            if part_idx in (2, 3):
                first_m.insert(0.0, clef.BassClef())
            else:
                if base_clef is not None:
                    first_m.insert(0.0, copy.deepcopy(base_clef))
                else:
                    if part_idx in (0, 1):
                        first_m.insert(0.0, clef.TrebleClef())

            last_note_end = 0.0
            for n in first_m.notes:
                end_pos = float(n.offset) + float(n.quarterLength)
                if end_pos > last_note_end:
                    last_note_end = end_pos

            if last_note_end > 0:
                for r in list(first_m.getElementsByClass(note.Rest)):
                    if float(r.offset) >= last_note_end - 1e-6:
                        first_m.remove(r)

        new_score.insert(0, new_part)

    new_score.metadata = score.metadata
    return new_score


def process_file(path: Path):
    print(f"Processing: {path.name}")
    try:
        score = converter.parse(str(path))
    except Exception as e:
        print("  Parse failed:", e)
        return

    bounds = build_phrase_bounds(score)
    if not bounds:
        print("  No phrase bounds. Skipped.")
        return

    base_name = path.stem

    for idx, (s_meas, s_off, e_meas, e_off) in enumerate(bounds, start=1):
        try:
            phrase_score = extract_phrase_score(score, s_meas, s_off, e_meas, e_off)
            out_name = f"{base_name}_phrase{idx:02d}.musicxml"
            out_path = OUTPUT_DIR / out_name
            phrase_score.write("musicxml", fp=str(out_path))

            if e_off is None:
                print(
                    f"  Saved: {out_name} "
                    f"(measures {s_meas}:{s_off} ~ {e_meas}:end)"
                )
            else:
                print(
                    f"  Saved: {out_name} "
                    f"(measures {s_meas}:{s_off} ~ {e_meas}:{e_off})"
                )

        except Exception as e:
            print(f"  Phrase save failed (#{idx}):", e)


def main():
    if not INPUT_DIR.exists():
        print("Input folder not found:", INPUT_DIR)
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = [
        p for p in INPUT_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in VALID_EXT
    ]

    if not files:
        print("No MusicXML files in input folder:", INPUT_DIR)
        return

    for path in sorted(files):
        process_file(path)


if __name__ == "__main__":
    main()
