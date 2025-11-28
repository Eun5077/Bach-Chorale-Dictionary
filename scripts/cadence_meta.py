from pathlib import Path
import json
import re

from music21 import converter, note, stream, expressions, chord


BASE_DIR = Path(__file__).resolve().parent.parent

CADENCE_DIR = BASE_DIR / "xml" / "scores_cadence"
OUT_JSON = BASE_DIR / "data" / "cadences_meta.json"
CHORALE_META_JSON = BASE_DIR / "data" / "chorales_meta.json"


def load_chorale_meta():
    """
    Read chorales_meta.json and build a mapping:
      original musicxml stem -> metadata dict
    Example key: "bwv101_7"
    """
    if not CHORALE_META_JSON.exists():
        print("Warning: chorales_meta.json not found:", CHORALE_META_JSON)
        return {}

    with CHORALE_META_JSON.open(encoding="utf-8") as f:
        data = json.load(f)

    mapping = {}
    for ch in data:
        mpath = ch.get("musicxml_path")
        if not mpath:
            continue
        stem = Path(mpath).stem
        mapping[stem] = ch

    print(f"Loaded metadata for {len(mapping)} chorales.")
    return mapping


def has_fermata(n):
    """Return True if the note/rest has a fermata expression or articulation."""
    for exp in getattr(n, "expressions", []):
        if isinstance(exp, expressions.Fermata):
            return True
    for art in getattr(n, "articulations", []):
        if getattr(art, "name", "").lower() == "fermata":
            return True
    return False


def extract_voice_data(part: stream.Part):
    """
    For one voice (Part), extract:
      - midi: list of MIDI numbers (or None for rests)
      - names: pitch names like "C4", "F#3", or "rest"
      - durations: quarterLength values (float)
      - intervals: semitone difference between consecutive MIDI notes
    """
    midi_list = []
    name_list = []
    dur_list = []

    for el in part.recurse().notesAndRests:
        ql = float(el.quarterLength)

        if isinstance(el, note.Note):
            midi_list.append(int(el.pitch.midi))
            name_list.append(el.pitch.nameWithOctave)
        else:
            midi_list.append(None)
            name_list.append("rest")

        dur_list.append(ql)

    intervals = []
    prev = None
    for m in midi_list:
        if prev is None or m is None or prev is None:
            intervals.append(None)
        else:
            intervals.append(int(m - prev))
        prev = m

    return {
        "midi": midi_list,
        "names": name_list,
        "durations": dur_list,
        "intervals": intervals,
    }


def get_last_note(part: stream.Part):
    """Return the last Note in the part (ignoring rests)."""
    notes = [n for n in part.recurse().notes if isinstance(n, note.Note)]
    if not notes:
        return None
    return notes[-1]


def get_fermata_beat_from_original(orig_xml_path: Path, fermata_measure: int):
    """
    Open the original full chorale XML and find the beat of the fermata note
    in the given measure (using the soprano part).
    """
    if not orig_xml_path.exists():
        print("Warning: original XML not found:", orig_xml_path)
        return None

    score = converter.parse(orig_xml_path)
    soprano = score.parts[0]

    for n in soprano.recurse().notesAndRests:
        if getattr(n, "measureNumber", None) == fermata_measure and has_fermata(n):
            try:
                return float(n.beat)
            except Exception:
                return None

    return None


def parse_measures_from_stem(stem: str):
    """
    Parse measure range from file stem.
    Pattern: *_mX-Y  ->  (X, Y)
    Example: "bwv101_7_cad1_m12-13" -> (12, 13)
    """
    m = re.search(r"_m(\d+)-(\d+)$", stem)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def derive_soprano_role_from_chord(final_chord: chord.Chord, final_sop_note: note.Note):
    """
    Decide whether the final soprano note is the root, third, fifth, or other
    within the final chord (local chord, not global key).
    """
    if final_chord is None or final_sop_note is None:
        return "other"

    pcs = sorted(set(p.pitchClass for p in final_chord.pitches))
    if not pcs:
        return "other"

    try:
        root_pc = final_chord.root().pitchClass
    except Exception:
        root_pc = pcs[0]

    third_pc = None
    fifth_pc = None

    for pc in pcs:
        interval = (pc - root_pc) % 12
        if interval in (3, 4):
            third_pc = pc
        elif interval == 7:
            fifth_pc = pc

    sop_pc = final_sop_note.pitch.pitchClass

    if sop_pc == root_pc:
        return "root"
    if third_pc is not None and sop_pc == third_pc:
        return "third"
    if fifth_pc is not None and sop_pc == fifth_pc:
        return "fifth"
    return "other"


