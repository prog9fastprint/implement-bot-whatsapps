# Phase 3 — Business Logic & Gaps

- [x] **Task A: Real DB Complaints**
  - [x] Implement `INSERT INTO complaints` in `src/services/complaintService.js`
  - [x] Generate sequential ticket numbers (`TKT-YYYYMMDD-XXXX`)
  - [x] Add `get_ticket_status` to `toolDefinitions.js` and `toolDispatcher.js`
  - [x] Add ticket lookup by ticket_number
- [x] **Task B & C: Recommendation Service**
  - [x] Create `src/services/recommendationService.js`
  - [x] Query products filtered by category/price + utilize user memories
  - [x] Register `get_product_recommendation` in `src/tools/toolDispatcher.js`
- [x] **Task D: Real Summarization**
  - [x] Implement GPT-driven summarization in `src/services/summarizationService.js`
  - [x] Save to `ai_summaries` table and delete summarized messages when message count >= 50
- [x] **Task E & F: Database Seed Expansion**
  - [x] Add more Nike products/variants (running, basketball, clothing) to `database/init.sql` (or migration seed)
  - [x] Add 2 sample orders and items to DB seed for order tracking tests
  - [x] Run migrations and re-seed DB
