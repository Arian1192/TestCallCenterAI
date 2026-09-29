import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.TOOLS_API_KEY = "test-key-1234567890";
process.env.DATA_PROVIDER = "mock";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "cc-ai-"));
process.env.ELEVENLABS_WEBHOOK_SECRET = "whsec_test";
process.env.LOG_LEVEL = "silent";
