"use server";

import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/places";

export type {
  PlaceSuggestion,
  PlacesResult,
  RetrievedPlace,
  RetrieveResult,
  ReverseGeocodeResult,
} from "@/lib/core/places";

export async function searchPlaces(text: string, sessionToken: string) {
  await requireUser();
  return core.searchPlaces(text, sessionToken);
}

export async function retrievePlace(id: string, sessionToken: string) {
  await requireUser();
  return core.retrievePlace(id, sessionToken);
}

export async function reverseGeocode(lat: number, lon: number) {
  await requireUser();
  return core.reverseGeocode(lat, lon);
}
