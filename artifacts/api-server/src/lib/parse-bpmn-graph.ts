const names: Record<string, string> = {
  start: "Начало", end: "Завершение", userTask: "Действие пользователя",
  serviceTask: "Автоматическое действие", gateway: "Условие",
};

function parseModelJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in model response.");
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model response must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeGraph(graph: unknown): unknown {
  if (!graph || typeof graph !== "object" || !("nodes" in graph) ||
    !("edges" in graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Missing nodes or edges.");
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node: unknown) => {
      if (!node || typeof node !== "object") return node;
      const n = node as Record<string, unknown>;
      return { ...n, name: typeof n.name === "string" && n.name.trim()
        ? n.name : typeof n.id === "string" && n.id.trim()
          ? n.id : names[String(n.type)] ?? "Действие" };
    }),
  };
}

export function parseBpmnGraph(text: string): unknown {
  const parsed = parseModelJson(text);
  return normalizeGraph(parsed.graph ?? parsed);
}

export function parseBpmnRefinement(text: string): { graph: unknown; message: string } {
  const parsed = parseModelJson(text);
  return {
    graph: normalizeGraph(parsed.graph),
    message: typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Уточнение учтено, диаграмма обновлена.",
  };
}
