"""Import the licensed public PakBus twin-city subset; raw downloads stay ignored.

Python standard library only. See docs/TRANSIT_DATA.md for provenance and limits.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://pakbus.app/gtfs/"
PALETTE = ["#2563eb", "#16a34a", "#8b5cf6", "#0891b2", "#6366f1", "#0d9488", "#a855f7", "#65a30d", "#0ea5e9", "#7c3aed", "#059669", "#4f46e5", "#c026d3"]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def download(name, directory, limit):
    request = Request(BASE + name, headers={"User-Agent": "Manzil/0.1 (non-commercial transit prototype)", "Accept": "application/json,application/zip"})
    with urlopen(request, timeout=30) as response:
        if response.geturl() != BASE + name:
            raise ValueError("Unexpected data redirect")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Source download exceeds its size limit")
    (directory / name).write_bytes(data)


def seconds(value):
    parts = value.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid GTFS time")
    hour, minute, second = map(int, parts)
    if not (0 <= hour <= 47 and 0 <= minute < 60 and 0 <= second < 60):
        raise ValueError("Unbounded GTFS time")
    return hour * 3600 + minute * 60 + second


def iso_day(value):
    return datetime.strptime(value, "%Y%m%d").strftime("%Y-%m-%d")


def coordinate(stop):
    if stop.get("locationUsable") is not True:
        return None
    lon, lat = stop.get("longitude"), stop.get("latitude")
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) or not math.isfinite(lon + lat):
        return None
    # Reject misplaced coordinates rather than silently moving a stop.
    if not (72.2 <= lon <= 73.8 and 33.2 <= lat <= 34.2):
        return None
    return [lon, lat]


def point_distance(a, b):
    r = math.pi / 180
    return math.hypot((b[0] - a[0]) * math.cos((a[1] + b[1]) / 2 * r), b[1] - a[1]) * r * 6371000


def shape_stop_distances(shape, stops):
    """Monotonic projections; reject shapes whose stop order/location is inconsistent."""
    cumulative = [0.0]
    for a, b in zip(shape, shape[1:]):
        cumulative.append(cumulative[-1] + point_distance(a, b))
    result, minimum = [], 0.0
    for stop in stops:
        best = None
        cosine = math.cos(stop[1] * math.pi / 180)
        for index, (a, b) in enumerate(zip(shape, shape[1:])):
            dx, dy = (b[0] - a[0]) * cosine, b[1] - a[1]
            length2 = dx * dx + dy * dy
            t = min(1, max(0, (((stop[0] - a[0]) * cosine) * dx + (stop[1] - a[1]) * dy) / length2)) if length2 else 0
            distance = cumulative[index] + t * (cumulative[index + 1] - cumulative[index])
            if distance + 5 < minimum:
                continue
            projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            error = point_distance(projected, stop)
            if best is None or error < best[0]:
                best = error, max(minimum, distance)
        if best is None or best[0] > 500:
            return None
        minimum = best[1]
        result.append(round(minimum, 2))
    return result


def build(source_dir, retrieved_at):
    listing = read_json(source_dir / "feeds.json")
    feed = next(feed for feed in listing["feeds"] if feed["source"] == "pakbus" and feed["status"] == "available")
    archive_bytes = (source_dir / "pakbus.zip").read_bytes()
    catalogue_bytes = (source_dir / "catalogue.json").read_bytes()
    if sha(archive_bytes) != feed["sha256"] or sha(catalogue_bytes) != listing["catalogue"]["sha256"]:
        raise ValueError("Source SHA-256 does not match the feed listing")
    catalogue = json.loads(catalogue_bytes)
    if catalogue.get("realtime") is not False:
        raise ValueError("Unexpected source format")
    selected = [route for route in catalogue["routes"] if route["city"] == "Rawalpindi"]
    if not selected:
        raise ValueError("Twin-city route catalogue is empty")
    route_ids = {route["id"] for route in selected}
    with ZipFile(io.BytesIO(archive_bytes)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 30_000_000 or len(archive.infolist()) > 40:
            raise ValueError("GTFS archive exceeds import bounds")

        def table(name):
            return list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"), newline=""))) if name in archive.namelist() else []

        agencies = {row["agency_id"]: row["agency_name"] for row in table("agency.txt")}
        gtfs_routes = {row["route_id"]: row for row in table("routes.txt") if row["route_id"] in route_ids}
        pattern_metadata = {row["pattern_id"]: row for row in table("pakbus_patterns.txt") if row["route_id"] in route_ids}
        shapes = {}
        shape_ids = {row["shape_id"] for row in pattern_metadata.values() if row["shape_id"]}
        for row in table("shapes.txt"):
            if row["shape_id"] in shape_ids:
                point = [float(row["shape_pt_lon"]), float(row["shape_pt_lat"])]
                if not all(map(math.isfinite, point)) or not (72.2 <= point[0] <= 73.8 and 33.2 <= point[1] <= 34.2):
                    raise ValueError("Shape outside the supported twin-city region")
                shapes.setdefault(row["shape_id"], []).append((int(row["shape_pt_sequence"]), point))
        shapes = {key: [point for _, point in sorted(points)] for key, points in shapes.items()}
        stops, patterns, routes, rejected_shapes = {}, [], [], []
        for index, route in enumerate(sorted(selected, key=lambda route: (route["code"], route["id"]))):
            route_patterns = []
            for direction in route["directions"]:
                metadata = pattern_metadata[direction["id"]]
                usable = [(i, stop, coordinate(stop)) for i, stop in enumerate(direction["stops"]) if coordinate(stop) is not None]
                if len(usable) < 2:
                    continue
                for _, stop, point in usable:
                    record = {"id": stop["id"], "name": stop["name"], "coordinate": point}
                    if stop["id"] in stops and stops[stop["id"]] != record:
                        raise ValueError("Conflicting stop identity")
                    stops[stop["id"]] = record
                stop_ids = [stop["id"] for _, stop, _ in usable]
                blocked = set(direction.get("blockedSegments", []))
                breaks = [i for i in range(len(usable) - 1) if usable[i + 1][0] != usable[i][0] + 1 or any(j in blocked for j in range(usable[i][0], usable[i + 1][0]))]
                points = [point for _, _, point in usable]
                supplied_shape = shapes.get(metadata["shape_id"])
                distances = shape_stop_distances(supplied_shape, points) if supplied_shape and not breaks else None
                if supplied_shape and distances is None:
                    rejected_shapes.append(direction["id"])
                geometry = {"type": "LineString", "coordinates": supplied_shape if distances is not None else points}
                pattern = {"id": direction["id"], "routeId": route["id"], "directionId": metadata["direction_id"], "headsign": direction["name"], "stopIds": stop_ids,
                           "geometry": geometry, "geometryQuality": "provided-shape" if distances is not None else "stops-only"}
                if distances is not None:
                    pattern["stopDistancesMeters"] = distances
                if breaks:
                    pattern["breakAfterStopIndexes"] = breaks
                    groups, start = [], 0
                    for cut in breaks + [len(points) - 1]:
                        part = points[start:cut + 1]
                        if len(part) >= 2:
                            groups.append({"type": "LineString", "coordinates": part})
                        start = cut + 1
                    pattern["geometrySegments"] = groups
                missing = [stop["name"] for stop in direction["stops"] if coordinate(stop) is None]
                if missing:
                    pattern["unplacedStops"] = missing
                if metadata.get("restricted_access") == "1" or metadata.get("women_only") == "1" or route.get("womenOnly"):
                    pattern["restrictedAccess"] = True
                patterns.append(pattern)
                route_patterns.append(pattern)
            gtfs_route = gtfs_routes[route["id"]]
            routes.append({"id": route["id"], "shortName": route["code"], "name": route["name"], "agency": agencies[gtfs_route["agency_id"]], "sourceId": "pakbus-2026-10-17" if catalogue["asOf"] == "2026-10-17" else "pakbus-" + catalogue["asOf"], "color": PALETTE[index % len(PALETTE)],
                           "coverage": "stops-and-shape" if any(p["geometryQuality"] == "provided-shape" for p in route_patterns) else "stops-only" if route_patterns else "catalogue-only"})
        patterns_by_id = {pattern["id"]: pattern for pattern in patterns}
        raw_trips = {row["trip_id"]: row for row in table("trips.txt") if row["route_id"] in route_ids}
        times = {}
        for row in table("stop_times.txt"):
            if row["trip_id"] in raw_trips:
                times.setdefault(row["trip_id"], []).append(row)
        trips = []
        for trip_id, trip in raw_trips.items():
            # Source IDs encode route:pattern:calendar:start; the explicit custom
            # pattern table and ordered stop identity are checked independently.
            pattern_id = trip_id.split(":")[1]
            pattern = patterns_by_id.get(pattern_id)
            ordered = sorted(times.get(trip_id, []), key=lambda row: int(row["stop_sequence"]))
            if not pattern or [row["stop_id"] for row in ordered] != pattern["stopIds"]:
                raise ValueError("Trip stop order does not match its source pattern")
            values = [[seconds(row["arrival_time"]), seconds(row["departure_time"])] for row in ordered]
            previous = -1
            for arrival, departure in values:
                if arrival < previous or departure < arrival:
                    raise ValueError("Nonmonotonic timetable")
                previous = departure
            trips.append({"id": trip_id, "patternId": pattern_id, "serviceId": trip["service_id"], "times": values,
                          "pickupAllowed": [row["pickup_type"] == "0" for row in ordered], "dropOffAllowed": [row["drop_off_type"] == "0" for row in ordered], "timepoint": [row["timepoint"] == "1" for row in ordered]})
        used_calendars = {trip["serviceId"] for trip in trips}
        exceptions = {}
        for row in table("calendar_dates.txt"):
            exceptions.setdefault(row["service_id"], []).append({"date": iso_day(row["date"]), "added": row["exception_type"] == "1"})
        weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        calendars = [{"id": row["service_id"], "startDate": iso_day(row["start_date"]), "endDate": iso_day(row["end_date"]), "weekdays": [i for i, day in enumerate(weekdays) if row[day] == "1"], "exceptions": exceptions.get(row["service_id"], [])} for row in table("calendar.txt") if row["service_id"] in used_calendars]
    source = {"id": "pakbus-" + catalogue["asOf"], "name": "PakBus · " + catalogue["asOf"], "url": "https://pakbus.app/data", "license": "Non-commercial educational/app use permitted; obtain publisher permission for commercial use.", "retrievedAt": retrieved_at,
              "limitations": ["Community-published operator-derived snapshot, not a live vehicle or independently verified operating-service feed.", "Timetable intermediate stops are distance-derived estimates; first-stop departures are source timepoints.", "Only supplied shapes with consistent stop projections are treated as mapped route geometry; other lines are dashed stop-order schematics.", "Missing/misplaced coordinates remain unmapped, and known source breaks cannot be crossed."]}
    limitations = ["Islamabad–Rawalpindi published subset; informal private vans and all new/unlisted services are not comprehensively covered.", "No live bus locations or automatic Champ Alerts service-closure interpretation. Reviewed service notices are separate.", "Walking connectors are straight-line estimates and are not validated pedestrian directions.", "GTFS service dates: " + feed["startDate"] + " to " + feed["endDate"] + "; no guaranteed service outside published dates."]
    if rejected_shapes:
        limitations.append("Rejected inconsistent supplied shapes for patterns: " + ", ".join(rejected_shapes))
    dataset = {"version": "pakbus-" + catalogue["asOf"] + "-" + feed["sha256"][:12], "importedAt": retrieved_at, "sources": [source], "routes": routes, "stops": sorted(stops.values(), key=lambda stop: stop["id"]), "patterns": patterns, "calendars": calendars, "trips": trips, "limitations": limitations}
    provenance = {"catalogueSha256": sha(catalogue_bytes), "gtfsSha256": sha(archive_bytes), "feedDate": catalogue["asOf"], "serviceFrom": feed["startDate"], "serviceUntil": feed["endDate"], "routeCount": len(routes), "patternCount": len(patterns), "mappedPatternCount": sum(p["geometryQuality"] == "provided-shape" for p in patterns), "stopCount": len(stops), "tripCount": len(trips), "rejectedShapeIds": rejected_shapes}
    return dataset, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".local-tools/transit")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/transit/islamabad.json.gz")
    parser.add_argument("--download", action="store_true", help="Download the publisher's fixed public URLs")
    parser.add_argument("--supplement", type=Path, help="Reviewed source-attributed normalized additions")
    parser.add_argument("--official-review", type=Path, help="Scoped authority comparison bound to this base dataset version")
    parser.add_argument("--road-alignment", type=Path, help="Reviewed precomputed OSM bus-road derivative bound to the exact reviewed base")
    parser.add_argument("--retrieved-at", help="UTC source retrieval instant; retained on unchanged re-import")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    if args.download:
        download("feeds.json", args.source_dir, 100_000)
        download("catalogue.json", args.source_dir, 5_000_000)
        download("pakbus.zip", args.source_dir, 16_000_000)
    retrieved = args.retrieved_at or datetime.fromtimestamp((args.source_dir / "feeds.json").stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    dataset, provenance = build(args.source_dir, retrieved)
    if args.supplement:
        supplement = read_json(args.supplement)
        for key in ["sources", "routes", "stops", "patterns", "calendars", "trips"]:
            old_ids = {record["id"] for record in dataset[key]}
            for record in supplement.get(key, []):
                if record["id"] in old_ids:
                    raise ValueError("Conflicting supplemental record ID")
                dataset[key].append(record)
        dataset["limitations"].extend(supplement.get("limitations", []))
        provenance["supplementSha256"] = sha(args.supplement.read_bytes())
        dataset["version"] += "-" + provenance["supplementSha256"][:8]
    if args.official_review:
        review = read_json(args.official_review)
        if review["datasetVersion"] != dataset["version"]:
            raise ValueError("Official review belongs to a different dataset snapshot")
        base_bytes = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if review.get("normalizedDatasetSha256") != sha(base_bytes):
            raise ValueError("Official review does not match the exact normalized base data")
        catalogue = review.get("catalogue", {})
        for key in ["sources", "routes"]:
            known_ids = {record["id"] for record in dataset[key]}
            for record in catalogue.get(key, []):
                if record["id"] in known_ids:
                    raise ValueError("Duplicate official catalogue reference")
                if key == "routes" and (record.get("coverage") != "catalogue-only" or not 2 <= len(record.get("unplacedStopNames", [])) <= 100):
                    raise ValueError("Official reference additions cannot invent mapped services")
                dataset[key].append(record)
                known_ids.add(record["id"])
        route_by_id = {route["id"]: route for route in dataset["routes"]}
        seen = set()
        official_hosts = {"cda.gov.pk", "lists.cda.gov.pk", "pma.punjab.gov.pk", "etransit.punjab.gov.pk", "transport.punjab.gov.pk", "punjab.gov.pk", "cmta.pk"}
        for item in review["reviews"]:
            if item["routeId"] not in route_by_id or item["routeId"] in seen:
                raise ValueError("Unknown or duplicate officially compared route")
            seen.add(item["routeId"])
            if item["status"] not in {"consistent", "differences", "reference-only", "not-established"} or not 1 <= len(item["summary"]) <= 2000:
                raise ValueError("Invalid official comparison scope")
            checked = datetime.fromisoformat(review["checkedAt"].replace("Z", "+00:00"))
            if checked.tzinfo is None or not 1 <= len(item["references"]) <= 6:
                raise ValueError("Official comparison needs a date and references")
            for reference in item["references"]:
                parsed = urlparse(reference["url"])
                if parsed.scheme != "https" or not parsed.hostname or parsed.hostname.removeprefix("www.") not in official_hosts or parsed.username or parsed.password or parsed.port or not 1 <= len(reference["label"]) <= 180 or len(reference["url"]) > 1500:
                    raise ValueError("Official references must link directly to reviewed authorities")
            route_by_id[item["routeId"]]["officialReview"] = {"checkedAt": review["checkedAt"], "status": item["status"], "summary": item["summary"], "references": item["references"]}
        patterns = {pattern["id"]: pattern for pattern in dataset["patterns"]}
        for conflict in review.get("unavailablePatterns", []):
            pattern = patterns.get(conflict["patternId"])
            if not pattern or not 1 <= len(conflict["reason"].strip()) <= 1000 or route_by_id[pattern["routeId"]].get("officialReview", {}).get("status") != "differences":
                raise ValueError("Source-conflict exclusions require a reviewed known pattern")
            pattern["routingUnavailableReason"] = conflict["reason"]
        dataset["limitations"].extend(review.get("limitations", []))
        provenance["officialReviewSha256"] = sha(args.official_review.read_bytes())
        dataset["version"] += "-review-" + provenance["officialReviewSha256"][:8]
    if args.road_alignment:
        alignment_bytes = args.road_alignment.read_bytes()
        alignment = json.loads(gzip.decompress(alignment_bytes))
        base_bytes = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if alignment["baseVersion"] != dataset["version"] or alignment["baseNormalizedSha256"] != sha(base_bytes):
            raise ValueError("Road alignment belongs to a different exact reviewed base; regenerate after source changes")
        updates = {pattern["id"]: pattern for pattern in alignment["patterns"]}
        original = {pattern["id"]: pattern for pattern in dataset["patterns"]}
        refined = {pattern["id"]: pattern for pattern in alignment.get("refinedSupplied", [])}
        if any(original.get(pattern_id) != record or record["geometryQuality"] != "provided-shape" for pattern_id, record in refined.items()):
            raise ValueError("Refined supplied geometry must retain its exact original source evidence")
        expected_updates = {pattern["id"] for pattern in dataset["patterns"] if pattern["geometryQuality"] == "stops-only"} | set(refined)
        if len(updates) != len(alignment["patterns"]) or set(updates) != expected_updates:
            raise ValueError("Road alignment must explicitly account for every schematic and reviewed sparse source pattern only")
        keys = ["geometry", "geometryQuality", "geometrySourceId", "geometrySegments", "roadSegments", "roadAlignment", "breakAfterStopIndexes", "stopDistancesMeters"]
        for pattern_id, update in updates.items():
            old = original[pattern_id]
            if update["stopIds"] != old["stopIds"] or update["routeId"] != old["routeId"] or update["geometryQuality"] != "road-aligned-estimate" or not set(old.get("breakAfterStopIndexes", [])).issubset(update["breakAfterStopIndexes"]):
                raise ValueError("Road alignment cannot change source stop identity/order or remove documented gaps")
            for key in keys:
                old[key] = update[key]
        if alignment["source"]["id"] in {source["id"] for source in dataset["sources"]}:
            raise ValueError("Duplicate road alignment source")
        dataset["sources"].append(alignment["source"])
        original_display_limit = "Only supplied shapes with consistent stop projections are treated as mapped route geometry; other lines are dashed stop-order schematics."
        current_display_limit = "Publisher-supplied geometry remains source evidence; Manzil displays separately attributed precomputed bus-road estimates for legacy stop-order schematics and reviewed sparse shapes. Unresolved links remain gaps, not straight connectors."
        for source in dataset["sources"]:
            source["limitations"] = [current_display_limit if text == original_display_limit else text for text in source.get("limitations", [])]
        dataset["limitations"].append("Some bus geometry is a precomputed OSM bus-road alignment estimate through ordered stops, not an operator-approved street trace. Unresolved/source gaps remain unavailable; road clearance cannot be independently certified.")
        provenance["roadAlignmentSha256"] = sha(alignment_bytes)
        provenance["roadAlignment"] = alignment["summary"]
        dataset["version"] += "-roads-" + provenance["roadAlignmentSha256"][:8]
    encoded = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as output:
        with gzip.GzipFile(fileobj=output, filename="", mode="wb", mtime=0) as zipped:
            zipped.write(encoded)
    provenance.update({"normalizedSha256": sha(encoded), "compressedBytes": args.output.stat().st_size, "normalizedBytes": len(encoded), "importedAt": retrieved,
                       "combinedRouteCount": len(dataset["routes"]), "combinedPatternCount": len(dataset["patterns"]), "combinedStopCount": len(dataset["stops"]),
                       "mappedCorridorPatternCount": sum(pattern["geometryQuality"] == "mapped-corridor" for pattern in dataset["patterns"])})
    args.output.with_name("provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
