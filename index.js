require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const axios = require('axios');
const schedule = require('node-schedule');
const mongoose = require('mongoose');
const express = require('express');

// --- CONFIGURACIÓN ---

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const from = process.env.TWILIO_WHATSAPP_FROM;

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const mongoUri = process.env.MONGO_URI;

const phoneList  = [
  'whatsapp:+34647786463',
  'whatsapp:+34605158369',
  'whatsapp:+34615492318'
];

// --- MODELO MONGOOSE ---

const premiereSchema = new mongoose.Schema({
  date: Date,
  sentReminder1: { type: Boolean, default: false },
  sentReminder2: { type: Boolean, default: false }
});

const Premiere = mongoose.model('Premiere', premiereSchema);

// --- FUNCIONES ---

async function sendWhatsapps(texto) {
  for (const to of phoneList) {
    try {
      await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({ From: from, To: to, Body: texto }),
        { auth: { username: accountSid, password: authToken } }
      );
      console.log(`📤 Mensaje enviado a ${to}`);
    } catch (err) {
      console.error(`❌ Error enviando a ${to}:`, err.response?.data || err.message);
    }
  }
}

function programarReminders(premiere) {
  const now = new Date();

  const reminder1Time = new Date(premiere.date.getTime() - 2 * 60 * 60 * 1000);
  const reminder2Time = new Date(premiere.date.getTime() - 1 * 60 * 60 * 1000);

  // Reminder 1
  if (!premiere.sentReminder1 && reminder1Time > now) {
    schedule.scheduleJob(`reminder1-${premiere._id}`, reminder1Time, async () => {
      await sendWhatsapps(`¡Recordatorio! ⏰✨\n\n¡Hoy tenemos Premiere en 2 horas! 🎉🔥\n\nVe conectándote a Valorant 🎮 para calentar y organizar el equipo 💪👥\n\n¡Gracias! 🙌😊`);
      premiere.sentReminder1 = true;
      await premiere.save();
      console.log(`✅ Reminder 1 enviado para evento ${premiere._id}`);
    });
    console.log(`🗓️ Reminder 1 programado para ${reminder1Time}`);
  } else {
    if (premiere.sentReminder1) {
      console.log(`⏩ Reminder 1 ya fue enviado para evento ${premiere._id}`);
    } else {
      console.log(`⏳ Reminder 1 ya pasó (${reminder1Time}) para evento ${premiere._id}`);
    }
  }

  // Reminder 2
  if (!premiere.sentReminder2 && reminder2Time > now) {
    schedule.scheduleJob(`reminder2-${premiere._id}`, reminder2Time, async () => {
      await sendWhatsapps(`¡Date prisa! ⏰⚡\n\n¡Premiere en 1 hora! 🎉🔥\n\nConéctate ya a Valorant 🎮 para calentar motores y organizar el equipo 💪\n\n¡Nos vemos pronto! 🙌😊`);
      premiere.sentReminder2 = true;
      await premiere.save();
      console.log(`✅ Reminder 2 enviado para evento ${premiere._id}`);
    });
    console.log(`🗓️ Reminder 2 programado para ${reminder2Time}`);
  } else {
    if (premiere.sentReminder2) {
      console.log(`⏩ Reminder 2 ya fue enviado para evento ${premiere._id}`);
    } else {
      console.log(`⏳ Reminder 2 ya pasó (${reminder2Time}) para evento ${premiere._id}`);
    }
  }
}

async function registerCommands() {
  const commands = [
    {
      name: 'premiere',
      description: 'Programa recordatorios para la premiere',
      options: [
        {
          name: 'fecha',
          description: 'Fecha del evento (YYYY-MM-DD)',
          type: 3,
          required: true,
        },
        {
          name: 'hora',
          description: 'Hora del evento (HH:mm, 24h)',
          type: 3,
          required: true,
        },
      ],
    },
  ];

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('🔧 Registrando comandos slash...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ Comandos registrados correctamente.');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
}

// --- CLIENTE DISCORD ---

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`🤖 Bot listo como ${client.user.tag}`);

  // Conexión a MongoDB
  try {
    await mongoose.connect(mongoUri);
    console.log('🟢 Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  }

  await registerCommands();

  // 🧹 Limpieza de eventos pasados (opcional)
  await Premiere.deleteMany({ date: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });

  // Cargar premieres pendientes
  const pendientes = await Premiere.find({
    date: { $gte: new Date() },
    $or: [{ sentReminder1: false }, { sentReminder2: false }]
  });

  for (const premiere of pendientes) {
    programarReminders(premiere);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'premiere') {
    const fecha = interaction.options.getString('fecha'); // YYYY-MM-DD
    const hora = interaction.options.getString('hora');   // HH:mm

    const fechaEvento = new Date(`${fecha}T${hora}:00`);

    if (isNaN(fechaEvento)) {
      await interaction.reply({ content: '❌ Fecha u hora inválida. Usa formato YYYY-MM-DD para fecha y HH:mm para hora.', ephemeral: true });
      return;
    }
    if (fechaEvento <= new Date()) {
      await interaction.reply({ content: '⚠️ La fecha y hora deben ser en el futuro.', ephemeral: true });
      return;
    }

    const nuevaPremiere = new Premiere({
      date: fechaEvento,
      sentReminder1: false,
      sentReminder2: false,
    });

    await nuevaPremiere.save();
    programarReminders(nuevaPremiere);

    await interaction.reply(`✅ Evento programado para **${fechaEvento.toLocaleString()}**.\nRecordatorios configurados para 2 horas y 1 hora antes.`);
  }
});

client.login(token);

// --- EXPRESS KEEP-ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor Express en puerto ${PORT}`));