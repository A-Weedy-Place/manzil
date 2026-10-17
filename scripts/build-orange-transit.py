"""Derive Orange Line corridors from pinned, public OSM relation ways.

Raw XML stays in ignored .local-tools/transit. This creates a normalized public
derivative, never a timetable. Stop order is derived along connected mapped
busways, not asserted to be an operator-published direction list. See
docs/TRANSIT_SOURCES.md. Python standard library only.
"""

import argparse
import hashlib
import heapq
import json
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


PINNED_SHA256 = "bd7dc7d862b180fd5cb619a181479c0d9cf136bb54dec50620404336621d9c5d"
RELATION_ID = "13911250"
SOURCE_ID = "osm-orange-13911250-v12"


def tags(element):
    return {tag.get("k"): tag.get("v") for tag in element.findall("tag")}


def distance(left, right):
    lon1, lat1 = left
    lon2, lat2 = right
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def derive(raw, retrieved_at, fr12_retrieved_at=None):
    if hashlib.sha256(raw).hexdigest() != PINNED_SHA256:
        raise ValueError("OSM source differs from the reviewed v12 snapshot; review before changing its pin.")
    root = ET.fromstring(raw)
    relation = root.find(f"relation[@id='{RELATION_ID}']")
    if relation is None or relation.get("version") != "12":
        raise ValueError("Expected reviewed Orange Line OSM relation 13911250 version 12.")
    nodes = {node.get("id"): node for node in root.findall("node")}
    coordinates = {
        node_id: [float(node.get("lon")), float(node.get("lat"))]
        for node_id, node in nodes.items()
    }
    ways = {way.get("id"): way for way in root.findall("way")}
    graph = defaultdict(list)
    included_edges = set()
    for member in relation.findall("member"):
        if member.get("type") != "way":
            continue
        way = ways[member.get("ref")]
        attributes = tags(way)
        # Relation v12 contains an unrelated hotel polygon. Keep only mapped
        # highways; never bridge relation gaps, create connectors or snap roads.
        if "highway" not in attributes:
            continue
        sequence = [node.get("ref") for node in way.findall("nd")]
        for left, right in zip(sequence, sequence[1:]):
            length = distance(coordinates[left], coordinates[right])
            if attributes.get("oneway") != "-1":
                graph[left].append((right, length))
                included_edges.add((left, right))
            if attributes.get("oneway") not in ("yes", "1", "true"):
                graph[right].append((left, length))
                included_edges.add((right, left))

    def path(start, end):
        queue, best, previous = [(0, start)], {start: 0}, {}
        while queue:
            length, current = heapq.heappop(queue)
            if length != best[current]:
                continue
            if current == end:
                result = [current]
                while result[-1] != start:
                    result.append(previous[result[-1]])
                return list(reversed(result))
            for neighbour, edge_length in graph[current]:
                candidate = length + edge_length
                if candidate < best.get(neighbour, math.inf):
                    best[neighbour], previous[neighbour] = candidate, current
                    heapq.heappush(queue, (candidate, neighbour))
        raise ValueError(f"No directed OSM corridor from {start} to {end}; do not invent a connector.")

    # Actual tagged platform nodes on the relation's highways. The two unnamed
    # nodes sit at its Faiz Ahmed Faiz terminus. Their display association follows
    # the relation's from=Faiz Ahmed Faiz, not an invented coordinate or bay ID.
    definitions = [
        ("osm-orange-brt-out", "osm-orange-brt", "outbound", "N5 Metro Station",
         ["13043410141", "10826292712", "9182623542", "9182623554", "9182623575", "10825687204", "9182623635", "9182623670"]),
        ("osm-orange-brt-in", "osm-orange-brt", "inbound", "Faiz Ahmed Faiz",
         ["10825690506", "10825690505", "9182623597", "9182623600", "10825690520", "10825690521", "10826292713", "13043410140"]),
        ("osm-orange-airport-out", "osm-orange-airport", "outbound", "NIIA Metro Station",
         ["9182623670", "6323018984"]),
        ("osm-orange-airport-in", "osm-orange-airport", "inbound", "N5 Metro Station",
         ["6323018984", "10825690506"]),
    ]
    stop_ids = set()
    patterns = []
    proof = []
    for pattern_id, route_id, direction_id, headsign, ordered_stops in definitions:
        sequence = path(ordered_stops[0], ordered_stops[-1])
        indexes = [sequence.index(stop) for stop in ordered_stops]
        if indexes != sorted(set(indexes)):
            raise ValueError(f"Stop order does not follow the actual directed OSM corridor: {pattern_id}")
        if any((left, right) not in included_edges for left, right in zip(sequence, sequence[1:])):
            raise ValueError("Derived geometry contains an edge absent from the source relation.")
        cumulative = [0]
        for left, right in zip(sequence, sequence[1:]):
            cumulative.append(cumulative[-1] + distance(coordinates[left], coordinates[right]))
        geometry = {"type": "LineString", "coordinates": [coordinates[node] for node in sequence]}
        patterns.append({
            "id": pattern_id, "routeId": route_id, "directionId": direction_id,
            "headsign": headsign, "stopIds": [f"osm-node-{stop}" for stop in ordered_stops],
            "geometry": geometry, "geometryQuality": "mapped-corridor",
            "stopDistancesMeters": [round(cumulative[index], 3) for index in indexes],
        })
        stop_ids.update(ordered_stops)
        proof.append({"patternId": pattern_id, "vertices": len(sequence), "distanceMeters": round(cumulative[-1], 2)})
    stops = []
    for node_id in sorted(stop_ids, key=int):
        attributes = tags(nodes[node_id])
        if attributes.get("highway") != "bus_stop" or attributes.get("public_transport") != "platform":
            raise ValueError(f"Expected an actual mapped bus platform: {node_id}")
        name = attributes.get("name:en") or attributes.get("name") or "Faiz Ahmed Faiz (Orange platform)"
        stops.append({"id": f"osm-node-{node_id}", "name": name, "coordinate": coordinates[node_id]})
    result = {
        "sources": [{
            "id": SOURCE_ID, "name": "OpenStreetMap Orange Line corridor (relation 13911250 v12)",
            "url": "https://www.openstreetmap.org/relation/13911250",
            "license": "OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
            "retrievedAt": retrieved_at,
            "limitations": [
                "Mapped infrastructure, not live operator status or an operator GTFS timetable.",
                "Stop order is derived along connected relation highway ways respecting one-way tags; the relation has no ordered stop-role members.",
                "The two unnamed Faiz Ahmed Faiz platforms are associated with the relation's named terminus; other stop names retain OSM labels, which may differ from current signage.",
                "BRT versus airport split follows CDA's 9 September 2022 board description; current fare, timetable and through-service are not verified.",
                "Relation v12 was edited 23 August 2026; excluded its unrelated hotel way 1340156666. No disconnected ways are joined by invented lines.",
            ],
        }, {
            "id": "cda-fr12-public-timetable-20250716", "name": "CDA published FR-12 timetable",
            "url": "https://lists.cda.gov.pk/Assets/metro_transit_route/FR-12_Forward.pdf",
            "license": "Official public reference; no open redistribution licence found. Catalogue reference only; PDF not bundled.",
            "retrievedAt": fr12_retrieved_at or retrieved_at,
            "limitations": ["PDF created 16 July 2025 provides ordered stop names and times, but no coordinates or current service validity dates. FR-12 is catalogue-only until independently verified stop locations are obtained."],
        }],
        "routes": [
            {"id": "osm-orange-brt", "shortName": "Orange", "name": "Orange Line — Faiz Ahmed Faiz / N5", "agency": "Capital Development Authority", "color": "#b453cf", "sourceId": SOURCE_ID, "coverage": "stops-and-shape"},
            {"id": "osm-orange-airport", "shortName": "Airport", "name": "Orange airport corridor — N5 / NIIA", "agency": "Capital Development Authority", "color": "#2588c4", "sourceId": SOURCE_ID, "coverage": "stops-and-shape"},
            {"id": "cda-fr12", "shortName": "FR-12", "name": "Taxila Chowk — Tipu Sultan Shaheed Chowk", "agency": "Capital Development Authority", "color": "#9463d6", "sourceId": "cda-fr12-public-timetable-20250716", "coverage": "catalogue-only",
             "unplacedStopNames": ["Taxila Chowk", "University of Wah", "Nawab Abad", "Wah Cantt Barrier No 2", "Gulshan e Anwar", "Jinnah Colony", "New City Phase 01", "Losar Sharfoo", "New City Phase 02", "Bahtar Morh", "Wah Model Town Phase 01", "Wah Model Town Phase 02", "Swedish College", "Malakand Stop", "Basti", "Sabri Gali", "Wah Cantt Barrier 03", "Ahmad Nagar", "Shah Wali Colony Road", "Wah Gardens", "Askari Cement Factory Road", "Dhok Dhollian", "WAPDA Colony", "Hassan Abdal", "Tipu Sultan Shaheed Chowk"]},
        ],
        "stops": stops, "patterns": patterns, "calendars": [], "trips": [],
    }
    return result, proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=".local-tools/transit/orange-relation-13911250.osm")
    parser.add_argument("--output", default="assets/transit/supplement.json")
    parser.add_argument("--retrieved-at", help="UTC retrieval timestamp; defaults to the local source file's UTC modification time")
    parser.add_argument("--fr12-retrieved-at", help="Optional explicit retrieval timestamp for the FR-12 public reference")
    args = parser.parse_args()
    source = Path(args.input)
    retrieved_at = args.retrieved_at or datetime.fromtimestamp(source.stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    # Validate the supplied timestamp instead of silently producing invalid API metadata.
    datetime.fromisoformat(retrieved_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    fr12_source = source.with_name("cda-fr12-forward.pdf")
    fr12_retrieved_at = args.fr12_retrieved_at or (datetime.fromtimestamp(fr12_source.stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if fr12_source.exists() else retrieved_at)
    datetime.fromisoformat(fr12_retrieved_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    result, proof = derive(source.read_bytes(), retrieved_at, fr12_retrieved_at)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(target), "stops": len(result["stops"]), "patterns": proof}))


if __name__ == "__main__":
    main()
