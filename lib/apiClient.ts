import axios from "axios";

const serverApiBaseURL =
  process.env.API_BASE_URL ?? "http://campus-ai-backend:8000";

export const apiClient = axios.create({
  baseURL: serverApiBaseURL,
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    throw new Error(
      "apiClient is server-side only. Call FastAPI from a Server Component, Route Handler, or Server Action.",
    );
  }

  return config;
});

export const getApiBaseURL = () => serverApiBaseURL;
