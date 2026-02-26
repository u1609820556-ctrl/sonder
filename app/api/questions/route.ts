import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Song {
  name: string;
  artist: string;
}

export async function POST(request: NextRequest) {
  try {
    const { songs } = await request.json();

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json({ error: 'Se requieren canciones' }, { status: 400 });
    }

    const songList = songs.map((s: Song) => `"${s.name}" de ${s.artist}`).join(', ');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en psicología musical y taste profiling. Recibes una lista de canciones que le gustan al usuario.

FASE 1 — ANÁLISIS INTERNO (nunca lo muestres al usuario):
Analiza las canciones en dos capas:

Técnica (40%):
Identifica los elementos sonoros que definen ESTAS canciones específicas:
- Densidad sonora: ¿cuántos elementos conviven? ¿hay espacio o está todo lleno?
- Dinámica: ¿varía la energía dentro de la canción o es constante?
- Textura: ¿es rugosa, suave, fría, cálida, orgánica, sintética?
- Construcción: ¿crece, explota, se contiene, se repite hipnóticamente?
- Voz: ¿es el centro o un instrumento más? ¿cómo se relaciona con la música?
- Producción: ¿suena íntima o épica, cruda o pulida, antigua o contemporánea?

Emocional/narrativa (60%):
- Emoción nuclear: específica y matizada. No "tristeza" sino "la tristeza de algo que ya pasó y que sabes que no vuelve". No "euforia" sino "la euforia de sentirte invencible sabiendo que es momentáneo".
- Contradicción emocional: ¿hay dos emociones en tensión? Alegría con melancolía, calma con inquietud, fuerza con vulnerabilidad.
- Imagen o lugar: si esta canción fuera un lugar o momento del día, ¿cuál sería? Específico — no "noche" sino "las 3am en un coche parado mirando las luces de la ciudad".
- Narrativa implícita: ¿qué historia cuenta o sugiere sin decirla?
- Tensión subyacente: ¿qué fuerza o conflicto interno recorre la canción?
- Patrón entre canciones: ¿qué tienen en común emocionalmente que no es obvio? La conexión profunda, no la superficial.

FASE 2 — GENERA 3 PREGUNTAS SITUACIONALES:
Progresivas:
- Pregunta 1: sobre el MOMENTO o contexto de escucha
- Pregunta 2: sobre el ESTADO EMOCIONAL que busca
- Pregunta 3: sobre el RESULTADO que quiere sentir al acabar

Reglas:
- Exploran POR QUÉ le gustan, no QUÉ son técnicamente
- Suenan como las haría un amigo que entiende mucho de música, no un algoritmo
- NUNCA mencionan género, BPM, tempo, instrumentación ni jerga técnica
- Nunca dos preguntas exploran la misma dimensión
- Se adaptan específicamente al análisis — no son genéricas

Opciones (4 reales + 1 abierta):
- Registros MUY distintos: una directa/práctica, una evocadora/metafórica, una física/sensorial, una social/contextual
- Evocadoras — que el usuario sienta algo al leerlas
- Sin adjetivos musicales
- Al menos una debe provocar "sí, eso es exactamente"
- La quinta siempre: "Otra cosa: ___"

Devuelve SOLO este JSON:
{
  "analysis": "[análisis interno completo — nunca mostrado al usuario]",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "...", "Otra cosa: ___"]
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Canciones seleccionadas: ${songList}`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content || '{"analysis":"","questions":[]}');

    const analysis = parsed.analysis || '';
    let questions = parsed.questions || [];

    questions = questions.map((q: { id?: number; question?: string; text?: string; options?: string[] }, index: number) => ({
      id: q.id || index + 1,
      text: q.question || q.text || '',
      options: q.options || [],
    }));

    return NextResponse.json({ analysis, questions });
  } catch (error) {
    console.error('Questions error:', error);
    return NextResponse.json({ error: 'Error al generar preguntas' }, { status: 500 });
  }
}
