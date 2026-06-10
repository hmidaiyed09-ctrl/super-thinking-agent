# 🤖 Super Thinking Agent (STA)

> **A Next-Gen AI Coding CLI** — Experience the power of deep-thinking LLMs directly from your terminal.

Super Thinking Agent is a high-performance terminal companion designed to streamline your development workflow. It doesn't just chat; it understands your context, manages your files, and assists in complex problem-solving with a "thinking-first" approach.

---

## 🌟 Key Features

- **⚡ Multi-Model Support:** Connect with any major LLM provider.
- **🏗️ Assembly-Line Logic:** Intelligent task orchestration for complex engineering tasks.
- **🛠️ Integrated Tools:** Built-in capabilities for file manipulation, system analysis, and more.
- **💻 UI Optimized:** Rich terminal output with `chalk` and `ora` for a premium CLI feel.
- **🧩 Configurable:** Highly customizable via `config.js` and `conf`.

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- API key for your preferred LLM provider

### Installation
```bash
# Clone the repository
git clone https://github.com/hmidaiyed09-ctrl/super-thinking-agent.git

# Install dependencies
npm install

# Link the CLI globally
npm link
```

### Usage
```bash
sta --help
```

---

## 📁 Architecture

- `src/index.js`: The entry point and main CLI logic.
- `src/assembly-line.js`: Orchestrates complex task sequences.
- `src/api.js`: Handles communication with AI providers.
- `src/ui.js`: Manages the rich terminal interface.
- `src/tools.js`: A suite of utility functions for the agent.

---

## 📜 License
MIT
