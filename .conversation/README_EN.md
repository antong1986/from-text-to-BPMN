# Text-to-BPMN Studio (AI-Powered Workflow Architect)

[Русская версия](README.md)

A professional tool for business and systems analysts. It transforms textual process descriptions into semantic BPMN 2.0 diagrams (User/Service Tasks, Gateways, Orthogonal Routing), validates logic through chat, and generates a ready-to-use relational database structure (SQL).

## Technology Stack
- **Frontend**: React.js 19, Vite, TypeScript, Tailwind CSS.
- **Diagrams**: bpmn-js (Camunda).
- **Backend**: Node.js, Express.js.
- **AI**: OpenAI-compatible API (Ollama for local development, OpenRouter for production).

## Architectural Highlight (Engineering Pride)
The key innovation of the project is **hybrid generation**. We moved the calculation of heavy XML geometry (element coordinates, shape sizes, arrow waypoints) from the LLM to a specialized TypeScript-based builder (`bpmnBuilder.ts`).

**Key Benefits:**
1. **Reliability**: The AI no longer "breaks" the XML markup by trying to guess coordinates.
2. **Speed**: Diagram generation is accelerated to under 2 seconds.
3. **Efficiency**: The model only outputs a concise flat JSON graph (nodes & edges), reducing token consumption in production by 10x.
4. **Quality**: Implemented true orthogonal edge routing — connections no longer cross through shapes.

## Local Setup Instructions (Offline Mode)

For fully autonomous operation, use [Ollama](https://ollama.com/).

1. **Install Ollama** and download the model:
   ```bash
   ollama pull qwen2.5-coder:1.5b
   ```
2. **Configure Environment**: Ensure your `.env` file contains:
   ```env
   AI_BASE_URL=http://localhost:11434/v1
   AI_MODEL_NAME=qwen2.5-coder:1.5b
   ```
3. **Run the Project**:
   ```bash
   npm install
   npm run server   # Start the proxy server (port 3001)
   npm run dev      # Start the frontend (port 5173)
   ```

## Production Deployment Instructions (Cloud Mode)

To use powerful cloud models via [OpenRouter](https://openrouter.ai/):

1. **Get an API Key** from OpenRouter.
2. **Set Environment Variables** in `.env` or your hosting provider (Vercel/Render):
   ```env
   AI_BASE_URL=https://openrouter.ai/api/v1
   AI_API_KEY=your_openrouter_key_here
   AI_MODEL_NAME=anthropic/claude-3.5-sonnet  # or google/gemini-pro-1.5
   ```
3. **Build**:
   ```bash
   npm run build
   ```

---
Developed with a focus on code quality and business logic correctness.
