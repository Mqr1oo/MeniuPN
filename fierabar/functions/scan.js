export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    
    if (!body || !body.image) {
      return new Response(JSON.stringify({ error: "Lipsește imaginea în format base64." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const base64Image = body.image.includes(',') ? body.image.split(',')[1] : body.image;
    const geminiApiKey = context.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      throw new Error("Lipsește cheia API în setările Cloudflare (GEMINI_API_KEY).");
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

    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Eroare Google API (Status: ${response.status})`);
    }

    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error("Răspuns gol sau blocat de la Gemini");
    }

    // Curățare avansată markdown
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Extragere sigură a array-ului JSON în cazul în care modelul include text adițional
    const firstBracket = rawText.indexOf('[');
    const lastBracket = rawText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      rawText = rawText.substring(firstBracket, lastBracket + 1);
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (jsonErr) {
      throw new Error("Eroare de structură JSON primită de la AI.");
    }

    if (!Array.isArray(parsedJson)) {
      throw new Error("Răspunsul AI nu respectă formatul de tabel așteptat.");
    }

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
