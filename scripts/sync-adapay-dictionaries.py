import io
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote
import xml.etree.ElementTree as ET
import zipfile


BASE_URL = "https://cdn.cloudpnr.com/adapayresource/documents/"
BANK_URL = BASE_URL + quote("Adapay支持银行列表.xlsx")
REGION_URL = BASE_URL + quote("Adapay省市编码（四位）.json")


def download(url):
    return subprocess.check_output(
        ["curl", "--compressed", "-fLsS", "--max-time", "60", url]
    )


def read_banks(content):
    namespace = {"sheet": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    banks = {}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        strings = [
            "".join(node.itertext())
            for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))
        ]
        for filename in sorted(archive.namelist()):
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", filename):
                continue
            rows = ET.fromstring(archive.read(filename)).findall(".//sheet:row", namespace)
            headers = None
            for row in rows:
                cells = {}
                for cell in row.findall("sheet:c", namespace):
                    value = cell.findtext("sheet:v", default="", namespaces=namespace)
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    cells[re.sub(r"\d", "", cell.attrib["r"])] = value.strip()
                if headers is None:
                    headers = {value: column for column, value in cells.items()}
                    continue
                code = cells.get(headers["bank_code"], "")
                name = cells.get(headers["机构名称"], "")
                if not code and not name:
                    continue
                assert re.fullmatch(r"\d{1,8}", code) and name, cells
                banks.setdefault(code.zfill(8), {"value": code.zfill(8), "label": name})
    return list(banks.values())


def main():
    banks = read_banks(download(BANK_URL))
    provinces = json.loads(download(REGION_URL).decode("utf-8-sig"))
    assert len(banks) > 5000
    assert len(provinces) >= 31
    for province in provinces:
        assert re.fullmatch(r"\d{4}", province["value"])
        assert province["title"] and province["cities"]
        for city in province["cities"]:
            assert re.fullmatch(r"\d{4}", city["value"]) and city["title"]
    output = Path(__file__).resolve().parents[1] / "src/data/adapay-settlement.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "sources": {"banks": BANK_URL, "regions": REGION_URL},
        "banks": banks,
        "provinces": provinces,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(banks)} banks and {len(provinces)} provinces: {output}")


if __name__ == "__main__":
    main()