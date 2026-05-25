# Handover Document: Python Migration with LangGraph

**Date:** May 25, 2026  
**Project:** WhatsApp/Telegram Omnichannel AI Chatbot  
**Migration:** Node.js → Python with LangGraph  
**Author:** Development Team

---

## 📋 Executive Summary

This document summarizes the architectural decisions and clarifications regarding the migration from Node.js to Python using **LangGraph** for AI orchestration, as requested by senior management.

### Key Decision
- **Web Server:** FastAPI (lightweight, async, production-ready)
- **AI Orchestration:** LangGraph (replaces manual loops)
- **AI Model:** Google Gemini 1.5 Flash/Pro
- **Backend:** Django ERP (existing system)

---

## 🎯 Migration Context

### Current Implementation (Node.js)
- **Framework:** Express.js
- **AI Provider:** OpenAI
- **Orchestration:** Manual `while` loop with `MAX_TURNS`
- **Tool Calling:** Manual XML parsing (`<tool_call>` tags)
- **State Management:** Manual Redis calls

### New Implementation (Python)
- **Framework:** FastAPI
- **AI Provider:** Google Gemini
- **Orchestration:** LangGraph (declarative graph-based)
- **Tool Calling:** Native LangGraph `ToolNode`
- **State Management:** LangGraph built-in state + Redis

---

## 🧩 Architecture Overview

### Complete System Flow

```
┌─────────────────────────────────────────────────────────┐
│  WhatsApp User              Telegram User               │
│       │                           │                     │
│       ▼                           ▼                     │
│  Meta Servers              Telegram Servers             │
│       │                           │                     │
│       ▼ POST /webhook/whatsapp    ▼ POST /webhook/telegram
└───────┬───────────────────────────┬─────────────────────┘
        │                           │
        ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Web Server (HTTP Layer)            │
│                                                         │
│  ┌────────────────────┐      ┌───────────────────┐     │
│  │ WhatsApp Validator │      │ Telegram Validator│     │
│  │ (HMAC + Pydantic)  │      │ (Token + Pydantic)│     │
│  └─────────┬──────────┘      └─────────┬─────────┘     │
│            │                           │                │
│            ▼                           ▼                │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Payload Normalizer                       │   │
│  │   (Convert to NormalizedMessage)                 │   │
│  └─────────────────────┬────────────────────────────┘   │
└────────────────────────┼───────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              LangGraph Agent (AI Layer)                 │
│                                                         │
│  START → AI Node → Conditional Edge → Tool Node        │
│            ↑                              ↓            │
│            └──────── Loop if needed ──────┘            │
│                                                         │
│  State: {messages, platform, user_id, memories}         │
└────────┬───────────────────┬───────────────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
       Redis           Google Gemini       Django ERP APIs
```

---

## 🔑 Key Architectural Decisions

### 1. Why FastAPI is Still Needed

**Question:** "Why do we need FastAPI if we're using LangGraph?"

**Answer:** FastAPI and LangGraph serve **different purposes**:

| Component | Purpose | Analogy |
|-----------|---------|---------|
| **FastAPI** | Receives HTTP webhooks from WhatsApp/Telegram | 📬 **Mailbox** - receives messages from outside world |
| **LangGraph** | Processes AI logic and orchestrates workflow | 🧠 **Brain** - thinks and makes decisions |

**You need BOTH because:**
1. ✅ WhatsApp/Telegram send **HTTP POST requests** → FastAPI receives them
2. ✅ FastAPI validates security (HMAC, tokens)
3. ✅ FastAPI parses and normalizes payloads
4. ✅ FastAPI passes normalized data to LangGraph
5. ✅ LangGraph handles AI conversation flow
6. ✅ FastAPI returns HTTP 200 to webhook sender

**LangGraph alone cannot receive webhooks** - it's a workflow engine, not a web server.

---

### 2. FastAPI vs "Native Python"

**Question:** "Why not use native Python web server instead of FastAPI?"

**Answer:** FastAPI **IS** native Python! It uses Python's native `async/await`.

#### Comparison of Options:

