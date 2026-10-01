import { spawn } from "node:child_process";
import http from "node:http";

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const method = options.method || "GET";
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("==> Checking ClaimIQ API contract against backend...");

  // 1. Health check
  const health = await request("/api/health");
  if (health.status !== 200) {
    throw new Error(`Health check failed with status ${health.status}`);
  }
  console.log("✓ GET /api/health passed");

  // 2. Load demo claim
  const demoLoad = await request("/api/demo/load", { method: "POST" });
  if (demoLoad.status !== 200 || !demoLoad.data?.claim?.id) {
    throw new Error(`POST /api/demo/load failed: ${JSON.stringify(demoLoad.data)}`);
  }
  const claimId = demoLoad.data.claim.id;
  console.log(`✓ POST /api/demo/load returned claim ${claimId}`);

  // 3. Trigger analyze
  const analyze = await request(`/api/claims/${claimId}/analyze`, { method: "POST" });
  if (analyze.status !== 200 && analyze.status !== 202) {
    throw new Error(`POST /api/claims/${claimId}/analyze failed: ${analyze.status}`);
  }
  console.log("✓ POST /api/claims/{id}/analyze triggered");

  // 4. Poll analysis until completed
  let analysis = null;
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(400);
    const res = await request(`/api/claims/${claimId}/analysis`);
    if (res.status === 200 && res.data) {
      if (res.data.status === "completed") {
        analysis = res.data;
        break;
      }
    }
  }

  if (!analysis) {
    throw new Error("Analysis did not complete in time");
  }
  console.log("✓ GET /api/claims/{id}/analysis completed");

  // 5. Assert required top-level keys
  const requiredKeys = [
    "agents",
    "extracted_documents",
    "policy_evidence",
    "coverage",
    "missing_information",
    "anomalies",
    "assessment",
    "human_review",
    "evidence",
  ];

  for (const key of requiredKeys) {
    if (analysis[key] === undefined || analysis[key] === null) {
      throw new Error(`Missing required key in Analysis: "${key}"`);
    }
    console.log(`  ✓ Key present: ${key}`);
  }

  // 6. Assert agents count
  if (!Array.isArray(analysis.agents) || analysis.agents.length !== 7) {
    throw new Error(`Expected 7 agents, got ${analysis.agents?.length}`);
  }
  console.log("✓ 7 pipeline agents verified");

  // 7. Assert demo contract values
  if (analysis.coverage.coverage_status !== "applicable") {
    throw new Error(`Expected coverage_status "applicable", got "${analysis.coverage.coverage_status}"`);
  }
  console.log("✓ coverage_status is 'applicable'");

  if (analysis.missing_information.completeness !== 75) {
    throw new Error(`Expected missing_information.completeness 75, got ${analysis.missing_information.completeness}`);
  }
  console.log("✓ missing_information.completeness is 75%");

  if (!Array.isArray(analysis.anomalies) || analysis.anomalies.length !== 2) {
    throw new Error(`Expected exactly 2 anomalies, got ${analysis.anomalies?.length}`);
  }
  const types = analysis.anomalies.map((a) => a.type).sort();
  if (types[0] !== "amount_mismatch" || types[1] !== "date_mismatch") {
    throw new Error(`Expected anomalies date_mismatch and amount_mismatch, got: ${types.join(", ")}`);
  }
  console.log("✓ Exactly 2 anomalies verified: date_mismatch and amount_mismatch");

  if (analysis.assessment.complexity_score !== 62) {
    throw new Error(`Expected assessment.complexity_score 62, got ${analysis.assessment.complexity_score}`);
  }
  console.log("✓ assessment.complexity_score is 62");

  if (analysis.assessment.complexity !== "medium") {
    throw new Error(`Expected assessment.complexity "medium", got "${analysis.assessment.complexity}"`);
  }
  console.log("✓ assessment.complexity is 'medium'");

  if (analysis.assessment.recommended_route !== "human_review") {
    throw new Error(`Expected assessment.recommended_route "human_review", got "${analysis.assessment.recommended_route}"`);
  }
  console.log("✓ assessment.recommended_route is 'human_review'");

  // 8. Assert all evidence_ids referenced in findings exist in analysis.evidence
  const evidenceMap = new Map((analysis.evidence || []).map((e) => [e.id, e]));
  const referencedIds = new Set();

  (analysis.coverage?.evidence_ids || []).forEach((id) => referencedIds.add(id));
  (analysis.missing_information?.items || []).forEach((item) => {
    (item.evidence_ids || []).forEach((id) => referencedIds.add(id));
  });
  (analysis.anomalies || []).forEach((item) => {
    (item.evidence_ids || []).forEach((id) => referencedIds.add(id));
  });
  (analysis.assessment?.evidence_ids || []).forEach((id) => referencedIds.add(id));

  for (const id of referencedIds) {
    if (!evidenceMap.has(id)) {
      throw new Error(`Referenced evidence_id "${id}" is missing from analysis.evidence`);
    }
  }
  console.log(`✓ All ${referencedIds.size} referenced evidence IDs exist in analysis.evidence`);

  // 9. Wording checks (never banned terms)
  const fullJson = JSON.stringify(analysis).toLowerCase();
  const banned = ["fraud confirmed", "fraudulent", " approved ", " rejected "];
  for (const b of banned) {
    if (fullJson.includes(b)) {
      throw new Error(`Found banned wording in analysis response: "${b}"`);
    }
  }
  console.log("✓ Wording guidelines verified (no banned terms)");

  console.log("\n Contract check passed successfully!");
}

main().catch((err) => {
  console.error("\n❌ Contract check failed:", err.message);
  process.exit(1);
});
