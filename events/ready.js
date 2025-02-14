const config = require('../config.json');

module.exports = {
    name: 'ready',
    once: true, // L'événement ready ne doit être exécuté qu'une seule fois
    execute(client) {
        console.log(`${client.user.tag} est connecté!`);
        
        // Configuration du statut et de l'activité du bot
        client.user.setPresence({
            activities: [{
                name: config.status || 'En ligne',
                type: 0 // 0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching, 4 = Custom, 5 = Competing
            }],
            status: 'online' // online, idle, dnd, invisible
        });
    }
};