def build_melody_signature(midi_list, durations=None):
    """
    Build a string signature for a melody line.
    - If durations is None: only pitches (e.g., "65,64,62").
    - If durations is provided: pitch:dur pairs (e.g., "65:1.0,64:1.0,62:1.0").
    """
    if durations is None:
        pure_midis = [str(m) for m in midi_list if m is not None]
        return ",".join(pure_midis)

    pairs = []
    for m, d in zip(midi_list, durations):
        if m is None:
            pairs.append(f"rest:{d}")
        else:
            pairs.append(f"{m}:{d}")
    return ",".join(pairs)


NOTE_TO_PC = {
    "C": 0,
    "B#": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "Fb": 4,
    "E#": 5,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
    "Cb": 11,
    "B-": 10,
    "E-": 3,
    "A-": 8,
}


def parse_key_root_pc(key_original: str):
    """Return tonic pitch class from key string like 'D minor' or 'G major'."""
    if not key_original or not isinstance(key_original, str):
        return None
    parts = key_original.strip().split()
    if not parts:
        return None
    root_str = parts[0]
    return NOTE_TO_PC.get(root_str)


def get_last_bass_interval_from_midis(bass_midis):
    """
    From a bass MIDI list, compute final - penultimate semitone interval.
    Returns None if fewer than 2 notes.
    """
    notes = [m for m in bass_midis if m is not None]
    if len(notes) < 2:
        return None
    penult, final = notes[-2], notes[-1]
    return int(final - penult)


def get_final_bass_pc(final_bass_pitch):
    """Return pitch class (0–11) from final bass MIDI number."""
    if final_bass_pitch is None:
        return None
    try:
        return int(final_bass_pitch) % 12
    except (TypeError, ValueError):
        return None


def classify_cadence(bass_midis, key_original, final_bass_pitch):
    """
    Classify cadence into:
      authentic, plagal/half, deceptive, phrygian, other.
    """
    last_interval = get_last_bass_interval_from_midis(bass_midis)
    final_bass_pc = get_final_bass_pc(final_bass_pitch)
    tonic_pc = parse_key_root_pc(key_original)

    is_phrygian = last_interval == -1
    is_authentic = last_interval in (-7, 5)
    is_plagal_half_interval = last_interval in (-5, 7)

    if tonic_pc is not None and final_bass_pc is not None:
        dominant_pc = (tonic_pc + 7) % 12
        is_plagal_half_global = final_bass_pc == dominant_pc
    else:
        is_plagal_half_global = False

    is_plagal_half = is_plagal_half_interval or is_plagal_half_global
    is_deceptive = last_interval in (1, 2)

    if is_phrygian:
        cadence_type = "phrygian"
    elif is_authentic:
        cadence_type = "authentic"
    elif is_plagal_half:
        cadence_type = "plagal/half"
    elif is_deceptive:
        cadence_type = "deceptive"
    else:
        cadence_type = "other"

    return last_interval, cadence_type


