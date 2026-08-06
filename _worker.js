export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Daca request-ul este catre /scan, rulam logica AI pentru factura
    if (url.pathname === '/scan' && request.method === 'POST') {
      try {
        const body = await request.json();
        const base64Image = body.image.includes(',') ? body.image.split(',')[1] : body.image;

        const geminiApiKey = env.GEMINI_API_KEY;

        if (!geminiApiKey) {
          return new Response(JSON.stringify({ error: "Lipsește cheia API în setările Cloudflare." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const payload = {
          contents: [{
            parts: [
              { text: "Analizează acest tabel sau această factură. Extrage denumirea produsului/ingredientului, cantitatea și prețul dacă există. Returnează STRICT un array JSON valid de forma: [{\"nume\": \"Nume Produs\", \"cantitate\": \"10 kg\", \"pret\": \"50 RON\"}]. Nu folosi formatare markdown, întoarce exclusiv textul JSON pur." },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
          return new Response(JSON.stringify({ error: data.error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          return new Response(JSON.stringify({ error: "Răspuns gol de la Gemini" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedJson = JSON.parse(rawText);

        return new Response(JSON.stringify(parsedJson), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Pentru orice alta ruta (HTML, CSS, JS), servim fisierele statice din folderul ./fierabar
    return env.ASSETS.fetch(request);
  }
};
