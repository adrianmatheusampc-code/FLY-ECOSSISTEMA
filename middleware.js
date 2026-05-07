// Vercel Edge Middleware · proteção HTTP Basic Auth na URL
// User configura SITE_USER e SITE_PASS nas Environment Variables da Vercel.
// Antes de qualquer página carregar, o navegador pergunta usuário/senha.
//
// Configuração:
//   1) Vercel → Project → Settings → Environment Variables
//      Add: SITE_USER  (ex: adrian)
//      Add: SITE_PASS  (senha forte)
//   2) Trigger redeploy (qualquer push novo já vale)
//
// Pra DESLIGAR a proteção: apaga ou esvazia SITE_USER e SITE_PASS no painel.

export const config = {
  // Protege todas as rotas EXCETO assets internos da Vercel.
  matcher: '/((?!_vercel|_next/static|favicon.ico).*)',
};

export default function middleware(request) {
  const user = (typeof process !== 'undefined' && process.env && process.env.SITE_USER) || '';
  const pass = (typeof process !== 'undefined' && process.env && process.env.SITE_PASS) || '';

  // Se nenhuma credencial está configurada, libera (modo dev / sem proteção)
  if (!user || !pass) {
    return; // pass-through
  }

  const auth = request.headers.get('authorization') || '';
  const expected = 'Basic ' + btoa(user + ':' + pass);

  if (auth === expected) {
    return; // pass-through (autenticado)
  }

  return new Response('Acesso restrito — FLY ECOSSISTEMA', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="FLY ECOSSISTEMA · Acesso Restrito", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
