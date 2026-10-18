"""Build a scoped comparison from reviewed public authority evidence, offline.

No coordinates, timetables or current operations are invented or overwritten.
Raw pages/PDFs/API responses stay in ignored .local-tools/transit-official/.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def normalize(name):
    # Only punctuation and generic station/stop words; no fuzzy guessed places.
    name = re.sub(r"\b(?:station|stop)\b", "", name.lower())
    return re.sub(r"[^a-z0-9]", "", name)


def distinct_names(sequences):
    result, seen = [], set()
    for sequence in sequences:
        for name in sequence:
            if normalize(name) not in seen:
                result.append(name)
                seen.add(normalize(name))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=ROOT / "assets/transit/islamabad.json.gz")
    parser.add_argument("--cda", type=Path, default=ROOT / "assets/transit/cda-verification.json")
    parser.add_argument("--pma", type=Path, default=ROOT / ".local-tools/transit-official/pma-official-audit.json")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/transit/official-review.json")
    args = parser.parse_args()
    original = gzip.decompress(args.dataset.read_bytes())
    data, cda, pma = json.loads(original), read(args.cda), read(args.pma)
    # Reruns accept the same base plus its own review version, never another feed.
    base_version = data["version"].split("-review-")[0]
    if cda["comparedDatasetVersion"] != base_version or pma["datasetVersion"] != base_version:
        raise ValueError("Authority evidence belongs to another network version")
    if "-review-" not in data["version"] and hashlib.sha256(original).hexdigest() != pma["normalizedDatasetSha256"]:
        raise ValueError("Authority coordinate comparison belongs to different data")
    checked = max(cda["checkedAt"], pma["checkedAt"])
    reviews, additions = {}, []
    for route in cda["routes"]:
        documents = [direction for direction in route["directions"] if direction.get("document")]
        reference = [{"label": "CDA transit portal", "url": cda["portal"]["url"]}]
        reference += [{"label": "CDA " + route["code"] + " · " + direction["label"], "url": direction["url"]} for direction in documents]
        sequences = [sequence for direction in documents for sequence in direction["document"]["stopSequences"]]
        current = route["committedStopSequences"]
        route_id = route.get("committedRouteId")
        status = "reference-only"
        if not documents:
            summary = "The official portal names the restricted diplomatic shuttle but its detail link is disabled. Its stop coordinates and current operations are not confirmed by that page."
            status = "not-established"
        elif route["code"] == "FR-12":
            summary = "Both official PDFs confirm the 25 named stops in this reference. They provide no coordinates or service-validity calendar; FR-12 remains a named reference, without a mapped journey or current timetable."
        elif route["code"] == "FR-05":
            route_id = "cda-fr05-reference"
            additions.append({"id": route_id, "shortName": "FR-05", "name": "NUST Metro — D-12 (CDA document)", "agency": "Capital Development Authority", "color": "#0d9488", "sourceId": "cda-official-catalogue", "coverage": "catalogue-only", "unplacedStopNames": distinct_names(sequences)})
            status = "differences"
            summary = "The official portal and PDF title say Golara Morh–Taxila, but both PDFs list NUST Metro–D-12 stops. This conflicting 2025 document is reference-only; no coordinates, active service or routable alignment are asserted."
        elif route["code"] == "ST-01":
            route_id = "cda-st01-reference"
            additions.append({"id": route_id, "shortName": "ST-01", "name": "PIMS — Daman-e-Koh (CDA reference)", "agency": "Capital Development Authority", "color": "#6366f1", "sourceId": "cda-official-catalogue", "coverage": "catalogue-only", "unplacedStopNames": distinct_names(sequences)})
            summary = "CDA PDFs name 13 outbound and 14 return stops; the schematic identifies weekend service. No coordinates, current service-validity dates or verified present-day operation were established. This remains a reference, not a planned bus journey."
        else:
            normalized_current = sorted(tuple(map(normalize, sequence)) for sequence in current)
            normalized_official = sorted(tuple(map(normalize, sequence)) for sequence in sequences)
            same = normalized_current == normalized_official
            status = "consistent" if same else "differences"
            official_counts = "/".join(str(len(sequence)) for sequence in sequences)
            current_counts = "/".join(str(len(sequence)) for sequence in current)
            summary = ("The ordered stop names agree with the compared official PDFs after punctuation and station/stop-word normalization. " if same else "The official PDF stop lists (" + official_counts + ") differ from the route snapshot (" + current_counts + "); no automatic replacement or current-service conclusion is made. ")
            summary += "These PDFs were created 16 July 2025 and supply no stop coordinates or service-validity calendar. The newer authority announcement gives an aggregate route count, not a current per-route confirmation."
        if not route_id:
            raise ValueError("Unreviewed unmatched official route")
        reviews[route_id] = {"routeId": route_id, "status": status, "summary": summary, "references": reference}

    for route in pma["routes"]:
        counts = "/".join(str(direction["sourceStopCount"]) for direction in route["directions"])
        status = "consistent"
        summary = "Official eTransit directional lists (" + counts + " stop records) match the publisher snapshot's ordered coordinates. This confirms agreement with the published source, not independent field accuracy, route geometry or live bus arrivals. "
        if route["sourceCode"] == "EV05102":
            status = "differences"
            summary += "The return Rahimabad coordinate is also wrong in the official source; it stays unmapped with a non-routable gap. The opposite platform is not substituted. "
        if route["sourceCode"] == "RLRT03":
            status = "differences"
            summary += "IJP/Potohar order contradicts the full PMBS corridor and official map. Both partial patterns are excluded from planning pending correction; this is a source conflict, not an operator suspension. "
        if route["sourceCode"] in {"EV05105", "EV05110", "EV0511A", "RLRT03", "RLRT04"}:
            summary += "Sparse or placeholder-like schedule records do not establish an all-day timetable; ETAs remain unavailable."
        else:
            summary += "Published dated schedule records were inspected but do not independently establish current dispatch or a future service-validity calendar."
        references = [{"label": "Punjab eTransit public route planner", "url": route["url"]}, {"label": "Punjab Masstransit Authority", "url": "https://pma.punjab.gov.pk/"}]
        if route["sourceCode"].startswith("RLRT"):
            references.append({"label": "PMA official PMBS corridor map", "url": "https://pma.punjab.gov.pk/system/files/PMBS1.jpg"})
        reviews[route["routeId"]] = {"routeId": route["routeId"], "status": status, "summary": summary, "references": references}

    for route in data["routes"]:
        if route["id"] in reviews:
            continue
        if route["id"].startswith("osm-orange-"):
            status = "reference-only"
            summary = "The CDA 2022 board record describes the Faiz Ahmed Faiz–N5 and N5–airport grouping. The plotted corridors are an attributed OSM derivative; the authority record does not supply these coordinates, an ordered station list or a current timetable."
            references = [{"label": "CDA September 2022 board record", "url": "https://www.cda.gov.pk/public/Assets/YEAR_2022/9th-Sept-2022.pdf"}]
        else:
            status = "not-established"
            summary = "No matching route-specific entry was established in the inspected CDA portal. The October 2026 announcement mentions 21 operating routes without enumerating their codes. Absence from the older table does not prove this service has stopped; the existing attributed snapshot remains separate."
            references = [{"label": "CDA transit portal", "url": cda["portal"]["url"]}, {"label": "CDA October 2026 service announcement", "url": cda["aggregateOperationEvidence"]["url"]}]
        reviews[route["id"]] = {"routeId": route["id"], "status": status, "summary": summary, "references": references}

    # Export only compact factual comparison evidence; source responses stay ignored.
    compact_pma = {key: pma[key] for key in ["schemaVersion", "checkedAt", "datasetVersion", "normalizedDatasetSha256", "officialDomain", "publicPortal", "accessMethod", "license", "scope", "notVerified", "catalogue", "conflicts"]}
    compact_pma["routes"] = []
    for route in pma["routes"]:
        entry = {key: route[key] for key in ["routeId", "sourceCode", "officialMainRouteId", "lineId", "url", "readOnlyDataRequest", "rawSha256", "reviewStatus"]}
        entry["directions"] = []
        for direction in route["directions"]:
            record = {key: direction[key] for key in ["patternId", "officialDirection", "officialDirectionId", "title", "sourceStopCount", "matchingPublisherCoordinates", "publisherStopCount", "schedule"]}
            usable = [stop["coordinate"] for stop in direction["stops"] if stop["usableInTwinCities"]]
            record["usableCoordinateSha256"] = hashlib.sha256(json.dumps(usable, separators=(",", ":")).encode()).hexdigest()
            record["stopNames"] = [stop["name"] for stop in direction["stops"]]
            record["unusableStops"] = [stop["name"] for stop in direction["stops"] if not stop["usableInTwinCities"]]
            entry["directions"].append(record)
        compact_pma["routes"].append(entry)
    args.output.with_name("pma-verification.json").write_text(json.dumps(compact_pma, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"schemaVersion": 1, "datasetVersion": base_version, "normalizedDatasetSha256": pma["normalizedDatasetSha256"], "checkedAt": checked,
                "evidence": {"cdaSha256": hashlib.sha256(args.cda.read_bytes()).hexdigest(), "pmaAuditSha256": hashlib.sha256(args.pma.read_bytes()).hexdigest()},
                "catalogue": {"sources": [{"id": "cda-official-catalogue", "name": "CDA historical route references", "url": cda["portal"]["url"], "license": "Official public references; no blanket open-data reuse licence identified.", "retrievedAt": checked, "limitations": ["Older official PDFs may conflict with the portal heading or newer services.", "Reference-only names have no guessed stop coordinates, timetable calendar or current operation claim."]}], "routes": additions},
                "reviews": list(reviews.values()),
                "unavailablePatterns": [{"patternId": pattern_id, "reason": "Official partial-Metro stop order conflicts with the full PMBS corridor at IJP/Potohar; this pattern is unavailable until its source order is verified."} for pattern_id in ["vtvpb", "me5tv"]],
                "limitations": ["Official reference checks establish only the stated fields; authority pages are not a blanket certification of all routes, map coordinates, current operation or live arrivals.", "CDA's 2025 PDF lists differ from several newer route snapshots. These conflicts remain visible; outdated sequences are not silently substituted.", "Two inconsistent partial-Metro patterns remain visible for reference but cannot be used in journey planning."]}
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"reviews": len(reviews), "newReferenceRoutes": len(additions), "statuses": {status: sum(review["status"] == status for review in reviews.values()) for status in ["consistent", "differences", "reference-only", "not-established"]}}, indent=2))


if __name__ == "__main__":
    main()
