// Free models ki list: pehla model pehle try hoga, error aaye to agla.
const MODELS = [
  "baidu/ernie-5.5-flash-preview:free",
  "inclusionai/ling-3.2-flash:free",
];

const PER_MODEL_MS = 25000; // ek model ko itna time milega
const TOTAL_MS = 55000; // poori request ki hard limit (Vercel 60s tak chalne deta hai)

async function callModel(model, system, user, maxTokens, timeoutMs, withReasoning) {
  const payload = {
    model: model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (withReasoning) payload.reasoning = { enabled: false };
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function claude(system, user, maxTokens, deadline) {
  const errors = [];
  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) {
      errors.push("time khatam");
      break;
    }
    try {
      const t = Math.min(PER_MODEL_MS, remaining - 1000);
      let r = await callModel(model, system, user, maxTokens, t, true);
      if (r.status === 400) {
        // model ko reasoning option pasand nahi, bina uske dobara try
        const t2 = Math.min(PER_MODEL_MS, deadline - Date.now() - 1000);
        if (t2 < 3000) {
          errors.push(model + " -> 400");
          continue;
        }
        r = await callModel(model, system, user, maxTokens, t2, false);
      }
      if (!r.ok) {
        errors.push(model + " -> " + r.status);
        continue;
      }
      const d = await r.json();
      const c = d.choices && d.choices[0];
      if (c && c.finish_reason === "length") {
        errors.push(model + " -> cut");
        continue;
      }
      const text = c && c.message && c.message.content;
      if (text && text.trim()) return text.trim();
      errors.push(model + " -> empty");
    } catch (e) {
      errors.push(model + " -> " + e.message);
    }
  }
  throw new Error("Sab models fail: " + errors.join(" | "));
}

const ANALYZE = `You are an emotionally intelligent dating-chat coach. A guy pasted a message or chat from a girl he is talking to on a dating app.
Read it carefully and return ONLY JSON (no markdown) with these keys:
{"mood":"her emotional mood right now","interest":"low|medium|high and why in a few words","stage":"new match|getting to know|flirty|planning meetup|dying chat","her_style":"how she texts: length, humour, emojis","language":"exact language/style she writes in, e.g. Hinglish in Roman script, English","hidden_meaning":"what she is really hinting or asking","best_move":"what a confident, genuine guy would do next","avoid":"what would sound cringe or try-hard here"}`;

const WRITE = `You write dating-app replies that sound like a real, relaxed guy texting, not an AI and not a comedian.
You get her message and an analysis. Do this silently:
1. Draft a reply that fits her mood and the best_move.
2. Rules the reply must follow:
- NEVER invent facts about the guy's life, job, plans, location, sleep, food or past. You know nothing about him. If she asks what he is doing or how he is, give a short, simple, believable answer that is true for almost anyone (like "chilling, kuch khaas nahi" or "bas din nikal raha hu") and turn the question back to her with real curiosity.
- Match her length and energy. If her message is short and simple, the reply is short and simple (usually one line, under 12 words).
- No forced jokes, no teasing like "bored or just here to distract me", no assuming how she feels, no dramatic or poetic lines.
- Sound normal: casual, lowercase is fine, no perfect grammar, max one emoji and only if she used one.
- Not needy, not pushy, not manipulative.
3. Match her language and style exactly (if Hinglish in Roman script, write natural Hinglish, not textbook Hindi).
Return ONLY the final reply text. No quotes, no explanation.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const deadline = Date.now() + TOTAL_MS;
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const message = String(body.message || "").trim().slice(0, 2000);
    const last = String(body.last || "").slice(0, 500);
    if (!message) return res.status(400).json({ error: "Message khali hai" });

    const analysis = await claude(ANALYZE, "Her message / chat:\n" + message, 1500, deadline);
    const reply = await claude(
      WRITE,
      "Her message / chat:\n" + message + "\n\nAnalysis:\n" + analysis +
        (last ? "\n\nDo not repeat this earlier reply, write a different one:\n" + last : ""),
      1000,
      deadline
    );
    res.status(200).json({ reply: reply.replace(/^["“]|["”]$/g, "") });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error: " + e.message });
  }
};
