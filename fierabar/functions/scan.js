
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const base64Image = body.image.includes(',') ? body.image.split(',')[1] : body.image;

    // Cheia ta API de la Gemini
    const geminiApiKey = "AQ.Ab8RN6J1ioglaRpl9ueDU6iVRCnptPDvIBLEd_Qn1cvUnkIgg"; 

    const payload = {
      contents: [{
        parts: [
          { text: "Analizează acest tabel/factură. Extrage denumirea ingredientului, cantitatea și unitatea de măsură. Returnează STRICT un array JSON valid de forma: [{\"nume\": \"Nume Produs\", \"cantitate\": 100, \"um\": \"g\"}]. Nu folosi formatare markdown, întoarce exclusiv codul JSON." },
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
      throw new Error(data.error.message);
    }

    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    return new Response(rawText, {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
