from pathlib import Path
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent.parent

SRC_DIR = BASE_DIR / "xml" / "scores"
OUT_DIR = BASE_DIR / "xml" / "scores_bass"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def tag_endswith(elem, name: str) -> bool:
    return elem.tag.endswith("}" + name) or elem.tag == name


def make_bass_only(src_path: Path, dst_path: Path):
    tree = ET.parse(src_path)
    root = tree.getroot()

    parts = root.findall("{*}part")
    if not parts:
        print("No <part> found in", src_path)
        return

    bass_part = parts[-1]
    bass_id = bass_part.get("id")

    part_list = root.find("{*}part-list")
    if part_list is not None and bass_id is not None:
        for child in list(part_list):
            if tag_endswith(child, "score-part"):
                if child.get("id") != bass_id:
                    part_list.remove(child)

    for p in parts:
        if p is not bass_part:
            root.remove(p)

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
        dst_name = src.stem + "_bass" + src.suffix
        dst = OUT_DIR / dst_name
        make_bass_only(src, dst)


if __name__ == "__main__":
    main()
