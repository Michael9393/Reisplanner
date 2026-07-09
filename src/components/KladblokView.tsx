/**
 * Kladblok: losse bestemmingsideeën snel vastleggen (alleen een naam is
 * genoeg) en later promoveren tot volwaardige bestemming in de planner.
 */
import { useState } from "react";
import { db } from "../db/db";
import { addIdea, deleteIdea, type IdeaInput, promoteIdea, updateIdea } from "../db/repo";
import type { IdeaRecord, TripRecord } from "../domain/types";
import type { TripData } from "../hooks/useTripData";
import type { PlaceSuggestion } from "../services/photon";
import { useUIStore } from "../state/ui";
import { autoFillSeasonal, DestinationEditor } from "./DestinationsView";
import { PlaceSearchInput } from "./PlaceSearchInput";
import { inputClass, labelClass, Modal, primaryButton, secondaryButton } from "./shared";

export function KladblokView({ data, trip }: { data: TripData; trip: TripRecord }) {
  const { ideas, destinations } = data;
  const { editingIdeaId, setEditingIdeaId, promotingIdeaId, setPromotingIdeaId } = useUIStore();
  const [quickName, setQuickName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function quickAdd(input: IdeaInput) {
    setError(null);
    try {
      await addIdea(db, trip.id, input);
      setQuickName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function quickAddFromSuggestion(suggestion: PlaceSuggestion) {
    void quickAdd({
      name: suggestion.name,
      country: suggestion.country ?? "",
      coords: suggestion.coords,
      notes: "",
      infoUrl: suggestion.infoUrl,
    });
  }

  function quickAddPlain() {
    if (quickName.trim() === "") {
      setError("Typ eerst een plaatsnaam.");
      return;
    }
    void quickAdd({ name: quickName.trim(), country: "", coords: null, notes: "", infoUrl: null });
  }

  async function remove(idea: IdeaRecord) {
    if (!window.confirm(`Idee "${idea.name}" verwijderen?`)) return;
    try {
      await deleteIdea(db, trip.id, idea.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Nieuwste eerst: de hook levert oplopend op createdAt.
  const newestFirst = [...ideas].reverse();
  const promotingIdea = promotingIdeaId
    ? (ideas.find((i) => i.id === promotingIdeaId) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className={labelClass} htmlFor="idea-quick-add">
          Nieuw idee
        </label>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PlaceSearchInput
              id="idea-quick-add"
              value={quickName}
              onChange={setQuickName}
              onSelect={quickAddFromSuggestion}
              placeholder="Typ een plaatsnaam, bijv. Kyoto…"
            />
          </div>
          <button type="button" className={primaryButton} onClick={quickAddPlain}>
            Toevoegen
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Kies een suggestie voor land, coördinaten en een Wikipedia-link, of voeg alleen de naam
          toe.
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>

      <ul className="space-y-2">
        {newestFirst.map((idea) => (
          <li
            key={idea.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {idea.name}
                {idea.country && (
                  <span className="ml-2 text-xs font-normal text-slate-400">{idea.country}</span>
                )}
              </p>
              {idea.notes && <p className="mt-0.5 max-w-xl text-xs text-slate-500">{idea.notes}</p>}
              {idea.infoUrl && (
                <a
                  href={idea.infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-700 underline hover:text-emerald-900"
                >
                  Wikipedia ↗
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => setEditingIdeaId(idea.id)}
              >
                Bewerken
              </button>
              <button
                type="button"
                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                onClick={() => setPromotingIdeaId(idea.id)}
              >
                Promoveer naar bestemming
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:text-red-500"
                aria-label={`Idee ${idea.name} verwijderen`}
                onClick={() => remove(idea)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {ideas.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nog geen ideeën. Typ hierboven een plaatsnaam om te beginnen.
        </p>
      )}

      {editingIdeaId !== null && editingIdeaId !== "new" && (
        <IdeaEditor
          key={editingIdeaId}
          trip={trip}
          idea={ideas.find((i) => i.id === editingIdeaId) ?? null}
          onClose={() => setEditingIdeaId(null)}
        />
      )}

      {promotingIdea && (
        <DestinationEditor
          key={promotingIdea.id}
          trip={trip}
          destination={null}
          existingCountries={[...new Set(destinations.map((d) => d.country))]}
          segmentCount={0}
          initialValues={{
            name: promotingIdea.name,
            country: promotingIdea.country,
            coords: promotingIdea.coords ?? undefined,
            notes: promotingIdea.notes,
            infoUrl: promotingIdea.infoUrl,
            status: "idee",
          }}
          onSave={async (input) => {
            const destinationId = await promoteIdea(db, trip.id, promotingIdea.id, input);
            // Ook een gepromoveerde bestemming zonder seizoensdata krijgt de
            // automatische klimaatvulling op de achtergrond.
            if (input.seasonal.length === 0) {
              void autoFillSeasonal(db, trip, destinationId, input.coords);
            }
          }}
          onClose={() => setPromotingIdeaId(null)}
        />
      )}
    </div>
  );
}

function IdeaEditor({
  trip,
  idea,
  onClose,
}: {
  trip: TripRecord;
  idea: IdeaRecord | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(idea?.name ?? "");
  const [country, setCountry] = useState(idea?.country ?? "");
  const [lat, setLat] = useState(idea?.coords ? String(idea.coords.lat) : "");
  const [lng, setLng] = useState(idea?.coords ? String(idea.coords.lng) : "");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [infoUrl, setInfoUrl] = useState(idea?.infoUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!idea) return null;

  /** Een geplakt "lat, lng"-paar in het breedtegraad-veld splitst automatisch. */
  function onLatChange(value: string) {
    const pair = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
    if (pair) {
      setLat(pair[1]);
      setLng(pair[2]);
    } else {
      setLat(value);
    }
  }

  async function save() {
    if (!idea) return;
    if (name.trim() === "") return setError("Geef het idee een naam.");

    let coords: { lat: number; lng: number } | null = null;
    if (lat.trim() !== "" || lng.trim() !== "") {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (
        lat.trim() === "" ||
        lng.trim() === "" ||
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        Math.abs(latNum) > 90 ||
        Math.abs(lngNum) > 180
      ) {
        return setError(
          "Vul beide coördinaten in als getallen (met een punt), of laat beide leeg.",
        );
      }
      coords = { lat: latNum, lng: lngNum };
    }

    try {
      await updateIdea(db, trip.id, idea.id, {
        name: name.trim(),
        country: country.trim(),
        coords,
        notes,
        infoUrl: infoUrl.trim() === "" ? null : infoUrl.trim(),
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal title="Idee bewerken" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="idea-name">
              Naam
            </label>
            <PlaceSearchInput
              id="idea-name"
              value={name}
              onChange={setName}
              onSelect={(suggestion) => {
                setName(suggestion.name);
                setLat(String(suggestion.coords.lat));
                setLng(String(suggestion.coords.lng));
                if (suggestion.country && country.trim() === "") setCountry(suggestion.country);
                setInfoUrl(suggestion.infoUrl);
              }}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="idea-country">
              Land (optioneel)
            </label>
            <input
              id="idea-country"
              className={inputClass}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="idea-lat">
              Breedtegraad (optioneel)
            </label>
            <input
              id="idea-lat"
              className={inputClass}
              inputMode="decimal"
              value={lat}
              onChange={(e) => onLatChange(e.target.value)}
              placeholder="36.7198 of plak “lat, lng”"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="idea-lng">
              Lengtegraad (optioneel)
            </label>
            <input
              id="idea-lng"
              className={inputClass}
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="idea-info-url">
            Informatielink (https, optioneel)
          </label>
          <input
            id="idea-info-url"
            className={inputClass}
            value={infoUrl}
            onChange={(e) => setInfoUrl(e.target.value)}
            placeholder="https://nl.wikipedia.org/wiki/…"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="idea-notes">
            Notities
          </label>
          <textarea
            id="idea-notes"
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Annuleren
          </button>
          <button type="button" className={primaryButton} onClick={save}>
            Opslaan
          </button>
        </div>
      </div>
    </Modal>
  );
}
