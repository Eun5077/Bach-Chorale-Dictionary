from pathlib import Path
import json
from music21 import corpus
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "chorales_meta.json"
SCORES_DIR = BASE_DIR / "xml" / "scores"
SCORES_DIR.mkdir(parents=True, exist_ok=True)

with DATA_PATH.open("r", encoding="utf-8") as f:
    chorales = json.load(f)

print(f"Exporting MusicXML for {len(chorales)} chorales...")

for ch in chorales:
    corpus_path = ch.get("corpus_path")
    musicxml_path = ch.get("musicxml_path")

    if not corpus_path or not musicxml_path:
        print(f"Skip: missing path info for R{ch.get('riemenschneider')}")
        continue

    out_path = SCORES_DIR / Path(musicxml_path).name

    try:
        score = corpus.parse(corpus_path)
        score.write("musicxml", fp=str(out_path))

        tree = ET.parse(out_path)
        root = tree.getroot()

        if root.tag.startswith("{"):
            ns_uri = root.tag.split("}")[0][1:]
        else:
            ns_uri = None

        def q(tag: str) -> str:
            return f"{{{ns_uri}}}{tag}" if ns_uri else tag

        riem = ch.get("riemenschneider") or ch.get("id")
        title = ch.get("title") or ""
        label = f"{riem}. {title}"

        mts = root.findall(q("movement-title"))
        if not mts:
            mt = ET.Element(q("movement-title"))
            root.insert(0, mt)
            mts = [mt]
        for mt in mts:
            mt.text = label

        works = root.findall(q("work"))
        if not works:
            work = ET.Element(q("work"))
            root.insert(0, work)
            works = [work]
        work = works[0]

        wts = work.findall(q("work-title"))
        if not wts:
            wt = ET.SubElement(work, q("work-title"))
            wts = [wt]
        for wt in wts:
            wt.text = label

        for ident in root.findall(q("identification")):
            for creator in ident.findall(q("creator")):
                t = (creator.get("type") or "").lower()
                if t in ("composer", "lyricist"):
                    creator.text = ""

        for credit in root.findall(q("credit")):
            for words in credit.findall(q("credit-words")):
                words.text = ""

        tree.write(out_path, encoding="utf-8", xml_declaration=True)

        print(f"OK: {corpus_path} -> {out_path.name}")

    except Exception as e:
        print(f"Error: {corpus_path} -> {e}")

print("Done.")
