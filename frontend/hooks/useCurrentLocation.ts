import { useCallback, useState } from "react";
import type { CampusCoordinate } from "@/types";

export function useCurrentLocation() {
  const [location, setLocation] = useState<CampusCoordinate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setError(null);
      },
      () => {
        setError("Unable to get current location.");
      },
    );
  }, []);

  return { location, error, requestLocation };
}
