from pathlib import Path
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent.parent

SRC_DIR = BASE_DIR / "xml" / "scores"
OUT_DIR = BASE_DIR / "xml" / "scores_ear"
OUT_DIR.mkdir(parents=True, exist_ok=True)

REMOVE_TAGS = {
    "note",
    "backup",
    "forward",
    "direction",
    "harmony",
    "figured-bass",
}


def tag_endswith(elem, name: str) -> bool:
    return elem.tag.endswith("}" + name) or elem.tag == name


def make_blank_score(src_path: Path, dst_path: Path):
    tree = ET.parse(src_path)
    root = tree.getroot()

    for part in root.findall(".//{*}part"):
        for measure in part.findall("{*}measure"):
            for child in list(measure):
                for name in REMOVE_TAGS:
                    if tag_endswith(child, name):
                        measure.remove(child)
                        break

    for mt in root.findall(".//{*}movement-title"):
        if mt.text:
            mt.text = mt.text + " [Ear Blank]"
        else:
            mt.text = "[Ear Blank]"

    tree.write(dst_path, encoding="utf-8", xml_declaration=True)
    print(f"Generated: {dst_path.name}")


def main():
    xml_files = sorted(SRC_DIR.glob("*.xml")) + sorted(SRC_DIR.glob("*.musicxml"))

    print("Source XML files:", len(xml_files))
    print("SRC_DIR:", SRC_DIR.resolve())
    print("OUT_DIR:", OUT_DIR.resolve())

    if not xml_files:
        print("No source files found.")
        return

    for src in xml_files:
        dst_name = src.stem + "_ear" + src.suffix
        dst = OUT_DIR / dst_name
        make_blank_score(src, dst)


if __name__ == "__main__":
    main()
