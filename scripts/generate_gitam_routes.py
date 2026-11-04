#!/usr/bin/env python3
"""Fetch and save four real, closed driving routes around GITAM Vizag.

Waypoint coordinates come from confirmed OpenStreetMap geocoding results or
the documented ICT Bhavan map pin below. The script never fabricates them.
OSRM supplies the full road geometry, saved for the site to load locally.
"""

from __future__ import annotations

import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "data" / "gitam-routes.geojson"
USER_AGENT = "VehicleDigitalTwinStudentProject/1.0 (route geometry generator)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OSRM = "https://router.project-osrm.org/route/v1/driving"

# Nominatim currently does not index this campus building by its common name.
# This published map pin is used only after the script prints the source and
# asks the user to confirm; OSRM then snaps it onto the mapped driving network.
DOCUMENTED_COORDINATES = {
    "ICT Bhavan, GITAM University, Visakhapatnam": {
        "lat": 17.7807,
        "lon": 83.37623,
        "label": "ICT Bhavan, GITAM University (published map pin)",
        "source": "https://india.worldplaces.me/college-and-university-in-visakhapatnam/23100090-ict-bhavan-gitam-university.html",
    }
}

SEARCH_ALIASES = {
    "GITAM University West Gate 3, Visakhapatnam": [
        "West Gate 3 GITAM Visakhapatnam",
        "GITAM West Gate Visakhapatnam",
    ],
    "GITAM University Back Gate, Visakhapatnam": [
        "Back Gate GITAM Visakhapatnam",
        "GITAM Back Gate Rushikonda Visakhapatnam",
    ],
    "GITAM University Front Gate, Visakhapatnam": [
        "Front Gate GITAM Visakhapatnam",
        "GITAM Front Gate Rushikonda Visakhapatnam",
    ],
    "GITAM University Administration Building, Visakhapatnam": [
        "Administration Building GITAM Visakhapatnam",
        "GITAM Administration Visakhapatnam",
    ],
    "GITAM Cricket Stadium, GITAM University, Visakhapatnam": [
        "GITAM Cricket Stadium Visakhapatnam",
        "Cricket Stadium GITAM University",
    ],
    "Beach Road, GITAM University, Visakhapatnam": [
        "Beach Road Rushikonda Visakhapatnam",
        "Vizag Bheemili Beach Road GITAM",
    ],
}

ROUTES = [
    ("project", "ICT Bhavan loop", [
        "ICT Bhavan, GITAM University, Visakhapatnam",
        "GITAM University West Gate 3, Visakhapatnam",
        "ICT Bhavan, GITAM University, Visakhapatnam",
    ]),
    ("fleet-02", "Back Gate and hospital loop", [
        "GITAM University Back Gate, Visakhapatnam",
        "GITAM Hospital, GITAM University, Visakhapatnam",
        "GITAM University Back Gate, Visakhapatnam",
    ]),
    ("fleet-03", "Front Gate, administration and stadium loop", [
        "GITAM University Front Gate, Visakhapatnam",
        "GITAM University Administration Building, Visakhapatnam",
        "GITAM Cricket Stadium, GITAM University, Visakhapatnam",
        "GITAM University Front Gate, Visakhapatnam",
    ]),
    ("fleet-04", "Beach Road loop", [
        "GITAM University Back Gate, Visakhapatnam",
        "Beach Road, GITAM University, Visakhapatnam",
        "GITAM University Front Gate, Visakhapatnam",
        "GITAM University Back Gate, Visakhapatnam",
    ]),
]


def get_json(url: str):
    print(f"GET {url}")
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=35) as response:
        return json.load(response)


def choose_result(query: str, results):
    print(f"\nConfirm the OpenStreetMap result for: {query}")
    for index, item in enumerate(results, 1):
        print(f"  {index}. {item['display_name']} [{item['lat']}, {item['lon']}]")
    while True:
        choice = input("Enter the matching result number (or q to stop): ").strip()
        if choice.lower() == "q":
            raise SystemExit("Stopped before creating routes.")
        if choice.isdigit() and 1 <= int(choice) <= len(results):
            chosen = results[int(choice) - 1]
            break
        print("Enter one of the listed result numbers.")
    print(f"Selected: {chosen['display_name']} ({chosen['lat']}, {chosen['lon']})")
    time.sleep(1.05)  # Nominatim's public service usage policy.
    return {
        "lat": float(chosen["lat"]),
        "lon": float(chosen["lon"]),
        "label": chosen["display_name"],
        "source": f"OpenStreetMap Nominatim ({chosen.get('osm_type', 'place')} {chosen.get('osm_id', '')})",
    }


