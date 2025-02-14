const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

module.exports = {
    name: 'ping',
    aliases: ['latency'],
    description: 'Affiche la latence du bot',
    async execute(client, message, args) {
        // Message initial pour calculer la latence
        const initialMessage = await message.reply('Calcul de la latence en cours...');
        
        // Calcul de la latence du bot
        const botLatency = initialMessage.createdTimestamp - message.createdTimestamp;
        
        // Calcul de la latence de l'API Discord
        const apiLatency = Math.round(client.ws.ping);
        
        // Calcul de la latence MongoDB avec l'URI du .env
        let dbLatency;
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error('URI MongoDB non configurée');
            }

            const startTime = Date.now();
            // Utiliser une nouvelle connexion temporaire pour le test
            const mongoClient = await mongoose.connect(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 5000, // Timeout après 5 secondes
                connectTimeoutMS: 5000
            });
            
            await mongoClient.connection.db.admin().ping();
            dbLatency = Date.now() - startTime;
            
            // Fermer la connexion temporaire
            await mongoose.disconnect();
        } catch (error) {
            console.error('Erreur MongoDB:', error);
            dbLatency = 'Non connecté';
        }

        // Création de l'embed
        const embed = new EmbedBuilder()
            .setColor('#2f3136')
            .setAuthor({ 
                name: 'Latence du système', 
                iconURL: client.user.displayAvatarURL() 
            })
            .setDescription('Voici les différentes mesures de latence du système')
            .addFields([
                {
                    name: '⚡ Latence du Bot',
                    value: `\`${botLatency}ms\``,
                    inline: true
                },
                {
                    name: '🌐 Latence de l\'API',
                    value: `\`${apiLatency}ms\``,
                    inline: true
                },
                {
                    name: '🔋 Latence MongoDB',
                    value: `\`${typeof dbLatency === 'number' ? `${dbLatency}ms` : dbLatency}\``,
                    inline: true
                }
            ])
            .setFooter({ 
                text: `Demandé par ${message.author.username}`,
                iconURL: message.author.displayAvatarURL()
            })
            .setTimestamp();

        // Ajout d'un indicateur de performance
        const getStatusEmoji = (latency) => {
            if (typeof latency !== 'number') return '⚪';
            if (latency < 100) return '🟢';
            if (latency < 200) return '🟡';
            return '🔴';
        };

        // Mise à jour du message avec l'embed
        initialMessage.edit({
            content: `${getStatusEmoji(botLatency)} **Statut du système**`,
            embeds: [embed]
        });
    }
};