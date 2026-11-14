/**
 * POST /api/ask  { q: string, vars: { id: string, name: string }[] }
 * Reads a plain-language question with a small Workers AI model and returns which TrendScope
 * variables and which place it is about. The model never produces numbers: the app runs the
 * statistics itself on NASA data.
 */

interface Env {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
}

interface AskBody {
  q?: string;
  vars?: { id: string; name: string }[];
}

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return json({ error: "Send JSON with a question in q." }, 400);
  }
  const q = (body.q ?? "").trim().slice(0, 300);
  const vars = (body.vars ?? []).slice(0, 40).filter((v) => /^[a-z0-9_]+$/.test(v.id));
  if (!q) return json({ error: "The question is empty." }, 400);
  if (!env.AI) return json({ error: "The AI model is not configured on this deployment." }, 503);

  const catalogue = vars.map((v) => `${v.id}: ${v.name}`).join("\n");
  const system = [
    "You read questions about how Earth's climate and environment are changing at a place.",
    "Return only JSON with keys: place (string or null: the place name exactly as a map search would need it, e.g. 'Lahore, Pakistan'),",
    "variables (array of up to 3 ids from the catalogue, most relevant first), and reason (one short sentence).",
    "Use only ids from this catalogue:",
    catalogue,
    "If the question names no place, place is null. If no variable fits, use t2m.",
  ].join("\n");

  try {
    const out = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: q },
      ],
      max_tokens: 160,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: {
            place: { type: ["string", "null"] },
            variables: { type: "array", items: { type: "string" } },
            reason: { type: "string" },
          },
          required: ["place", "variables"],
        },
      },
    })) as { response?: unknown };
    let parsed: { place?: unknown; variables?: unknown; reason?: unknown } = {};
    const r = out?.response;
    if (typeof r === "string") {
      const m = r.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } else if (r && typeof r === "object") parsed = r as typeof parsed;
    const ids = new Set(vars.map((v) => v.id));
    const variables = Array.isArray(parsed.variables)
      ? parsed.variables.filter((v): v is string => typeof v === "string" && ids.has(v)).slice(0, 3)
      : [];
    const place = typeof parsed.place === "string" && parsed.place.trim() ? parsed.place.trim().slice(0, 120) : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "";
    return json({ place, variables, reason, model: MODEL });
  } catch (err) {
    return json({ error: "The AI model could not read the question.", detail: String(err).slice(0, 200) }, 502);
  }
};
