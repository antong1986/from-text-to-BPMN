const names: Record<string, string> = {
  start: "Начало", end: "Завершение", userTask: "Действие пользователя",
  serviceTask: "Автоматическое действие", gateway: "Условие",
};

export function parseBpmnGraph(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in model response.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const graph = parsed?.graph ?? parsed;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
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
