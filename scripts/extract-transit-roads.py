"""Extract a bounded public OSM road graph from a pinned Geofabrik PBF.

Development only: install pyosmium into an ignored directory, never the app.
See docs/TRANSIT_ROAD_ALIGNMENT.md for acquisition, hashes and reproduction.
"""
import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".local-tools/transit/road-alignment/python"))
import osmium


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--sha256", required=True, help="Reviewed exact PBF SHA-256; changed data requires review")
    parser.add_argument("--output", type=Path, default=ROOT / ".local-tools/transit/road-alignment/roads.json.gz")
    args = parser.parse_args()
    with args.input.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != args.sha256:
        raise ValueError("PBF checksum changed; review the public source before importing")
    with osmium.io.Reader(str(args.input)) as reader:
        source_timestamp = reader.header().get("osmosis_replication_timestamp")
    if not source_timestamp:
        raise ValueError("The public PBF must retain its actual OSM replication timestamp")
    # Bounds cover all source stops plus space for legitimate road detours.
    west, south, east, north = 72.60, 33.43, 73.34, 33.81
    ways, relations, nodes = [], [], {}
    class Roads(osmium.SimpleHandler):
        def way(self, way):
            if not way.tags.get("highway"):
                return
            tags = dict(way.tags)
            if not any(n.location.valid() and west <= n.lon <= east and south <= n.lat <= north for n in way.nodes):
                return
            refs = []
            for node in way.nodes:
                if not node.location.valid():
                    raise ValueError("Missing original OSM road node")
                refs.append(node.ref)
                nodes[node.ref] = {"type": "node", "id": node.ref, "lon": node.lon, "lat": node.lat}
            ways.append({"type": "way", "id": way.id, "nodes": refs, "tags": tags})
        def relation(self, relation):
            if relation.tags.get("type") == "restriction":
                relations.append({"type": "relation", "id": relation.id, "tags": dict(relation.tags), "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[member.type], "ref": member.ref, "role": member.role} for member in relation.members]})
    # Location caching runs before this native filter; restriction relations
    # retain their type tag and are not lost while unrelated ways are skipped.
    Roads().apply_file(str(args.input), locations=True, idx="flex_mem", filters=[osmium.filter.KeyFilter("highway", "type")])
    # Preserve barrier/access tags: coordinates alone could silently open gates.
    class NodeTags(osmium.SimpleHandler):
        def node(self, node):
            if node.id in nodes and node.tags:
                nodes[node.id]["tags"] = dict(node.tags)
    # Filter IDs in C++ before invoking Python for millions of unrelated nodes.
    NodeTags().apply_file(str(args.input), filters=[osmium.filter.IdFilter(nodes.keys())])
    way_ids = {way["id"] for way in ways}
    relations = [relation for relation in relations if any(member["type"] == "way" and member["ref"] in way_ids for member in relation["members"])]
    document = {"version": 0.6, "osm3s": {"timestamp_osm_base": source_timestamp, "copyright": "© OpenStreetMap contributors, ODbL 1.0"}, "elements": list(nodes.values()) + ways + relations}
    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
    metadata = {"source": "https://download.geofabrik.de/asia/pakistan.html", "pbfSha256": digest, "bounds": [west, south, east, north], "normalizedRoadsSha256": hashlib.sha256(encoded).hexdigest(), "nodes": len(nodes), "ways": len(ways), "restrictions": len(relations), "parser": "pyosmium 4.1.1 (development only)", "sourceTimestamp": source_timestamp, "retrievedAt": datetime.fromtimestamp(args.input.stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}
    args.output.with_name("source.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