def process_cadence_file(path: Path, chorale_meta_map: dict):
    """Parse a single cadence MusicXML file and return a JSON-ready dict."""
    print(f"Processing: {path.name}")
    stem = path.stem

    orig_stem = stem.split("_cad")[0]
    source_meta = chorale_meta_map.get(orig_stem, {})

    start_m, end_m = parse_measures_from_stem(stem)

    score = converter.parse(path)

    voices = {}
    part_names = ["soprano", "alto", "tenor", "bass"]
    for idx, part in enumerate(score.parts):
        if idx >= 4:
            break
        vname = part_names[idx]
        voices[vname] = extract_voice_data(part)

    soprano_part = score.parts[0] if len(score.parts) > 0 else None
    bass_part = score.parts[3] if len(score.parts) > 3 else None

    final_sop_note = get_last_note(soprano_part) if soprano_part else None
    final_bass_note = get_last_note(bass_part) if bass_part else None

    final_sop_pitch = int(final_sop_note.pitch.midi) if final_sop_note else None
    final_sop_name = (
        final_sop_note.pitch.nameWithOctave if final_sop_note else None
    )

    final_bass_pitch = int(final_bass_note.pitch.midi) if final_bass_note else None
    final_bass_name = (
        final_bass_note.pitch.nameWithOctave if final_bass_note else None
    )

    final_chord = None
    try:
        chs = score.chordify().recurse().getElementsByClass("Chord")
        if chs:
            final_chord = chs[-1]
    except Exception:
        final_chord = None

    final_soprano_role = derive_soprano_role_from_chord(final_chord, final_sop_note)

    fermata_beat = None
    orig_xml_rel = source_meta.get("musicxml_path")
    if end_m is not None and orig_xml_rel:
        orig_xml_path = BASE_DIR / "xml" / orig_xml_rel
        fermata_beat = get_fermata_beat_from_original(orig_xml_path, end_m)

    sop_midi = voices.get("soprano", {}).get("midi", [])
    sop_dur = voices.get("soprano", {}).get("durations", [])
    bass_midi = voices.get("bass", {}).get("midi", [])
    bass_dur = voices.get("bass", {}).get("durations", [])

    soprano_signature = build_melody_signature(sop_midi)
    soprano_signature_with_rhythm = build_melody_signature(sop_midi, sop_dur)
    bass_signature = build_melody_signature(bass_midi)
    bass_signature_with_rhythm = build_melody_signature(bass_midi, bass_dur)

    key_original = source_meta.get("key_original")
    final_bass_interval, cadence_type = classify_cadence(
        bass_midi, key_original, final_bass_pitch
    )

    obj = {
        "id": stem,
        "musicxml_path": f"xml/scores_cadence/{path.name}",
        "source_musicxml": source_meta.get("musicxml_path"),
        "bwv": source_meta.get("bwv"),
        "riemenschneider": source_meta.get("riemenschneider"),
        "chorale_title": source_meta.get("title"),
        "key_original": source_meta.get("key_original"),
        "time_signature": source_meta.get("time_signature"),
        "start_measure": start_m,
        "end_measure": end_m,
        "fermata_measure": end_m,
        "fermata_beat": fermata_beat,
        "final_soprano_pitch": final_sop_pitch,
        "final_soprano_name": final_sop_name,
        "final_soprano_role": final_soprano_role,
        "final_bass_pitch": final_bass_pitch,
        "final_bass_name": final_bass_name,
        "final_bass_interval": final_bass_interval,
        "cadence_type": cadence_type,
        "voices": voices,
        "soprano_signature": soprano_signature,
        "soprano_signature_with_rhythm": soprano_signature_with_rhythm,
        "bass_signature": bass_signature,
        "bass_signature_with_rhythm": bass_signature_with_rhythm,
    }

    return obj


def main():
    if not CADENCE_DIR.exists():
        print("Cadence XML folder not found:", CADENCE_DIR)
        return

    chorale_meta_map = load_chorale_meta()

    cadence_files = sorted(
        list(CADENCE_DIR.glob("*.xml"))
        + list(CADENCE_DIR.glob("*.musicxml"))
    )

    print("Cadence files:", len(cadence_files))
    results = []

    for path in cadence_files:
        try:
            obj = process_cadence_file(path, chorale_meta_map)
            results.append(obj)
        except Exception as e:
            print("Error while processing", path.name, "->", e)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("Written cadence metadata to:", OUT_JSON)


if __name__ == "__main__":
    main()
