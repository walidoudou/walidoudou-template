const { readdirSync, watch } = require('fs');
const { join, basename } = require('path');
const { Collection } = require('discord.js');
const chokidar = require('chokidar');

class CommandManager {
    constructor(client) {
        this.client = client;
        this.commandsDir = join(__dirname, '../commands');
        this.loadedCommands = new Map();
        this.commandCount = 0;
        this.watcher = null;
    }

    async initialize() {
        await this.loadAllCommands();
        this.setupWatcher();
        return { commandCount: this.commandCount };
    }

    async loadAllCommands() {
        try {
            this.client.commands = new Collection();
            this.client.aliases = new Collection();
            this.commandCount = 0;

            const categories = readdirSync(this.commandsDir);
            
            for (const category of categories) {
                const categoryPath = join(this.commandsDir, category);
                const commands = readdirSync(categoryPath).filter(file => file.endsWith('.js'));
                
                for (const commandFile of commands) {
                    await this.loadCommand(category, commandFile);
                }
            }

            console.log('\x1b[36m%s\x1b[0m', `📁 Catégories chargées: ${categories.length}`);
            console.log('\x1b[36m%s\x1b[0m', `⚡ Commandes chargées: ${this.commandCount}`);
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors du chargement des commandes:', error);
            throw error;
        }
    }

    async loadCommand(category, commandFile) {
        const commandPath = join(this.commandsDir, category, commandFile);
        try {
            delete require.cache[require.resolve(commandPath)];
            const command = require(commandPath);

            if (!this.validateCommand(command)) {
                console.warn('\x1b[33m%s\x1b[0m', `⚠️ Commande invalide: ${commandFile}`);
                return false;
            }

            command.category = category;
            command.fileName = commandFile;

            this.client.commands.set(command.name, command);
            this.loadedCommands.set(commandPath, command);
            this.commandCount++;

            if (command.aliases && Array.isArray(command.aliases)) {
                command.aliases.forEach(alias => {
                    if (this.client.aliases.has(alias)) {
                        console.warn('\x1b[33m%s\x1b[0m', `⚠️ Alias en double '${alias}' pour la commande ${command.name}`);
                    } else {
                        this.client.aliases.set(alias, command.name);
                    }
                });
            }

            return true;
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', `❌ Erreur lors du chargement de ${commandFile}:`, error);
            return false;
        }
    }

    validateCommand(command) {
        const requiredProperties = ['name', 'description', 'execute'];
        return requiredProperties.every(prop => {
            const hasProperty = command.hasOwnProperty(prop);
            if (!hasProperty) {
                console.warn('\x1b[33m%s\x1b[0m', `⚠️ Propriété manquante: ${prop}`);
            }
            return hasProperty;
        });
    }

    setupWatcher() {
        this.watcher = chokidar.watch(this.commandsDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 100
            }
        });

        this.watcher
            .on('add', this.handleCommandAdd.bind(this))
            .on('change', this.handleCommandChange.bind(this))
            .on('unlink', this.handleCommandRemove.bind(this))
            .on('error', error => {
                console.error('\x1b[31m%s\x1b[0m', '❌ Erreur du watcher:', error);
            });
    }

    async handleCommandAdd(path) {
        const { category, commandFile } = this.getPathInfo(path);
        if (await this.loadCommand(category, commandFile)) {
            console.log('\x1b[32m%s\x1b[0m', `✓ Nouvelle commande détectée et chargée: ${commandFile}`);
        }
    }

    async handleCommandChange(path) {
        const { category, commandFile } = this.getPathInfo(path);
        const oldCommand = this.loadedCommands.get(path);

        if (oldCommand) {
            this.client.commands.delete(oldCommand.name);
            oldCommand.aliases?.forEach(alias => {
                if (this.client.aliases.get(alias) === oldCommand.name) {
                    this.client.aliases.delete(alias);
                }
            });
        }

        if (await this.loadCommand(category, commandFile)) {
            console.log('\x1b[32m%s\x1b[0m', `✓ Commande mise à jour: ${commandFile}`);
        }
    }

    handleCommandRemove(path) {
        const command = this.loadedCommands.get(path);
        if (command) {
            this.client.commands.delete(command.name);
            command.aliases?.forEach(alias => {
                if (this.client.aliases.get(alias) === command.name) {
                    this.client.aliases.delete(alias);
                }
            });
            this.loadedCommands.delete(path);
            this.commandCount--;
            console.log('\x1b[33m%s\x1b[0m', `⚠️ Commande supprimée: ${command.name}`);
        }
    }

    getPathInfo(path) {
        const relativePath = path.replace(this.commandsDir, '').slice(1);
        const parts = relativePath.split(/[\/\\]/);
        return {
            category: parts[0],
            commandFile: parts[1]
        };
    }

    shutdown() {
        if (this.watcher) {
            this.watcher.close();
        }
    }
}

module.exports = async (client) => {
    const manager = new CommandManager(client);
    const result = await manager.initialize();

    // Gérer la fermeture propre
    process.on('SIGINT', () => {
        manager.shutdown();
        process.exit(0);
    });

    return result;
};