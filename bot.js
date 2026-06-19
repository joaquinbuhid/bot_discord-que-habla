require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
//const { Configuration, OpenAIApi } = require('openai');

const { GoogleGenAI } = require('@google/genai');
// Inicializa Gemini usando la API key de tu archivo .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const { speakInVoiceChannel } = require('./tts');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,  // <-- necesario para voz
  ],
});

client.once('ready', () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith("pipitin ")) return;
  const prompt = message.content.slice(5).trim();
  const question = message.content.slice(8).trim();  // "pipitin " = 8 chars
  if (!question) return;
// LOGICA DE GEMINI:


  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return message.reply('Tenés que estar en un canal de voz para recibir la respuesta en audio.');
  }

  await message.reply('Generando respuesta...');
  try{
  // ── Generar texto con Gemini ────────────────────────────────────────────
  const textResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',   // ← podés cambiar el modelo aquí
    contents: [{ parts: [{ text: question }] }],
    config: {
    maxOutputTokens: 1000,   // ~4000 caracteres en español
    systemInstruction: 'Respondé de forma concisa, en no más de 200 palabras.',
  },
  });

  const respuesta = textResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!respuesta) throw new Error('Gemini no devolvió texto.');

  // Responder en el canal de texto también (opcional)
  await message.channel.send(`**Respuesta:** ${respuesta}`);

  // ── Reproducir en canal de voz con Gemini TTS ──────────────────────────
  await speakInVoiceChannel(respuesta, voiceChannel);
  } catch (error) {
	console.error("error con gemini:", error);
	message.reply("hubo un error al procesar tu petición.");
	}
});



// try {
    // const response = await ai.models.generateContent({
        // model: 'gemini-2.5-flash', // El modelo más rápido y recomendado para bots
        // contents: message.content,  // El texto que el usuario envió en Discord
    // });

    // // Responder en Discord con el texto generado por Gemini
    // message.reply(response.text);
// } catch (error) {
    // console.error("Error con Gemini:", error);
    // message.reply("Hubo un error al procesar tu petición.");
// }

	//LOGICA DE GPT:
  // try {
    // const completion = await openai.createChatCompletion({
      // model: "gpt-4", // o "gpt-3.5-turbo"
      // messages: [{ role: "user", content: prompt }]
    // });

    // const reply = completion.data.choices[0].message.content;
    // message.reply(reply.substring(0, 2000)); // Discord tiene límite de 2000 caracteres por mensaje
  // } catch (error) {
    // console.error(error);
    // message.reply("❌ Error al consultar ChatGPT");
  // }
//});

client.login(process.env.DISCORD_BOT_TOKEN);
