from pathlib import Path
from music21 import converter, stream, expressions, clef

BASE_DIR = Path(__file__).resolve().parent.parent

SRC_DIR = BASE_DIR / "xml" / "scores"
OUT_DIR = BASE_DIR / "xml" / "scores_cadence"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def has_fermata(n):
    for exp in n.expressions:
        if isinstance(exp, expressions.Fermata):
            return True
    for art in n.articulations:
        if getattr(art, "name", "").lower() == "fermata":
            return True
    return False


def find_fermata_points(score):
    soprano = score.parts[0]
    fermata_by_measure = {}

    for n in soprano.recurse().notesAndRests:
        if not has_fermata(n):
            continue
        mnum = n.measureNumber
        if mnum is None:
            continue

        existing = fermata_by_measure.get(mnum)
        if existing is None:
            fermata_by_measure[mnum] = n
        else:
            if (n.beat < existing.beat) or (
                n.beat == existing.beat and n.offset < existing.offset
            ):
                fermata_by_measure[mnum] = n

    return [
        (mnum, fermata_by_measure[mnum])
        for mnum in sorted(fermata_by_measure.keys())
    ]


def extract_cadence(score, base_stem, idx, mnum, fermata_note):
    fermata_beat = fermata_note.beat
    fermata_offset = fermata_note.offset

    if fermata_beat == 1 and mnum > 1:
        start_measure = mnum - 1
    else:
        start_measure = mnum

    end_measure = mnum

    cad_score = stream.Score()
    if score.metadata:
        cad_score.insert(0, score.metadata)

    for part_idx, p in enumerate(score.parts):
        new_part = stream.Part()
        new_part.id = p.id
        new_part.partName = p.partName

        if part_idx >= 2:
            new_part.insert(0, clef.BassClef())
        else:
            new_part.insert(0, clef.TrebleClef())

        for m in p.measures(start_measure, end_measure):
            if not isinstance(m, stream.Measure):
                continue

            m_copy = stream.Measure()
            m_copy.number = m.number

            for el in m:
                if m_copy.number == end_measure and hasattr(el, "offset"):
                    if el.offset > fermata_offset:
                        continue
                m_copy.append(el)

            new_part.append(m_copy)

        cad_score.append(new_part)

    out_name = f"{base_stem}_cad{idx + 1}_m{start_measure}-{end_measure}.musicxml"
    out_path = OUT_DIR / out_name
    cad_score.write("musicxml", out_path)
    print(f"Generated: {out_name} (measures {start_measure}–{end_measure})")


def process_file(path: Path):
    print(f"Processing: {path.name}")
    score = converter.parse(path)

    fermata_points = find_fermata_points(score)
    if not fermata_points:
        print("  No fermata found. Skipped.")
        return

    base_stem = path.stem

    for idx, (mnum, note_obj) in enumerate(fermata_points):
        extract_cadence(score, base_stem, idx, mnum, note_obj)


def main():
    xml_files = sorted(SRC_DIR.glob("*.xml")) + sorted(SRC_DIR.glob("*.musicxml"))

    print("Source chorale files:", len(xml_files))
    print("SRC_DIR:", SRC_DIR.resolve())
    print("OUT_DIR:", OUT_DIR.resolve())

    if not xml_files:
        print("No MusicXML files found.")
        return

    for path in xml_files:
        process_file(path)


if __name__ == "__main__":
    main()
