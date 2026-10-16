// The short system prompt describes the task; this format defines the editor's wire contract.
export const BPMN_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "bpmn_graph",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "name"],
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["start", "end", "userTask", "serviceTask", "gateway"] },
              name: { type: "string" },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "condition"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              condition: { type: "string", description: "Branch label, or an empty string for an unconditional flow." },
            },
          },
        },
      },
    },
  },
} as const;