| Approach | Code Lines | Async | Validation | Production Ready | Maintainability |
|----------|-----------|-------|------------|------------------|-----------------|
| `http.server` (built-in) | 🔴 100+ | ❌ No | ❌ Manual | ❌ No | 🔴 Hard |
| `aiohttp` | 🟡 60+ | ✅ Yes | ❌ Manual | ⚠️ Maybe | 🟡 Medium |
| **FastAPI** | 🟢 30 | ✅ Yes | ✅ Auto | ✅ Yes | 🟢 Easy |

**Why FastAPI is the right choice:**
- ✅ **Lightweight** (50 KB vs Django's 10 MB)
- ✅ **Native async/await** (Python 3.11+ best practices)
- ✅ **Automatic validation** (Pydantic models)
- ✅ **Type safety** (catches errors at development time)
- ✅ **Auto-generated docs** (Swagger UI at `/docs`)
- ✅ **Production-ready** (used by Netflix, Uber, Microsoft)
- ✅ **Easy to maintain** (less boilerplate code)

---

### 3. What is LangGraph?

**LangGraph** is a framework for building **stateful, multi-step AI agents** using **graphs** (nodes and edges).

#### Core Concepts:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   AI     │────▶│  Tools   │────▶│   AI     │────▶│  Send    │
│   Node   │     │  Node    │     │   Node   │     │  Node    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     ▲                │
     └────────────────┘
     (Loop if more tools needed)
```

**Components:**
- **Nodes** = Actions (call AI, execute tool, send message)
- **Edges** = Decisions (if tool needed → go to tool node, else → end)
- **State** = Data flowing through the graph (messages, user_id, platform)

#### Benefits Over Manual Loops:

| Feature | Current (Node.js) | With LangGraph |
|---------|-------------------|----------------|
| **Loop Management** | Manual `while` loop with `MAX_TURNS` | Automatic with conditional edges |
| **Tool Calling** | Parse `<tool_call>` XML manually | Native `ToolNode` support |
| **State Management** | Pass variables between functions | Centralized `AgentState` |
| **Debugging** | Console logs | Visual graph + LangSmith tracing |
| **Extensibility** | Add more `if/else` statements | Add new nodes/edges |
| **Memory** | Manual Redis calls | Built-in checkpointing |

---

## 📊 Current vs New Architecture

### Current Node.js Flow:
```javascript
// Manual loop in aiRouter.js
let turns = 0;
const MAX_TURNS = 5;

while (turns < MAX_TURNS) {
  turns += 1;
  
  // 1. Call OpenAI
  const aiResponse = await chatCompletion(messages);
  messages.push(aiResponse);
  
  // 2. Parse tool call manually
  const parsedCall = parseToolCall(aiResponse.content);
  
  // 3. If no tool call, break
  if (!parsedCall) break;
  
  // 4. Execute tool manually
  const toolResults = await dispatchToolCalls([parsedCall]);
  
  // 5. Add result to messages
  messages.push({ role: 'user', content: toolResults[0].content });
}

// 6. Send final response
await sendResponseMessage({ channel, to: from, content: finalResponse });
```

**Problems:**
- ❌ Manual loop management
- ❌ Manual XML parsing
- ❌ Hard to visualize flow
- ❌ Difficult to add complex logic (e.g., human-in-the-loop)

---

### New Python + LangGraph Flow:
```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

# 1. Define state
class AgentState(TypedDict):
    messages: Sequence[BaseMessage]
    platform: str
    user_id: str

# 2. Define nodes
def call_ai(state: AgentState):
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

tool_node = ToolNode(tools=[check_stock, place_order, search_memory])

def send_response(state: AgentState):
    last_message = state["messages"][-1]
    if state["platform"] == "whatsapp":
        send_whatsapp_message(state["user_id"], last_message.content)
    else:
        send_telegram_message(state["user_id"], last_message.content)
    return state

# 3. Define routing logic
def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "send_response"

# 4. Build graph
workflow = StateGraph(AgentState)
workflow.add_node("ai", call_ai)
workflow.add_node("tools", tool_node)
workflow.add_node("send_response", send_response)

workflow.set_entry_point("ai")
workflow.add_conditional_edges("ai", should_continue, {
    "tools": "tools",
    "send_response": "send_response"
})
workflow.add_edge("tools", "ai")  # Loop back to AI after tools
workflow.add_edge("send_response", END)

# 5. Compile
app = workflow.compile()

# 6. Use in FastAPI
@fastapi_app.post("/webhook/whatsapp")
async def whatsapp_webhook(payload: WhatsAppWebhook):
    normalized = normalize_payload(payload)
    
    result = await app.ainvoke({
        "messages": [HumanMessage(normalized.text)],
        "platform": "whatsapp",
        "user_id": normalized.user_id
    })
    
    return {"status": "ok"}
```

**Benefits:**
- ✅ Declarative (easy to understand)
- ✅ Automatic loop management
- ✅ Native tool calling
- ✅ Visual graph representation
- ✅ Easy to extend (add approval nodes, etc.)

---

## 🏗️ Layer Responsibilities

### Layer 1: HTTP Layer (FastAPI)
**Responsibilities:**
- ✅ Receive webhooks from WhatsApp/Telegram
- ✅ Validate security (HMAC signatures, secret tokens)
- ✅ Parse JSON payloads with Pydantic
- ✅ Return HTTP 200 quickly (Meta requires <20 seconds)
- ✅ Health check endpoints
- ✅ Rate limiting

**Why FastAPI:**
- Async by default (handles multiple webhooks simultaneously)
- Automatic validation (Pydantic models)
- Lightweight (just for webhooks, not full app)
- Production-ready

---

### Layer 2: Normalization Layer
**Responsibilities:**
- ✅ Convert WhatsApp payload → Generic format
- ✅ Convert Telegram payload → Generic format
- ✅ Create `NormalizedMessage` object

**Format:**
```python
class NormalizedMessage:
    platform: Literal["whatsapp", "telegram"]
    user_id: str  # Phone number or Telegram chat ID
    type: Literal["text", "audio", "image"]
    text: Optional[str]
    media_id: Optional[str]
```

---

### Layer 3: AI Orchestration (LangGraph)
**Responsibilities:**
- ✅ Conversation flow management
- ✅ Tool calling decisions
- ✅ State management (conversation history)
- ✅ Loop handling (AI → Tool → AI → Tool → ...)
- ✅ Platform-agnostic logic

**Why LangGraph:**
- Industry standard for production AI agents
- Visual graph structure (easier to understand)
- Built-in state management
- Automatic loop handling
- Easy to debug (LangSmith tracing)

---

### Layer 4: Business Logic Layer
**Responsibilities:**
- ✅ Check stock (call Django ERP)
- ✅ Place order (call Django ERP)
- ✅ Create complaint ticket (call Django ERP)
- ✅ Search memory (Redis + pgvector)
- ✅ Send messages (WhatsApp/Telegram APIs)

---

## 🔧 Technology Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| **Runtime** | Python | 3.11+ | Server runtime |
| **Web Framework** | FastAPI | Latest | HTTP server, webhook routing |
| **Validation** | Pydantic | V2 | Schema validation |
| **HTTP Client** | httpx | Latest | Async API calls |
| **AI Framework** | LangGraph | Latest | Workflow orchestration |
| **AI Model** | Google Gemini | 1.5 Flash/Pro | Conversational AI |
| **Cache/Session** | Redis | Latest | Short-term memory |
| **Backend** | Django ERP | Existing | Source of truth |

---

## 📦 Python Dependencies

```txt
# Web Server
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
pydantic>=2.0.0

# HTTP Client
httpx>=0.24.0

# AI & LangGraph
langchain>=0.1.0
langchain-google-genai>=0.0.5
langgraph>=0.0.20

# Utilities
python-dotenv>=1.0.0
redis>=5.0.0
python-multipart>=0.0.6
```

---

## 🎯 Migration Benefits

### 1. Code Quality
- ✅ **Less code** (LangGraph eliminates manual loops)
- ✅ **Type safety** (Python type hints + Pydantic)
- ✅ **Better structure** (declarative vs imperative)

### 2. Maintainability
- ✅ **Visual graph** (easy to understand flow)
- ✅ **Modular** (add/remove nodes easily)
- ✅ **Testable** (test individual nodes)

### 3. Debugging
- ✅ **LangSmith tracing** (see every step)
- ✅ **Graph visualization** (see the flow)
- ✅ **Better error messages**

### 4. Scalability
- ✅ **Async by default** (FastAPI + LangGraph)
- ✅ **Easy to add features** (new nodes)
- ✅ **Production-ready** (industry standard)

---

## 🚀 Next Steps

### Phase 1: Setup & Foundation
1. ✅ Setup Python 3.11+ environment
2. ✅ Install dependencies (FastAPI, LangGraph, etc.)
3. ✅ Create project structure
4. ✅ Setup `.env` configuration

### Phase 2: FastAPI Webhooks
1. ✅ Implement WhatsApp webhook endpoint
2. ✅ Implement Telegram webhook endpoint
3. ✅ Add security validation (HMAC, tokens)
4. ✅ Create payload normalizer

### Phase 3: LangGraph Integration
1. ✅ Define `AgentState`
2. ✅ Create AI node (Gemini integration)
3. ✅ Create tool nodes (check_stock, place_order, etc.)
4. ✅ Build graph with conditional edges
5. ✅ Test workflow

### Phase 4: ERP Integration
1. ✅ Create ERP API client
2. ✅ Implement tool functions
3. ✅ Test end-to-end flow

### Phase 5: Production
1. ✅ Dockerization
2. ✅ Deploy to VPS
3. ✅ Monitoring & logging
4. ✅ Performance testing

---

## 📚 Learning Resources

### LangGraph
- **Official Docs:** https://langchain-ai.github.io/langgraph/
- **Tutorial:** https://langchain-ai.github.io/langgraph/tutorials/introduction/
- **Examples:** https://github.com/langchain-ai/langgraph/tree/main/examples

### FastAPI
- **Official Docs:** https://fastapi.tiangolo.com/
- **Tutorial:** https://fastapi.tiangolo.com/tutorial/

### Google Gemini
- **Official Docs:** https://ai.google.dev/docs
- **Python SDK:** https://github.com/google/generative-ai-python

---

## ❓ FAQ

### Q1: Can we use LangGraph without FastAPI?
**A:** No. LangGraph is a workflow engine, not a web server. You need FastAPI (or similar) to receive HTTP webhooks from WhatsApp/Telegram.

### Q2: Is FastAPI "native Python"?
**A:** Yes! FastAPI uses Python's native `async/await` and type hints. It's just a lightweight abstraction over Python's built-in capabilities.

### Q3: Why not use Django instead of FastAPI?
**A:** Django is too heavy for a simple webhook receiver. FastAPI is 200x smaller and designed for async APIs.

### Q4: Can we use Flask instead of FastAPI?
**A:** Technically yes, but Flask is not async by default. FastAPI is better for handling multiple concurrent webhooks.

### Q5: What if we need to add human approval before placing orders?
**A:** Easy with LangGraph! Just add an "approval" node between the tool node and the send node.

---

## 📝 Summary

### Key Takeaways:
1. ✅ **FastAPI** handles HTTP webhooks (required)
2. ✅ **LangGraph** handles AI orchestration (replaces manual loops)
3. ✅ **Both are needed** - they serve different purposes
4. ✅ **FastAPI IS native Python** - uses async/await
5. ✅ **LangGraph is industry standard** - better than manual loops

### Architecture:
```
FastAPI (HTTP) → Normalize → LangGraph (AI) → Tools → Response
```

### Migration Path:
```
Node.js + Manual Loops → Python + FastAPI + LangGraph
```

---

## 📞 Contact & Questions

For clarifications or questions about this migration, please contact:
- **Development Team:** [Your contact info]
- **Senior Management:** [Senior's contact info]

---

**Document Version:** 1.0  
**Last Updated:** May 25, 2026  
**Status:** Ready for Review
