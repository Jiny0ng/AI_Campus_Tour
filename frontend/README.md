# AI Campus Docent

Mobile-first Next.js web application for AI campus tour and campus guide flows.

## Structure

- `app`: App Router pages and layouts
- `components`: Feature-based reusable UI components
- `features`: Domain logic for tour, guide, search, chat, and map
- `hooks`: Shared React hooks
- `lib`: API client and framework utilities
- `types`: Shared TypeScript models
- `constants`: Routes and static app constants
- `dummy`: Mock data for local UI development
- `styles`: Global styles and design tokens
- `public/images`: PNG design and image assets

## Environment

Create `.env.local` from `.env.example` and set the required values.

```env
API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your_naver_map_ncp_key_id
```

The backend also requires `NAVER_MAP_CLIENT_SECRET` in the repository root
`.env` to call NAVER Maps Directions 5. Keep this value server-side and never
prefix it with `NEXT_PUBLIC_`.

`API_BASE_URL` is for server-side FastAPI calls. Keep it without the `NEXT_PUBLIC_` prefix so the internal Docker service URL is not exposed to the browser.

The app uses NAVER Maps JavaScript API v3 with the `ncpKeyId` script parameter.

## Local Ports

- Frontend: `http://localhost:4173`
- Backend: `http://localhost:8001`
- Neo4j Browser: `http://localhost:7475`

The frontend API client is server-side only, so browser CORS is not required for
the current integration. Use `docker compose --profile seed up data-loader` only
when you intentionally want to rebuild the Neo4j dataset from the XLSX/CSV files.
