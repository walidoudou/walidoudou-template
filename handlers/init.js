const { version: discordVersion } = require('discord.js');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class Logger {
    static colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        blue: '\x1b[34m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m'
    };

    static log(message, color = 'cyan') {
        const colorCode = this.colors[color] || this.colors.reset;
        console.log(`${colorCode}${message}${this.colors.reset}`);
    }

    static success(message) { this.log(`✓ ${message}`, 'green'); }
    static error(message) { this.log(`✗ ${message}`, 'red'); }
    static warn(message) { this.log(`⚠ ${message}`, 'yellow'); }
    static info(message) { this.log(`ℹ ${message}`, 'blue'); }
}

class ConsoleManager {
    constructor(client) {
        this.client = client;
        this.startTime = Date.now();
        this.commands = 0;
        this.events = 0;
        this.restartFlag = path.join(process.cwd(), 'tmp_restart');
    }

    formatBytes(bytes) {
        const sizes = ['o', 'Ko', 'Mo', 'Go'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    formatUptime() {
        const uptime = Date.now() - this.startTime;
        const seconds = Math.floor(uptime / 1000) % 60;
        const minutes = Math.floor(uptime / 1000 / 60) % 60;
        const hours = Math.floor(uptime / 1000 / 60 / 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    showStatus() {
        console.clear();
        console.log('\n' + '═'.repeat(50));
        Logger.info(' BOT INFOS');
        console.log('═'.repeat(50) + '\n');

        const memory = this.formatBytes(process.memoryUsage().heapUsed);
        const uptime = this.formatUptime();

        Logger.info(`• Discord.js : v${discordVersion}`);
        Logger.info(`• Node.js    : ${process.version}`);
        Logger.info(`• Mémoire    : ${memory}`);
        Logger.info(`• Uptime     : ${uptime}\n`);

        Logger.success(`• Commandes  : ${this.commands}`);
        Logger.success(`• Événements : ${this.events}\n`);

        Logger.warn('Commandes disponibles dans la console :');
        Logger.log('• restart : Redémarre le bot');
        Logger.log('• clear   : Nettoie la console\n');
    }

    async restart() {
        Logger.warn('Redémarrage du bot...');
        
        try {
            // Détruire proprement le client Discord
            if (this.client) {
                await this.client.destroy();
            }

            // Redémarrer le processus dans la même fenêtre
            process.on('exit', () => {
                require('child_process').spawn(
                    process.argv.shift(),
                    process.argv,
                    {
                        cwd: process.cwd(),
                        stdio: 'inherit'
                    }
                );
            });
            process.exit();
        } catch (error) {
            Logger.error('Erreur lors du redémarrage.');
            console.error(error);
        }
    }

    setupCommands() {
        // Nettoyer le fichier de redémarrage au démarrage
        if (fs.existsSync(this.restartFlag)) {
            fs.unlinkSync(this.restartFlag);
        }

        process.stdin.on('data', async (data) => {
            const command = data.toString().trim().toLowerCase();
            
            switch (command) {
                case 'restart':
                    await this.restart();
                    break;

                case 'clear':
                    this.showStatus();
                    break;

                default:
                    if (command) {
                        Logger.error('Commande inconnue. Utilisez restart ou clear.');
                    }
            }
        });
    }

    async loadHandler(name) {
        try {
            const result = await require(`./${name}Handler`)(this.client);
            Logger.success(`${name}Handler chargé`);
            
            if (name === 'command') this.commands = result?.commandCount || 0;
            if (name === 'event') this.events = result?.eventCount || 0;

            return result;
        } catch (error) {
            Logger.error(`Erreur ${name}Handler: ${error.message}`);
            return null;
        }
    }

    async initialize() {
        try {
            Logger.info('Initialisation du bot...\n');

            const handlers = ['command', 'event', 'database', 'anticrash'];
            for (const handler of handlers) {
                await this.loadHandler(handler);
            }

            this.showStatus();
            this.setupCommands();

            return { status: 'ready' };
        } catch (error) {
            Logger.error('Erreur fatale lors de l\'initialisation.');
            console.error(error);
            process.exit(1);
        }
    }
}

module.exports = async (client) => {
    const manager = new ConsoleManager(client);
    return await manager.initialize();
};