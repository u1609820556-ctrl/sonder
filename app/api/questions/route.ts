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

FASE 1 — ANÁLISIS INTERNO (no lo muestres al usuario nunca):
Analiza las canciones en dos capas:

Técnica (40%): tempo, energía, estructura sonora, era de producción, prominencia vocal.
Adapta qué aspectos priorizas según el género — en clásica prioriza estructura compositiva e intención del compositor, en rap prioriza flow y narrativa lírica, en electrónica prioriza textura y construcción sonora.

Emocional/narrativa (60%): emoción predominante y si es simple o contradictoria, qué imagen o momento evoca, qué tensión subyacente conecta las canciones, el patrón no obvio entre ellas.

FASE 2 — GENERA 3 PREGUNTAS SITUACIONALES:
Basándote en el análisis, genera 3 preguntas que:
- Exploren POR QUÉ le gustan esas canciones, no QUÉ son técnicamente
- Sean situacionales o emocionales — sobre cómo se siente el usuario, para qué momento es la música, qué busca que le dé
- Suenen como las haría un amigo que entiende mucho de música, no un algoritmo
- NUNCA mencionen género, BPM, tempo, instrumentación ni jerga técnica musical
- Se adapten al tipo de música detectado — no uses las mismas preguntas para clásica que para rap

Cada pregunta tiene 4 opciones concretas y evocadoras + campo abierto (5 en total).

REGLAS para las opciones:
- Evocadoras, no descriptivas — que el usuario sienta algo al leerlas
- Nunca uses adjetivos musicales como "energético", "tranquilo", "melódico"
- La quinta opción siempre es: "Otra cosa: ___"

REGLAS ADICIONALES para las opciones:
- Genera SIEMPRE 4 opciones reales + 1 campo abierto (5 en total por pregunta)
- Las 4 opciones deben tener registros MUY distintos entre sí — no pueden sonar al mismo tono emocional
- Una opción debe ser directa y práctica, otra evocadora/metafórica, otra física/sensorial, otra social o contextual
- Adapta el registro general al género detectado: si es rap sé más directo y urbano, si es clásica puedes ser más evocador, si es pop sé más cotidiano, si es electrónica más sensorial
- Evita que las 4 opciones sean variaciones del mismo concepto con distinta intensidad
- Las opciones deben provocar que el usuario piense "sí, eso es exactamente" en al menos una de ellas

Ejemplo de opciones MAL diferenciadas (evitar):
"Una noche tranquila" / "Un momento de paz" / "Calma interior" / "Serenidad"

Ejemplo de opciones BIEN diferenciadas (buscar):
"Para desconectar yo solo" / "Para un viaje largo en coche" / "Para cuando algo no sale de mi cabeza" / "Para compartir con alguien sin tener que hablar"

EJEMPLOS del tipo correcto (úsalos como inspiración, no como plantilla):
- "¿Para qué momento es esta playlist?" → "Para cuando necesito desconectar del mundo" / "Para cuando voy a por todas" / "Para ese estado en que no sé lo que siento" / "Para un rato con gente sin presión de hablar"
- "¿Cómo quieres sentirte cuando termine la última canción?" → "Como si hubiera procesado algo" / "Con ganas de repetirla entera" / "Como si el tiempo hubiera pasado sin darme cuenta" / "Con el cuerpo más ligero"
- "Estas canciones te recuerdan a algo. ¿A qué?" → "Una época específica de mi vida" / "Un lugar o ambiente concreto" / "Una persona o relación" / "Una sensación física, como conducir de noche"

Devuelve SOLO este JSON, sin texto adicional:
{
  "analysis": "[análisis interno completo — usado para generar la playlist, NUNCA mostrado al usuario]",
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
