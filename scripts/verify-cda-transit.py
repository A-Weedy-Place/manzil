"""Read the public CDA transit portal and its published directional PDFs.

Raw downloads remain ignored. The output is verification evidence, never an
instruction to replace newer stops or invent missing coordinates/calendars.
Requires pdfplumber from the bundled Python runtime; other imports are stdlib.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import gzip
import hashlib
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import pdfplumber

PORTAL = "https://www.cda.gov.pk/cdaTransitMap"
PUBLICATION = "https://www.cda.gov.pk/cdaImagesGallery/cda-commitment-for-provision-of-modern-environment-friendly-electric-bus-service-to-address-transpiration-needs-of-citizen-in-islamabad"


def clean(html):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", html)).split())


def code(value):
    value = value.upper().replace("FRB-01", "FRB-1")
    return re.sub(r"^(FR|ST)-0+(?=\d)", r"\1-", value)


def utc_mtime(path):
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def download(url, path):
    if urlparse(url).hostname not in {"www.cda.gov.pk", "lists.cda.gov.pk", "cda.gov.pk"}:
        raise ValueError("This collector accepts CDA public sources only.")
    request = Request(url, headers={"User-Agent": "Manzil public transit reference review (noncommercial research)"})
    with urlopen(request, timeout=60) as response:
        raw = response.read(20_000_001)
        if len(raw) > 20_000_000:
            raise ValueError("Public source exceeds review size limit.")
    path.write_bytes(raw)


def portal_rows(html):
    table = re.search(r"<tbody>(.*?)</tbody>", html, flags=re.S).group(1)
    rows, current = [], None
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table, flags=re.S):
        visible = re.sub(r"<!--.*?-->", "", row, flags=re.S)
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", visible, flags=re.S)
        texts = [clean(cell) for cell in cells]
        if len(cells) >= 6:
            current = {"code": texts[1], "name": texts[2], "directions": []}
            rows.append(current)
            cells, texts = cells[3:], texts[3:]
        if current is None or len(cells) < 3:
            raise ValueError("Unrecognized CDA route-table row; inspect markup before updating.")
        link = re.search(r'href="([^"]+)"', cells[2])
        url = unescape(link.group(1)) if link else None
        current["directions"].append({"label": texts[0], "headway": texts[1], "url": url if url and url.lower().endswith(".pdf") else None})
    return rows


def read_pdf(path, url):
    raw = path.read_bytes()
    with pdfplumber.open(path) as pdf:
        metadata = pdf.metadata
        # Word's PDF can draw long stop names into the arrival-time column.
        # Preserve text-flow order; spatial sorting interleaves final letters
        # into the time and silently loses that named stop.
        text = "\n".join(page.extract_text(use_text_flow=True) or "" for page in pdf.pages)
        pages = len(pdf.pages)
    trips, current = [], None
    for line in text.splitlines():
        trip = re.fullmatch(r"\s*([A-Za-z0-9_-]+)\s+(\d{2}:\d{2}:\d{2})\s*", line)
        if trip and re.search(r"\d", trip.group(1)):
            current = {"id": trip.group(1), "departure": trip.group(2), "stops": []}
            trips.append(current)
            continue
        stop = re.fullmatch(r"(.+?)\s*(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})\s*", line)
        if stop and current is not None:
            current["stops"].append({"name": stop.group(1).strip(), "arrival": stop.group(2), "departure": stop.group(3)})
    declared = re.search(r"Total Trips\s+(\d+)", text)
    short_name = re.search(r"Short Name\s+([^\n]+)", text)
    long_name = re.search(r"Long Name\s+([^\n]+)", text)
    direction = re.search(r"Direction\s+([^\n]+)", text)
    unique_patterns = []
    for trip in trips:
        names = [stop["name"] for stop in trip["stops"]]
        if names and names not in unique_patterns:
            unique_patterns.append(names)
    issues = []
    if declared and int(declared.group(1)) != len(trips):
        issues.append("Parsed trip count differs from PDF-declared total.")
    if not unique_patterns:
        issues.append("No complete named stop sequence parsed; manual review required.")
    return {
        "url": url, "sha256": hashlib.sha256(raw).hexdigest(), "retrievedAt": utc_mtime(path),
        "pdfCreatedAt": metadata.get("CreationDate"), "pdfModifiedAt": metadata.get("ModDate"), "pages": pages,
        "publishedShortName": short_name.group(1).strip() if short_name else None,
        "publishedLongName": long_name.group(1).strip() if long_name else None,
        "publishedDirection": direction.group(1).strip() if direction else None,
        "declaredTrips": int(declared.group(1)) if declared else None, "parsedTrips": len(trips),
        "firstDeparture": min((trip["departure"] for trip in trips), default=None),
        "lastDeparture": max((trip["departure"] for trip in trips), default=None),
        "stopSequences": unique_patterns, "firstTripStopTimes": trips[0]["stops"] if trips else [],
        "coordinateCoverage": "none", "calendarValidity": "not-published", "parseIssues": issues,
    }


def cached_pdf(path, url):
    cache = path.with_suffix(".extract-v2.json")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if cache.exists():
        existing = json.loads(cache.read_text(encoding="utf-8"))
        if existing.get("sha256") == digest:
            existing["retrievedAt"] = utc_mtime(path)
            return existing
    result = read_pdf(path, url)
    cache.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", default=".local-tools/transit-official")
    parser.add_argument("--output", default="assets/transit/cda-verification.json")
    parser.add_argument("--dataset", default="assets/transit/islamabad.json.gz", help="Unreviewed base snapshot to compare")
    parser.add_argument("--checked-at", help="Offset-bearing review instant for a reproducible offline audit")
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    folder = Path(args.raw_dir)
    folder.mkdir(parents=True, exist_ok=True)
    portal = folder / "cda-transit.html"
    if args.fetch:
        download(PORTAL, portal)
    rows = portal_rows(portal.read_text(encoding="utf-8"))
    pending = [(direction["url"], folder / Path(urlparse(direction["url"]).path).name) for route in rows for direction in route["directions"] if direction["url"]]
    if args.fetch:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(download, url, path): (url, path) for url, path in pending}
            for future in concurrent.futures.as_completed(futures):
                url, _ = futures[future]
                try:
                    future.result()
                except Exception as error:
                    print(f"Download failed: {url}: {error}")
    parsed = {}
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(cached_pdf, path, url): url for url, path in pending if path.exists()}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            parsed[url] = future.result()
            print(f"Reviewed {Path(urlparse(url).path).name}", flush=True)
    dataset_path = Path(args.dataset)
    dataset = json.loads(gzip.decompress(dataset_path.read_bytes())) if dataset_path.exists() else {"version": None, "routes": [], "patterns": [], "stops": []}
    by_code = {code(route["shortName"]): route for route in dataset["routes"]}
    stop_by_id = {stop["id"]: stop for stop in dataset["stops"]}
    for route in rows:
        match = by_code.get(code(route["code"]))
        route["committedRouteId"] = match["id"] if match else None
        route["committedName"] = match["name"] if match else None
        route["committedUnplacedStopNames"] = match.get("unplacedStopNames", []) if match else []
        route["reviewStatus"] = "published-reference-only-no-current-route-validity"
        route["currentOperation"] = "not-confirmed-for-this-specific-code"
        route["committedStopSequences"] = [[stop_by_id[stop_id]["name"] for stop_id in pattern["stopIds"]] for pattern in dataset["patterns"] if match and pattern["routeId"] == match["id"]]
        for direction in route["directions"]:
            if direction["url"]:
                source = folder / Path(urlparse(direction["url"]).path).name
                direction["document"] = parsed[direction["url"]] if source.exists() else {"error": "Source download unavailable"}
            else:
                direction["document"] = None
    portal_codes = {code(route["code"]) for route in rows}
    checked_at = args.checked_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if datetime.fromisoformat(checked_at.replace("Z", "+00:00")).tzinfo is None:
        raise ValueError("Review instant must include a timezone")
    evidence = {
        "schemaVersion": 1, "purpose": "official-public-reference-verification-not-a-routing-feed", "checkedAt": checked_at,
        "portal": {"url": PORTAL, "retrievedAt": utc_mtime(portal), "sha256": hashlib.sha256(portal.read_bytes()).hexdigest(), "entries": len(rows), "directionalPdfLinks": len(pending), "coordinatesFound": False, "machineReadableFeedLinked": False},
        "aggregateOperationEvidence": {"url": PUBLICATION, "pageDate": "2026-10-15", "statementDate": "2026-10-14", "electricBusCount": 160, "operatingRouteCount": 21, "doesNotEnumerateRouteCodes": True},
        "comparedDatasetVersion": dataset["version"], "routes": rows,
        "committedCdaCodesAbsentFromPortal": [route["shortName"] for route in dataset["routes"] if route["agency"] == "Capital Development Authority" and code(route["shortName"]) not in portal_codes],
        "limitations": ["The current CDA page's downloadable timetables may be historical; PDF creation dates are evidence of document age, not current route operation.", "No official coordinates, route shapes, feed validity dates or open redistribution licence were found on this portal.", "An aggregate 21 operating electric-route statement does not identify which 21 codes operate or validate every old timetable.", "Stop-name differences can reflect renamed stops, route changes, old abbreviations or source errors; do not overwrite newer data automatically.", "No exact coordinate, path, current fare, service-day calendar or active status is inferred from a schematic map or a named stop alone."]
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(target), "routes": len(rows), "pdfs": len(pending), "parsed": sum(bool(direction.get("document", {}).get("stopSequences")) for route in rows for direction in route["directions"] if direction.get("document")), "unmappedPortalCodes": [route["code"] for route in rows if route["committedRouteId"] is None], "datasetCodesAbsent": evidence["committedCdaCodesAbsentFromPortal"]}))


if __name__ == "__main__":
    main()
