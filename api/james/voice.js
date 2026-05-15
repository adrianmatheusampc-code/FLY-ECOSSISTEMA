/* =====================================================================
   API · /api/james/voice
   Vercel Serverless Function (vanilla, sem framework)

   POST /api/james/voice
     body:    { text: string, voice_id?: string, model_id?: string }
     return:  audio/mpeg (mp3) com a voz oficial do James via ElevenLabs

   ENVIRONMENT VARIABLES (configurar no Vercel + .env.local):
     ELEVENLABS_API_KEY   → chave secreta da ElevenLabs
     ELEVENLABS_VOICE_ID  → voice id do James (default fallback no body)

   SEGURANÇA:
     - Chave nunca sai do servidor
     - CORS limitado (mas Vercel já isola por padrão)
     - Sem cache server-side (browser pode cachear via Cache-Control)
   ===================================================================== */

const ELEVENLABS_TTS_URL = (voiceId) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';

const DEFAULT_VOICE_SETTINGS = {
  stability:        0.45,
  similarity_boost: 0.85,
  style:            0.35,
  use_speaker_boost: true,
};

module.exports = async function handler(req, res) {
  // ── Método ──
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  // ── Lê body ──
  // Em Vercel functions tradicionais, req.body já vem parseado se Content-Type=json
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const text = String(body.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'Campo "text" é obrigatório no body.' });
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({ error: 'Texto muito longo (max 1500 chars).' });
    return;
  }

  // ── Lê env ──
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = String(body.voice_id || process.env.ELEVENLABS_VOICE_ID || '').trim();
  const modelId = String(body.model_id || DEFAULT_MODEL_ID).trim();

  if (!apiKey) {
    res.status(500).json({ error: 'ELEVENLABS_API_KEY não configurada no servidor.' });
    return;
  }
  if (!voiceId) {
    res.status(500).json({ error: 'ELEVENLABS_VOICE_ID não configurado e voice_id não enviado.' });
    return;
  }

  // ── Chama ElevenLabs ──
  try {
    const upstream = await fetch(ELEVENLABS_TTS_URL(voiceId), {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...(body.voice_settings || {}) },
      }),
    });

    if (!upstream.ok) {
      // Tenta extrair detalhe do erro pra logar (sem propagar segredos)
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 500); } catch (e) {}
      console.error('[james/voice] ElevenLabs error', upstream.status, detail);
      res.status(upstream.status).json({
        error: `ElevenLabs respondeu ${upstream.status}`,
        upstream: upstream.status,
        detail: detail || null,
      });
      return;
    }

    // ── Stream do áudio de volta ──
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type',  'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    // Browser pode cachear o mesmo trecho — economiza chamadas
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).send(buf);
  } catch (err) {
    console.error('[james/voice] erro inesperado:', err?.message || err);
    res.status(502).json({
      error: 'Falha ao chamar ElevenLabs.',
      detail: String(err?.message || err).slice(0, 200),
    });
  }
};
