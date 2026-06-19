// tts.js — Gemini TTS + discord.js canal de voz
//
// Instalación:
//   npm install @google/genai @discordjs/voice @discordjs/opus ffmpeg-static
//
// Variable de entorno requerida:
//   GEMINI_API_KEY=tu_api_key_de_google

const { GoogleGenAI } = require('@google/genai');
const { Readable } = require('stream');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─────────────────────────────────────────────
// Gemini TTS devuelve PCM raw (16-bit LE, 24000 Hz, mono).
// Esta función le agrega el encabezado WAV para que ffmpeg
// (y discord) puedan leerlo correctamente.
// ─────────────────────────────────────────────
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const byteRate    = sampleRate * channels * (bitDepth / 8);
  const blockAlign  = channels * (bitDepth / 8);
  const dataSize    = pcmBuffer.length;
  const wav         = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');

  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);          // Subchunk1Size (PCM)
  wav.writeUInt16LE(1, 20);           // AudioFormat: PCM = 1
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitDepth, 34);

  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);

  return wav;
}

/**
 * Genera audio con Gemini TTS y lo reproduce en el canal de voz del usuario.
 * El bot se une al canal, habla y se desconecta al terminar.
 *
 * @param {string} text                            - Texto a convertir en voz
 * @param {import('discord.js').VoiceChannel} voiceChannel - Canal de voz destino
 */
async function speakInVoiceChannel(text, voiceChannel) {
  // ── 1. Llamar a Gemini TTS ──────────────────────────────────────────────
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede',  // ← cambiá la voz aquí (ver lista al final)
          },
        },
      },
    },
  });

  // ── 2. Decodificar audio ────────────────────────────────────────────────
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('Gemini TTS no devolvió audio.');

  const pcmBuffer   = Buffer.from(base64Audio, 'base64');
  const wavBuffer   = pcmToWav(pcmBuffer);          // PCM → WAV con encabezado
  const audioStream = Readable.from(wavBuffer);

  // ── 3. Unirse al canal de voz ───────────────────────────────────────────
  const connection = joinVoiceChannel({
    channelId:       voiceChannel.id,
    guildId:         voiceChannel.guild.id,
    adapterCreator:  voiceChannel.guild.voiceAdapterCreator,
    selfDeaf:        false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

  // ── 4. Reproducir ───────────────────────────────────────────────────────
  const player   = createAudioPlayer();
  const resource = createAudioResource(audioStream, {
    inputType: StreamType.Arbitrary,  // ffmpeg convierte WAV → opus para Discord
  });

  connection.subscribe(player);
  player.play(resource);

  // ── 5. Desconectar al terminar ──────────────────────────────────────────
  //await entersState(player, AudioPlayerStatus.Idle, 60_000);
  //connection.destroy();
}

module.exports = { speakInVoiceChannel };

// ─────────────────────────────────────────────────────────────
// VOCES DISPONIBLES — cambiá 'voiceName' arriba por cualquiera:
//
//  Zephyr   Puck      Charon    Kore     Fenrir    Leda
//  Orus     Aoede     Callirrhoe Autonoe Enceladus Iapetus
//  Umbriel  Algieba   Despina   Erinome Algenib   Rasalgethi
//  Laomedeia Achernar Alnilam   Schedar Gacrux    Pulcherrima
//  Achird   Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat
//
// Escuchalas en: https://aistudio.google.com/generate-speech
// ─────────────────────────────────────────────────────────────