export type CampusSearchResult = {
  category: string;
  name: string;
  detail: string | null;
  location: string | string[] | null;
  lat: number | null;
  lng: number | null;
};

export type CampusSearchResponse = {
  query: string;
  total: number;
  results: CampusSearchResult[];
};
