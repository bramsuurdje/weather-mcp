import { App, applyDocumentTheme, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { ToolOutputSchema, type ToolOutput } from "../forecast";
import { renderAirQuality } from "./air-card";
import { renderComparison, renderForecast, renderStatus } from "./card";
import { renderDryWindows } from "./dry-card";
import { renderSunTimes } from "./sun-card";

// The widget ChatGPT renders for every tool of this server. It receives the tool
// result from the host and draws the card for its `kind`; it never fetches anything itself.

const root = document.getElementById("root")!;
let locale: string | undefined;

function render(output: ToolOutput): string {
  switch (output.kind) {
    case "forecast":
      return renderForecast(output, locale);
    case "dry-windows":
      return renderDryWindows(output, locale);
    case "comparison":
      return renderComparison(output, locale);
    case "air-quality":
      return renderAirQuality(output, locale);
    case "sun-times":
      return renderSunTimes(output, locale);
  }
}

function applyHostContext(ctx: McpUiHostContext | undefined) {
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
  if (ctx?.locale) locale = ctx.locale;
}

const app = new App({ name: "Group 9 Weather", version: "2.0.0" });

// Most tools take one city; the loading text names it when it is there.
const ToolInput = z.object({ city: z.string() });

app.ontoolinput = ({ arguments: args }) => {
  const input = ToolInput.safeParse(args);
  root.innerHTML = renderStatus(
    input.success ? `Checking the sky over ${input.data.city}…` : "Checking the sky…",
    true,
  );
};

app.ontoolresult = (result) => {
  if (result.isError) {
    const text = result.content?.find((c) => c.type === "text");
    root.innerHTML = renderStatus(text?.type === "text" ? text.text : "Could not load the weather.");
    return;
  }
  const output = ToolOutputSchema.safeParse(result.structuredContent);
  root.innerHTML = output.success
    ? render(output.data)
    : renderStatus("The weather came back in an unexpected format.");
};

app.onhostcontextchanged = applyHostContext;

await app.connect();
applyHostContext(app.getHostContext());
