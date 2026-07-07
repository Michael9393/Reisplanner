import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TripData } from "../hooks/useTripData";
import { useUIStore } from "../state/ui";
import { addDays, formatDayMonthNL } from "../domain/dates";
import { STATUS_COLOR, StatusBadge } from "./shared";
import { STATUSES } from "../domain/types";

/**
 * MapContainer-props gelden alleen bij initialisatie; dit child centreert de
 * kaart opnieuw wanneer de bestemmingsset verandert (bijvoorbeeld na import).
 */
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(latLngBounds(positions), { padding: [40, 40] });
    }
    // `key` vat de posities samen; positions zelf krijgt elke render een
    // nieuwe identiteit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export function MapView({ data }: { data: TripData }) {
  const { destinations, segments } = data;
  const { setTab, setEditingDestinationId } = useUIStore();

  const destinationById = useMemo(
    () => new Map(destinations.map((d) => [d.id, d])),
    [destinations],
  );

  // Routelijn volgt de segmentvolgorde; opeenvolgende gelijke bestemmingen
  // leveren maar één punt op.
  const routePoints = useMemo(() => {
    const points: [number, number][] = [];
    let previousId: string | null = null;
    for (const segment of segments) {
      if (segment.destinationId === previousId) continue;
      const dest = destinationById.get(segment.destinationId);
      if (dest) points.push([dest.coords.lat, dest.coords.lng]);
      previousId = segment.destinationId;
    }
    return points;
  }, [segments, destinationById]);

  const segmentsByDestination = useMemo(() => {
    const result = new Map<string, typeof segments>();
    for (const segment of segments) {
      const list = result.get(segment.destinationId) ?? [];
      list.push(segment);
      result.set(segment.destinationId, list);
    }
    return result;
  }, [segments]);

  if (destinations.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Geen bestemmingen om te tonen.
      </p>
    );
  }

  const positions = destinations.map((d): [number, number] => [d.coords.lat, d.coords.lng]);
  const bounds = latLngBounds(positions);

  return (
    <div className="space-y-2">
      <div className="relative h-[70vh] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40] }} scrollWheelZoom>
          <FitBounds positions={positions} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {routePoints.length >= 2 && (
            <Polyline
              positions={routePoints}
              pathOptions={{ color: "#334155", weight: 2, dashArray: "6 6" }}
            />
          )}
          {destinations.map((dest) => (
            <CircleMarker
              key={dest.id}
              center={[dest.coords.lat, dest.coords.lng]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: STATUS_COLOR[dest.status],
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">
                    {dest.name} <span className="font-normal text-slate-500">· {dest.country}</span>
                  </p>
                  <StatusBadge status={dest.status} />
                  {dest.activities.length > 0 && (
                    <p className="text-xs text-slate-600">{dest.activities.join(" · ")}</p>
                  )}
                  {(segmentsByDestination.get(dest.id) ?? []).map((segment) => (
                    <p key={segment.id} className="text-xs text-slate-600">
                      {formatDayMonthNL(segment.startDate)} –{" "}
                      {formatDayMonthNL(addDays(segment.startDate, segment.nights))} (
                      {segment.nights} n)
                    </p>
                  ))}
                  {dest.notes && <p className="text-xs text-slate-500">{dest.notes}</p>}
                  <button
                    type="button"
                    className="mt-1 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                      setTab("bestemmingen");
                      setEditingDestinationId(dest.id);
                    }}
                  >
                    Bewerken
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        <div className="absolute right-3 top-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow">
          <p className="mb-1 text-xs font-semibold text-slate-600">Status</p>
          {STATUSES.map((status) => (
            <p key={status} className="flex items-center gap-2 text-xs text-slate-600">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
              />
              {status}
            </p>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        De routelijn volgt de volgorde van de planning. Kaarttegels vereisen een
        internetverbinding.
      </p>
    </div>
  );
}
