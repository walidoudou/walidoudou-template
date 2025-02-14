const { readdirSync, watch, existsSync } = require('fs');
const { join, basename } = require('path');
const chokidar = require('chokidar');

class EventManager {
    constructor(client) {
        this.client = client;
        // Modification du chemin pour utiliser le chemin absolu depuis la racine du projet
        this.eventsDir = join(process.cwd(), 'events');
        this.loadedEvents = new Map();
        this.eventCount = 0;
        this.watcher = null;
        this.boundEvents = new Map();
    }

    async initialize() {
        await this.loadAllEvents();
        this.setupWatcher();
        return { eventCount: this.eventCount };
    }

    async loadAllEvents() {
        try {
            console.log('📁 Dossier des événements:', this.eventsDir);
            
            if (!existsSync(this.eventsDir)) {
                console.error('❌ Le dossier des événements n\'existe pas!');
                return;
            }

            const eventFiles = readdirSync(this.eventsDir).filter(file => file.endsWith('.js'));
            console.log('📑 Fichiers trouvés:', eventFiles);
            
            for (const eventFile of eventFiles) {
                await this.loadEvent(eventFile);
            }

            console.log('\x1b[36m%s\x1b[0m', `📡 Événements chargés: ${this.eventCount}`);
            this.logEventDistribution();
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors du chargement des événements:', error);
            throw error;
        }
    }

    async loadEvent(eventFile) {
        const eventPath = join(this.eventsDir, eventFile);
        try {
            delete require.cache[require.resolve(eventPath)];
            const eventModule = require(eventPath);
            
            if (!this.validateEvent(eventModule)) {
                console.warn('\x1b[33m%s\x1b[0m', `⚠️ Structure d'événement invalide: ${eventFile}`);
                return false;
            }

            const { name, once, execute } = eventModule;

            if (this.boundEvents.has(name)) {
                this.client.removeListener(name, this.boundEvents.get(name));
            }

            const boundFunction = (...args) => execute(this.client, ...args);
            
            if (once) {
                this.client.once(name, boundFunction);
            } else {
                this.client.on(name, boundFunction);
            }
            
            this.boundEvents.set(name, boundFunction);
            this.loadedEvents.set(eventPath, { name, function: boundFunction });
            this.eventCount++;

            console.log('\x1b[32m%s\x1b[0m', `✓ Événement chargé: ${name}`);
            return true;
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', `❌ Erreur lors du chargement de ${eventFile}:`, error);
            return false;
        }
    }

    validateEvent(event) {
        return (
            event &&
            typeof event === 'object' &&
            typeof event.name === 'string' &&
            typeof event.execute === 'function'
        );
    }

    logEventDistribution() {
        const distribution = new Map();
        this.boundEvents.forEach((_, eventName) => {
            distribution.set(eventName, (distribution.get(eventName) || 0) + 1);
        });

        console.log('\x1b[36m%s\x1b[0m', '📊 Distribution des événements:');
        distribution.forEach((count, eventName) => {
            console.log('\x1b[36m%s\x1b[0m', `   ${eventName}: ${count} handler${count > 1 ? 's' : ''}`);
        });
    }

    setupWatcher() {
        this.watcher = chokidar.watch(this.eventsDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 100
            }
        });

        this.watcher
            .on('add', this.handleEventAdd.bind(this))
            .on('change', this.handleEventChange.bind(this))
            .on('unlink', this.handleEventRemove.bind(this))
            .on('error', error => {
                console.error('\x1b[31m%s\x1b[0m', '❌ Erreur du watcher:', error);
            });
    }

    async handleEventAdd(path) {
        const eventFile = basename(path);
        if (await this.loadEvent(eventFile)) {
            console.log('\x1b[32m%s\x1b[0m', `✓ Nouvel événement détecté et chargé: ${eventFile}`);
            this.logEventDistribution();
        }
    }

    async handleEventChange(path) {
        const eventFile = basename(path);
        const oldEvent = this.loadedEvents.get(path);

        if (oldEvent) {
            this.client.removeListener(oldEvent.name, oldEvent.function);
            this.boundEvents.delete(oldEvent.name);
            this.loadedEvents.delete(path);
            this.eventCount--;
        }

        if (await this.loadEvent(eventFile)) {
            console.log('\x1b[32m%s\x1b[0m', `✓ Événement mis à jour: ${eventFile}`);
            this.logEventDistribution();
        }
    }

    handleEventRemove(path) {
        const event = this.loadedEvents.get(path);
        if (event) {
            this.client.removeListener(event.name, event.function);
            this.boundEvents.delete(event.name);
            this.loadedEvents.delete(path);
            this.eventCount--;
            console.log('\x1b[33m%s\x1b[0m', `⚠️ Événement supprimé: ${event.name}`);
            this.logEventDistribution();
        }
    }

    shutdown() {
        if (this.watcher) {
            this.watcher.close();
        }
        this.boundEvents.forEach((handler, eventName) => {
            this.client.removeListener(eventName, handler);
        });
    }
}

module.exports = async (client) => {
    const manager = new EventManager(client);
    const result = await manager.initialize();

    process.on('SIGINT', () => {
        manager.shutdown();
        process.exit(0);
    });

    return result;
};