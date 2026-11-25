# Group 9 · Weather MCP

An MCP server that gives ChatGPT five weather tools. Every tool answers with an interactive card (an MCP App) in the same hand-drawn cartoon style: weather characters, an animated sky per weather type, and a buddy that reacts to how it feels outside.

All data comes from [Open-Meteo](https://open-meteo.com). It is free and needs no API key.

## Tools

| Tool | Inputs | Shows |
| --- | --- | --- |
| `show_weather` | `city`, `countryCode?`, `units?` | Current weather, the next 24 hours and 7 days |
| `find_dry_window` | `city`, `hours`, `startDate?`, `endDate?`, `earliestHour?`, `latestHour?` | The best dry time slots for doing something outside, on an hour-by-hour rain chart |
| `compare_weather` | `cities[]` (2 to 4), `units?` | The cities side by side, with badges for the warmest, driest and calmest |
| `air_quality` | `city`, `countryCode?` | European AQI, PM2.5, PM10, NO₂, ozone, UV index, the next 24 hours, and pollen (Europe only) |
| `sun_times` | `city`, `countryCode?` | Sunrise, sunset, day length and golden hour for a week, with the sun's position right now |

## Run

```sh
bun install
bun run start            # http://localhost:5230/mcp
cloudflared tunnel run --token <group 9 token>   # → https://mcp-group9.collea.ai/mcp
```

In ChatGPT, go to Settings → Plugins (Integrations) → Add → Add MCP server, enter `https://mcp-group9.collea.ai/mcp` and choose no authentication.

To test without ChatGPT: `bunx @modelcontextprotocol/inspector`, then connect to `http://localhost:5230/mcp`.

`bun test` runs the tests for the dry-window search. `bun run typecheck` checks the types.

### Docker

```sh
docker build -t weather-mcp .
docker run -p 5230:5230 weather-mcp   # http://localhost:5230/mcp
```

The server needs no credentials or environment variables.

## Layout

| File | Role |
| --- | --- |
| `src/forecast.ts` | The contract: one Zod schema per tool result, tagged with `kind`, shared by the server and the widget |
| `src/open-meteo.ts` | Looks up the city and fetches forecasts, air quality and sun times |
| `src/dry-window.ts` | Picks the best dry time slots from an hourly forecast |
| `src/errors.ts` | The error for input the model can fix (unknown city, dates out of range) |
| `src/server.ts` | The MCP server: registers the five tools and the `ui://weather/forecast.html` widget, and serves on port 5230 |
| `src/view/view.html` + `view.ts` | The widget shell: styles, and the wiring to the host. It draws the card that matches the result's `kind`. |
| `src/view/card.ts` | The forecast card and the city comparison |
| `src/view/dry-card.ts`, `air-card.ts`, `sun-card.ts` | The cards for the other tools |
| `src/view/icons.ts` | The hand-drawn art: the weather characters and the buddy |
| `src/view/backdrop.ts` | The animated sky behind the top section, one composition per weather condition |
| `src/view/format.ts` | Small helpers the cards share (times, degrees, escaping) |

The widget is bundled when the server starts, so restart the server (or use `bun run dev`) after you edit it.
