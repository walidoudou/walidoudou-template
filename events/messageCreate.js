const config = require('../config.json');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(client, message) {
        // Ignorer les messages des bots
        if (message.author.bot) return;
        
        // Vérifier si le message commence par le préfixe
        if (!message.content.startsWith(config.prefix)) return;

        // Extraire les arguments et le nom de la commande
        const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
        const commandName = args.shift().toLowerCase();

        // Rechercher la commande ou son alias
        const command = client.commands.get(commandName) || 
                       client.commands.get(client.aliases.get(commandName));
        
        // Si la commande n'existe pas, ne rien faire
        if (!command) return;

        try {
            await command.execute(client, message, args);
        } catch (error) {
            console.error(error);
            message.reply('Une erreur est survenue lors de l\'exécution de la commande.')
                .catch(console.error);
        }
    }
};