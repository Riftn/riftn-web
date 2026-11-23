# Riftn translation quality and cost

## What the audit found

The web text components and mobile translation service use the Supabase `translate-text` function. The NestJS `/translate` route is separate. The reviewed web and mobile text clients do not call it. The route uses MyMemory alone, returns the original on provider failure or for text over its length cutoff, and caches that result as success. Check route traffic before deciding whether to retire it or make it a client of the shared translation pipeline.

| Failure mode | Change in this patch |
| --- | --- |
| Long and mixed-language posts could be translated as unrelated 500-byte fragments. A matching prefix could mark an entire post as already translated. | Send the whole text to a model, increase the reserved output limit for the longest bodies, and reject responses flagged as incomplete. |
| Shared memory could run on ambiguous text or translate a dialect into a different language variety. The private path also reached it. | Require public text, a known source, an allowlisted standard language pair and a 500-byte maximum for MyMemory. Keep private requests in a separate server cache namespace. |
| Near-copy output could be cached as a confident same-language result. Older results survived both on the server and on readers’ devices. | Reject suspect rewrites without assigning a language. Skip legacy segmented and synthetic no-op rows on read, retain eligible public translations, and rotate the web and mobile device cache keys. |
| Complete-looking outputs could drop or change links, handles, hashtags and cashtags. Free provider telemetry could count rejected output as accepted. | Validate exact protected tokens, including duplicates, before recording provider success or caching. Try the next eligible provider on rejection. |
| Traditional Chinese variants could resolve to generic Chinese or be skipped by the browser’s script check. | Resolve Traditional Chinese aliases to the correct model prompt and stop inferring that Han characters already match that preference. |

GPT-6 Luna is the first paid route after cache lookups and eligible free providers. It runs without reasoning and uses the existing attempt budget, completion checks and usage meter. The function uses `OPENAI_API_KEY` from its Edge environment when present and otherwise reads Riftn’s existing `openai_api_key` from Supabase Vault through a service-role-only lookup. The Gemini route handles requests when the key is absent, OpenAI is unavailable or Luna's output fails validation. Existing valid cache entries continue to serve repeat requests.

The audit covers product text translation. Image OCR, captions, transcripts and dubbing have separate quality and billing paths. Production logs, provider invoices and complaint samples were not available for this audit. The highest-impact language pairs and actual dollar change remain unmeasured.

## Recommended rollout

1. **Measure the current pipeline.** Build a 300-example, de-identified evaluation set from reported failures and the highest-volume language pairs. Include comments, public live chat, long posts, slang, code-switching, Dialectal Arabic, Nigerian Pidgin, Traditional Chinese, mixed scripts, negation and protected tokens. Have two bilingual reviewers grade meaning, tone, completeness and target language without seeing the provider. Keep a holdout set for the final decision.
2. **Validate Luna per language and use case.** Compare Luna with the previous Gemini route and Claude Haiku 5.5. Prefer the least expensive route that meets the quality bar. Use a stronger model for cohorts where reviewers see a material improvement or when the primary response fails validation. Verify provider data terms and account settings for private text before production rollout.
3. **Canary the shared function before refreshing clients.** Start in staging, then enable for a small production cohort before opening to everyone. Retain the server work lease, provider cooldowns, and daily and bulk limits. Deploy the web device-cache change after the shared endpoint, and ship the mobile cache change in the next app release. Avoid a fleet-wide cache prefill. If an item’s translation is wrong, invalidate that source-target entry and regenerate once on demand.
4. **Gate expansion on quality, reliability and cost.** Proposed starting gates are zero critical meaning, wrong-language or link errors on the holdout, at least 95% acceptable translations on high-volume pairs, improved quality in the complaint cohorts, p95 latency within 10% of the baseline, and completion rate within one percentage point. Agree a cost ceiling per 1,000 accepted translations against the baseline before opening the canary. Break out manual versus automatic traffic. Track per-provider rejection and fallback rates, cache hits, provider attempts per miss, token usage, `503` and budget responses, and cost per 1,000 accepted translations. Add a “Report translation” action and review reports by language pair. Keep raw private text out of aggregate telemetry.
5. **Tune spend where the measurements point.** Start with the existing device budgets and viewport scheduling. Restrict automatic translation on noisy cohorts if quality or budget still suffers. Prefer exact-text caching for repeat reads and reuse existing flags to keep bulk locale generation in its own allowance. Meter cache misses, paid retries, and provider-model mix before lowering any daily cap or committing to a new vendor. Check legacy `/translate` traffic and confirm its replacement path before routing any callers.

## Cost model

Use accepted translations as the denominator. For each paid provider, multiply metered input and output tokens by their unit prices, include rejected attempts and fallbacks, and reconcile the result with invoices. Track character-based providers separately. Post views and provider call counts alone cannot explain the bill.

Illustrative monthly costs assume 1M eligible requests, a 90% cache hit rate, 100k misses reaching one paid provider, and 400 input tokens including the prompt and 100 billed output tokens per miss. Cloud NMT uses a separate assumption of 400 source characters per miss. These are planning assumptions, with fallback, reasoning beyond the assumed output, platform and storage charges excluded.

| Provider | Published unit prices in USD | Example monthly provider charge |
| --- | --- | --- |
| OpenAI GPT-6 Luna | $0.10 per million input tokens and $0.50 per million output tokens | $9 |
| Claude Haiku 5.5 | $0.10 per million input tokens for short prompts and $0.50 per million output tokens | $9 |
| Gemini 3.1 Flash-Lite | $0.25 per million text input tokens and $1.50 per million output tokens | $25 |
| Gemini 3.5 Flash-Lite | $0.30 per million text input tokens and $2.50 per million output tokens | $37 |
| Google Cloud Translation NMT | $20 per million characters after the first 500k monthly credit | $790 |

Pricing based on published standard rates. [OpenAI API pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Cloud Translation pricing](https://cloud.google.com/products/translate/pricing), [MyMemory API limits](https://mymemory.translated.net/doc/spec.php)
