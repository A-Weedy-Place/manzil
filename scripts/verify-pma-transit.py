"""Reproduce the reviewed PMA public-directory audit, without runtime polling.

Python standard library only. Exact public requests and reviewed response hashes
are pinned below; changed authority data requires another deliberate review.
Raw responses remain ignored. See docs/data-sources/PMA_TRANSIT_VERIFICATION.md.
"""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
API = "https://etransit.punjab.gov.pk/repo/backend/public/api/home-page/get-line-schedules"
DIRECTORY = "https://etransit.punjab.gov.pk/repo/backend/public/api/home-page/districts-with-lines?page=planner"
PUBLISHER_SHA = "8fe797dd1bc770f0f7ca6284a94af5ab685d7c7f92b8cc529ab6f0516c9b90cd"
DIRECTORY_SHA = "d67e4331ed831703b1f78120907f469e135241b750b8ea9a28a486c8c9f9de5a"
# Exact entries exposed by the public Rawalpindi directory, not guessed IDs.
ROUTES = [
    (91, "bhtqx", "63726b2c79a46eb20fc874940e80de33e01532cb67832f4e2c735f4de2a016b2"),
    (92, "bbjvx", "bebaeee50f2c062312a1529698b98618d00df478030b02846f155b9c0ee77ebb"),
    (93, "y86sm", "dd4a2abd7fe0e28b6128223e6eecb0a2eb3957cbb4373e24b3418dd6f46c5244"),
    (94, "p4bp5", "a60bb18194c6fe7543be99b70f7ecf5ba175ba7d8e142f9acbc9060ef9676bef"),
    (99, "dfneb", "cfaeb8d32e4241513c89286ee6d97b67636b091df36c4cfd0820b2285ed02e66"),
    (100, "ch88m", "0f2642cb584d4edc06544f0a6167eab39d5ffba2e9a80161a62214de97e86f3a"),
    (172, "ja8z3", "5423f8f0c92118c76279a057c6eb01629e412254a9ee773a7b5bb46f262d0f01"),
    (136, "rqq4r", "e62ac020d639ab8a1be4434c8e6f44f1610903ac76fcb2129529d58338fee3f7"),
    (537, "csvb2", "68e7e0da05a6ae98363581c1bf5f88bd96d41fcdef27ae1cc509d6da560eb9fd"),
    (538, "cdghm", "e4358d7d6c07bba09468ab777fda5dcb60bd845fbab03c2e7143dee9f94dc70e"),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked(raw, expected, label):
    if sha(raw) != expected:
        raise ValueError(label + " changed from the reviewed snapshot; review it before changing a checksum")
    return json.loads(raw.decode("utf-8-sig"))


def bounded_read(path, limit):
    if path.stat().st_size > limit:
        raise ValueError("Local source exceeds its reviewed size limit")
    return path.read_bytes()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def download(directory, name, url, expected, limit, body=None):
    # Both URLs and every request ID are constants verified against the official
    # public web client. No caller-supplied URL, auth header or key is accepted.
    if url not in {DIRECTORY, API}:
        raise ValueError("Only the two reviewed public URLs may be fetched")
    headers = {"User-Agent": "Manzil/0.1 (non-commercial public transit source review)", "Accept": "application/json"}
    payload = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")
    request = Request(url, data=payload, headers=headers)
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        if response.geturl() != url or response.status != 200:
            raise ValueError("Unexpected authority response or redirect")
        if "application/json" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("Authority response is not JSON")
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Authority response exceeds its reviewed size limit")
    checked(raw, expected, name)
    # Do not replace a captured snapshot unless the complete body matches.
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(raw)


def coordinate(stop):
    values = [float(stop["longitude"]), float(stop["latitude"])]
    if not all(math.isfinite(value) for value in values) or not -180 <= values[0] <= 180 or not -90 <= values[1] <= 90:
        raise ValueError("Invalid published coordinate")
    return values


def source_files(source_dir):
    return [source_dir / "etransit-public-planner.json"] + [source_dir / ("etransit-route-" + str(official_id) + ".json") for official_id, _, _ in ROUTES]


def build(source_dir, dataset_path, publisher_path, checked_at):
    compressed = bounded_read(dataset_path, 5_000_000)
    # Bound the decompressed asset too; do not unboundedly expand an archive.
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        normalized = stream.read(8_000_001)
    if len(normalized) > 8_000_000:
        raise ValueError("Normalized dataset exceeds its size limit")
    network = json.loads(normalized)
    if "-review-" in network["version"]:
        raise ValueError("Pass an unreviewed base dataset, before --official-review, to bind independent evidence")
    publisher = checked(bounded_read(publisher_path, 5_000_000), PUBLISHER_SHA, "Publisher catalogue")
    catalogue = {route["id"]: route for route in publisher["routes"]}
    normalized_routes = {route["id"]: route for route in network["routes"]}
    directory_raw = bounded_read(source_dir / "etransit-public-planner.json", 2_000_000)
    directory = checked(directory_raw, DIRECTORY_SHA, "Official public route directory")
    if directory.get("code") != 200 or directory.get("success") is not True:
        raise ValueError("The public directory did not report success")
    public_routes = [route for route in directory["data"]["routes"] if route["line_id"] in [26, 30]]
    if {route["id"] for route in public_routes} != {entry[0] for entry in ROUTES}:
        raise ValueError("The reviewed Rawalpindi directory entries changed")
    if not checked_at:
        checked_at = datetime.fromtimestamp(max(path.stat().st_mtime for path in source_files(source_dir)), timezone.utc).isoformat()
    instant = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
    if instant.tzinfo is None:
        raise ValueError("--checked-at must include a time-zone offset")
    audit = {
        "schemaVersion": 1, "checkedAt": checked_at, "reviewDatePkt": "2026-10-18",
        "datasetVersion": network["version"], "normalizedDatasetSha256": sha(normalized),
        "officialDomain": "https://pma.punjab.gov.pk", "publicPortal": "https://etransit.punjab.gov.pk/public/route-planner?city=97",
        "accessMethod": "Unauthenticated public homepage/planner requests explicitly used by the publisher web client; no login, keys or bypass.",
        "license": "No bulk redistribution/open-data licence identified; this is a source-verification audit, not operator GTFS or a live service certificate.",
        "scope": ["route endpoints", "ordered source stop names", "coordinates as published including defects", "returned-date schedule summaries only"],
        "notVerified": ["physical platform placement", "street geometry", "actual vehicle operation", "real-time arrivals", "future schedule validity"],
        "catalogue": {"url": DIRECTORY, "sha256": sha(directory_raw), "districtId": 97, "evLineId": 26, "metroLineId": 30, "rawalpindiRouteCount": len(public_routes)},
        "routes": [], "conflicts": [
            {"id": "ev2-rahimabad-return", "routeId": "bbjvx", "patternId": "eqyn8", "officialRouteId": 140, "officialStopId": 2061, "officialSequence": 9, "coordinate": [74.236084, 31.44535], "status": "official-source-defect-persists", "action": "Retain excluded/unplaced stop and routing gap. Opposite-direction stop2059 is not a verified replacement."},
            {"id": "rlrt03-stop-order", "routeId": "csvb2", "patternIds": ["vtvpb", "me5tv"], "officialMainRouteId": 537, "status": "official-source-conflicts-with-full-corridor", "action": "Partial service places IJP/Potohar in opposite order to full PMBS136 and official PMBS map. Exclude partial-service journey planning pending verification rather than guess a reordered route."},
        ],
    }
    for official_id, route_id, expected_sha in ROUTES:
        route = catalogue[route_id]
        if normalized_routes.get(route_id, {}).get("shortName") != route["code"]:
            raise ValueError("Reviewed publisher route is missing or changed in --dataset")
        raw = bounded_read(source_dir / ("etransit-route-" + str(official_id) + ".json"), 5_000_000)
        response = checked(raw, expected_sha, "Official route " + str(official_id))
        if response.get("code") != 200 or response.get("success") is not True or set(response["data"]) != {"forward", "backward"}:
            raise ValueError("Official route did not supply both successful public directions")
        line = 26 if route["code"].startswith("EV") else 30
        entry = {"routeId": route_id, "sourceCode": route["code"], "officialMainRouteId": official_id, "lineId": line, "url": "https://etransit.punjab.gov.pk/public/route-planner?city=97&line=" + str(line), "readOnlyDataRequest": {"method": "POST", "url": API, "body": {"line_id": line, "main_route_id": official_id}}, "rawSha256": sha(raw), "reviewStatus": "official-stop-records-match-publisher-snapshot", "directions": []}
        used_patterns = set()
        for label, part in response["data"].items():
            stops = part["stops"]
            if str(part["route_main_id"]) != str(official_id) or part["type"] != label or not 2 <= len(stops) <= 100:
                raise ValueError("Invalid official direction identity/count")
            first = coordinate(stops[0])
            pattern = min(route["directions"], key=lambda candidate: sum((candidate["stops"][0][key] - first[index]) ** 2 for index, key in enumerate(["longitude", "latitude"])))
            if pattern["id"] in used_patterns:
                raise ValueError("Ambiguous direction association")
            used_patterns.add(pattern["id"])
            exact = sum(all(abs(coordinate(official)[index] - published[key]) < 1e-7 for index, key in enumerate(["longitude", "latitude"])) for official, published in zip(stops, pattern["stops"]))
            if len(stops) != len(pattern["stops"]) or exact != len(stops):
                raise ValueError("Ordered coordinate disagreement requires a new source review")
            if [int(stop["sequence"]) for stop in stops] != list(range(len(stops))):
                raise ValueError("Official stop sequence is incomplete")
            times = [time["start_time"] for time in stops[0].get("timings", [])]
            if any(datetime.fromisoformat(time).date().isoformat() != "2026-10-18" for time in times):
                raise ValueError("Dated source schedule changed from the reviewed snapshot")
            direction = {"patternId": pattern["id"], "officialDirection": label, "officialDirectionId": part["id"], "title": part["route_long_name"], "sourceStopCount": len(stops), "matchingPublisherCoordinates": exact, "publisherStopCount": len(pattern["stops"]), "schedule": {"returnedDate": "2026-10-18", "count": len(times), "first": times[0] if times else None, "last": times[-1] if times else None, "firstExamples": times[:3], "confidence": "Publisher records only; not real-time or complete-service guarantee"}, "stops": [{"officialStopId": stop["id"], "name": stop["name"], "sequence": int(stop["sequence"]), "coordinate": coordinate(stop), "usableInTwinCities": 72 <= coordinate(stop)[0] <= 74 and 33 <= coordinate(stop)[1] <= 34.5} for stop in stops]}
            if len(times) <= 2:
                direction["schedule"]["warning"] = "Sparse/suspicious placeholder-like records. Keep untimed rather than infer all-day service."
            if official_id == 537:
                direction["warning"] = "IJP/Potohar order conflicts with full corridor source136 and official PMBS map."
            if official_id == 92 and label == "backward":
                direction["warning"] = "Rahimabad Down2061 remains a far-away Lahore coordinate; preserve gap."
            entry["directions"].append(direction)
        audit["routes"].append(entry)
    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".local-tools/transit-official")
    parser.add_argument("--dataset", type=Path, default=ROOT / "assets/transit/islamabad.json.gz", help="Unreviewed normalized base dataset to bind, before official-review additions")
    parser.add_argument("--publisher-catalogue", type=Path, default=ROOT / ".local-tools/transit/catalogue.json")
    parser.add_argument("--checked-at", help="Offset-bearing review instant; defaults to latest raw response file mtime")
    parser.add_argument("--output", type=Path, help="Defaults to SOURCE-DIR/pma-official-audit.json")
    parser.add_argument("--download", action="store_true", help="Fetch only the pinned public directory and ten reviewed read-only route requests")
    args = parser.parse_args()
    if args.download:
        download(args.source_dir, "etransit-public-planner.json", DIRECTORY, DIRECTORY_SHA, 2_000_000)
        for official_id, route_id, expected_sha in ROUTES:
            line = 26 if official_id in {91, 92, 93, 94, 99, 100, 172} else 30
            download(args.source_dir, "etransit-route-" + str(official_id) + ".json", API, expected_sha, 5_000_000, {"line_id": line, "main_route_id": official_id})
    audit = build(args.source_dir, args.dataset, args.publisher_catalogue, args.checked_at)
    output = args.output or args.source_dir / "pma-official-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    directions = [direction for route in audit["routes"] for direction in route["directions"]]
    print(json.dumps({"routes": len(audit["routes"]), "directions": len(directions), "stopOccurrences": sum(direction["sourceStopCount"] for direction in directions), "matchingCoordinates": sum(direction["matchingPublisherCoordinates"] for direction in directions), "datasetVersion": audit["datasetVersion"], "normalizedDatasetSha256": audit["normalizedDatasetSha256"], "auditSha256": sha(output.read_bytes())}, indent=2))


if __name__ == "__main__":
    main()
