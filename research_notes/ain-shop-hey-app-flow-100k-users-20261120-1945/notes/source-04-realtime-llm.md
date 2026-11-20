# Realtime / cheap LLM — sources, read 2026-11-20, verified live OpenAI pricing page
- OpenAI pricing (live open 2026-11-20): gpt-realtime-2.1 audio $32/1M in, $0.40 cached in, $64/1M out; text $4/$24; mini audio $10/$0.30/$20, text $0.60/$2.40. GPT-Live gpt-live-1.1 $0.05/min active, $0.02/min standby, billed per second, backend model extra.
  https://developers.openai.com/api/docs/pricing?multimodal-image-pricing=batch
- Per-minute conversion (ForaSoft, re-checked Nov 8 2026): 1 min heard ~600 tokens, 1 min spoken ~1,200 tokens; realistic cached $0.05-0.11/min flagship, $0.02-0.05/min mini; uncached/runaway up to $0.46/min; old $0.30/min assumed a full minute in AND a full minute out.
  https://www.forasoft.com/blog/article/openai-realtime-api-pricing ; https://forasoft.medium.com/openai-realtime-api-production-voice-agents-2026-9d4e861a6dcc
- GPT-4o mini text: $0.15/1M in, $0.60/1M out, cached $0.075; typical 1,000 in/2,000 out = ~$0.0013. Note LiteLLM lists deprecation Jan 14 2027 — use current cheap-class successor at same order of magnitude, verify at build time.
  https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/?ref=rojo.me ; https://models.litellm.ai/models/gpt-4o-mini
- Rate limits (live open): tiers Free/Build/Launch/Grow, $100/$500/$5,000/$200,000 per month; hard spend limit returns 429; limits org+project level, not per user; ramp rule +50% per 15 min above 1M TPM.
  https://developers.openai.com/api/docs/guides/rate-limits
- gpt-realtime-2.1 / mini per-model: Build 400 RPM / 200,000 TPM; Launch 10,000 / 4,000,000; Grow 20,000 / 15,000,000. gpt-live-1 concurrent sessions: Build 50, Launch 300, Grow 500.
  https://developers.openai.com/api/docs/models/gpt-realtime-2.1 ; https://lexicost.com/voice-agents/vendors/openai
- Pipecat vs LiveKit: both OSS Python; cascaded STT->LLM->TTS ~800ms-1.5s, S2S ~300-500ms; Pipecat transport-agnostic, Silero VAD + Smart Turn v3; LiveKit AgentSession, TurnDetector, dispatch/load balancing, SIP.
  https://sheerbit.com/pipecat-vs-livekit-agents/ ; https://github.com/sebduffy-prog/sebduffy/blob/HEAD/skills/voice-agents/realtime-voice-agent/SKILL.md
- LiveKit Cloud: $0.01/agent-session min; Build 5 concurrent agent sessions, Ship $50/mo 20, Scale $500/mo from 50 up to 600 on request.
  https://www.duplexcompute.com/research/livekit-pricing/ ; https://tradeswithai.com/guides/livekit-pricing/
