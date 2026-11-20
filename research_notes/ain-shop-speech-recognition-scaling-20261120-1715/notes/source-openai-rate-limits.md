# OpenAI rate limits — verified live 2026-11-20
URL: https://developers.openai.com/api/docs/guides/rate-limits
- Tiers: Free $100/mo; Build $5 purchases -> $500/mo; Launch $100 -> $5,000/mo; Grow $500 -> $200,000/mo. Automatic upgrade as total credit purchases reach threshold.
- Limits org + project level, not per user/key.
- View: Settings > Organization > Limits; Upgrade tier in Usage Tiers section.
- Spend limits separate: alert vs hard limit (429). Enforcement not instantaneous.
- Ramp: >1M TPM increase no more than 50% per 15 min; slow_down 429 even within limits; 503 server_is_overloaded.
- Beyond Grow: Scale Tier (Enterprise, pre-GPT-5.6) / Reserved Tier (GPT-5.6+), via sales.
- gpt-realtime-2.1-mini page (verified live same day): https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini — audio $10/1M in, $20/1M out, text $0.60/$2.40; Build 400 RPM/200k TPM, Launch 10k/4M, Grow 20k/15M.
- gpt-live-1 concurrent sessions Build 50 / Launch 300 / Grow 500, $0.05/min + backend (via Fora Soft / Retell / Lexicost, not opened live).
- Realtime API: no published simultaneous-session cap since Feb 2025 (OpenAI blog).
