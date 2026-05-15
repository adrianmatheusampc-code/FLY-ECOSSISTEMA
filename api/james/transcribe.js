/* =====================================================================
   API · /api/james/transcribe
   Vercel Serverless Function — recebe áudio do mic e devolve texto
   transcrito via ElevenLabs Scribe (Speech-to-Text).

   POST /api/james/transcribe
     Content-Type: audio/webm | audio/mp4 | audio/wav | audio/mpeg | audio/ogg
     Body: bytes do áudio gravado pelo MediaRecorder do navegador

   Resposta JSON:
     { text: string, language_code: string, raw?: object }

   ENV:
     ELEVENLABS_API_KEY → chave secreta no servidor
   ===================================================================== */

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

// Lê o body como Buffer (Vercel serverless)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ELEVENLABS_API_KEY não configurada no servidor.' });
    return;
  }

  // Body é bytes brutos do áudio (não JSON)
  let audioBuffer;
  try {
    audioBuffer = await readRawBody(req);
  } catch (e) {
    res.status(400).json({ error: 'Falha ao ler body de áudio.' });
    return;
  }
  if (!audioBuffer || audioBuffer.length < 1024) {
    res.status(400).json({ error: 'Áudio vazio ou muito curto (<1KB).' });
    return;
  }
  if (audioBuffer.length > 25 * 1024 * 1024) {
    res.status(413).json({ error: 'Áudio muito grande (>25MB). Quebre em pedaços menores.' });
    return;
  }

  // Detecta MIME do header
  const mime = req.headers['content-type'] || 'audio/webm';
  const ext = mime.includes('mp4') ? 'mp4' :
              mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' :
              mime.includes('wav') ? 'wav' :
              mime.includes('ogg') ? 'ogg' :
              mime.includes('webm') ? 'webm' : 'webm';

  // Lê params opcionais via query string (modelo, language)
  const url = new URL(req.url, 'http://localhost');
  const modelId      = url.searchParams.get('model_id') || 'scribe_v1';
  const languageCode = url.searchParams.get('language_code') || 'por'; // pt-BR (ISO 639-3 = por)

  // Monta multipart/form-data manualmente (sem dep externa)
  const boundary = '----flyboundary' + Date.now().toString(36);
  const CRLF = '\r\n';
  const fileFieldHead =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}` +
    `Content-Type: ${mime}${CRLF}${CRLF}`;
  const modelField =
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model_id"${CRLF}${CRLF}` +
    modelId;
  const langField =
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="language_code"${CRLF}${CRLF}` +
    languageCode;
  const closeBoundary = `${CRLF}--${boundary}--${CRLF}`;

  const multipart = Buffer.concat([
    Buffer.from(fileFieldHead),
    audioBuffer,
    Buffer.from(modelField),
    Buffer.from(langField),
    Buffer.from(closeBoundary),
  ]);

  try {
    const upstream = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Accept':       'application/json',
      },
      body: multipart,
    });

    if (!upstream.ok) {
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 500); } catch (e) {}
      console.error('[james/transcribe] ElevenLabs error', upstream.status, detail);
      res.status(upstream.status).json({
        error: `ElevenLabs Scribe respondeu ${upstream.status}`,
        detail,
      });
      return;
    }

    const json = await upstream.json();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      text: String(json.text || '').trim(),
      language_code: json.language_code || languageCode,
      duration: json.duration || null,
      raw: { language_probability: json.language_probability || null },
    });
  } catch (err) {
    console.error('[james/transcribe] erro:', err?.message || err);
    res.status(502).json({
      error: 'Falha ao chamar ElevenLabs Scribe.',
      detail: String(err?.message || err).slice(0, 200),
    });
  }
};

// Vercel: desliga parsing automático do body (queremos bytes brutos)
module.exports.config = {
  api: { bodyParser: false },
};