def geocode(query: str):
    fallback = DOCUMENTED_COORDINATES.get(query)
    if fallback:
        params = urlencode({"q": query, "format": "jsonv2", "limit": 5, "countrycodes": "in"})
        results = get_json(f"{NOMINATIM}?{params}")
        if results:
            return choose_result(query, results)
        print(f"\nNominatim has no exact result for {query!r}.")
        print(f"Published map pin: {fallback['lat']}, {fallback['lon']} — {fallback['source']}")
        answer = input("Use this documented pin as the OSRM waypoint? [Y/n]: ").strip().lower()
        if answer in ("", "y", "yes"):
            return dict(fallback)

    searches = [query, *SEARCH_ALIASES.get(query, [])]
    searched = set()
    while True:
        for search in searches:
            if search in searched or (search == query and fallback):
                continue
            searched.add(search)
            params = urlencode({"q": search, "format": "jsonv2", "limit": 5, "countrycodes": "in"})
            results = get_json(f"{NOMINATIM}?{params}")
            if results:
                return choose_result(search, results)
            time.sleep(1.05)
        print(f"\nNo Nominatim result matched {query!r} or its shorter search phrases.")
        entry = input("Enter another search phrase, or paste a verified lat,lon from a map pin (q to stop): ").strip()
        if entry.lower() == "q":
            raise SystemExit("Stopped before creating routes.")
        try:
            lat_text, lon_text = entry.split(",", 1)
            lat, lon = float(lat_text.strip()), float(lon_text.strip())
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError
            confirmed = input(f"Use the coordinates you supplied ({lat}, {lon})? [y/N]: ").strip().lower()
            if confirmed in ("y", "yes"):
                return {"lat": lat, "lon": lon, "label": f"User-confirmed map pin ({lat}, {lon})", "source": "user-confirmed map pin"}
            continue
        except ValueError:
            pass
        if not entry:
            continue
        if entry:
            searches.append(entry)


def meters_between(a, b):
    radius = 6_371_000
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def route_one(car_id, name, labels, place_cache):
    places = []
    for label in labels:
        if label not in place_cache:
            place_cache[label] = geocode(label)
        places.append(place_cache[label])
    if places[0] != places[-1]:
        raise RuntimeError(f"{name} must end at the same selected place where it starts.")
    coordinate_path = ";".join(f"{place['lon']},{place['lat']}" for place in places)
    params = urlencode({"overview": "full", "geometries": "geojson", "steps": "false", "continue_straight": "false"})
    url = f"{OSRM}/{quote(coordinate_path, safe=';,.-')}?{params}"
    response = get_json(url)
    if response.get("code") != "Ok" or not response.get("routes"):
        raise RuntimeError(f"OSRM could not route {name}: {response.get('message', response.get('code'))}")
    route = response["routes"][0]
    geometry = route["geometry"]
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") != "LineString" or len(coordinates) < 3:
        raise RuntimeError(f"OSRM returned too little geometry for {name}; no route was saved.")
    if meters_between(coordinates[0], coordinates[-1]) > 20:
        raise RuntimeError(f"OSRM returned an open path for {name}; no route was saved.")
    return {
        "type": "Feature",
        "properties": {
            "carId": car_id,
            "name": name,
            "waypoints": [place["label"] for place in places],
            "waypointSources": [place["source"] for place in places],
            "distanceMeters": route["distance"],
            "durationSeconds": route["duration"],
            "source": url,
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
        },
        "geometry": geometry,
    }


def main():
    place_cache = {}
    features = []
    try:
        for car_id, name, labels in ROUTES:
            print(f"\n--- {name} ({car_id}) ---")
            features.append(route_one(car_id, name, labels, place_cache))
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        document = {"type": "FeatureCollection", "features": features}
        OUTPUT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        print(f"\nSaved {len(features)} routed loops to {OUTPUT}")
        print("The website loads this local GeoJSON; it does not call OSRM at runtime.")
        return 0
    except Exception as error:
        print(f"\nRoute generation stopped: {error}")
        print("No partial GeoJSON was written. Correct the place choice or retry when the routing service is reachable.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
