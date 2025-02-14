const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class CrashManager extends EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.errorLog = path.join(process.cwd(), 'logs', 'errors.log');
        this.crashThreshold = 5;
        this.crashCount = 0;
        this.crashTimeWindow = 60000; // 1 minute
        this.lastCrashTime = Date.now();
        this.warningThreshold = 3;
        this.debugMode = process.env.DEBUG === 'true';
        this.errorPatterns = new Map();
    }

    async initialize() {
        await this.ensureLogDirectory();
        this.setupEventHandlers();
        this.startPerformanceMonitoring();
        console.log('\x1b[32m%s\x1b[0m', '✓ Système anti-crash initialisé');
        return { status: 'initialized' };
    }

    async ensureLogDirectory() {
        const logDir = path.dirname(this.errorLog);
        try {
            await fs.access(logDir);
        } catch {
            await fs.mkdir(logDir, { recursive: true });
        }
    }

    setupEventHandlers() {
        // Gestion des rejets de promesses non gérés
        process.on('unhandledRejection', async (reason, promise) => {
            const errorInfo = this.formatErrorInfo('Unhandled Rejection', reason);
            await this.handleError(errorInfo);
            this.analyzeCrashPattern(errorInfo);
        });

        // Gestion des exceptions non capturées
        process.on('uncaughtException', async (error) => {
            const errorInfo = this.formatErrorInfo('Uncaught Exception', error);
            await this.handleError(errorInfo);
            this.analyzeCrashPattern(errorInfo);

            if (this.shouldRestartProcess()) {
                await this.gracefulRestart();
            }
        });

        // Surveillance des exceptions
        process.on('uncaughtExceptionMonitor', async (error) => {
            const errorInfo = this.formatErrorInfo('Exception Monitor', error);
            await this.handleError(errorInfo);
        });

        // Gestion de la mémoire
        process.on('warning', async (warning) => {
            if (warning.name === 'MemoryWarning') {
                await this.handleMemoryWarning(warning);
            }
        });

        // Surveillance des déconnexions Discord
        this.client.on('shardDisconnect', async (event, shardId) => {
            const errorInfo = this.formatErrorInfo('Shard Disconnect', { shardId, event });
            await this.handleError(errorInfo);
        });

        // Erreurs WebSocket
        this.client.on('error', async (error) => {
            const errorInfo = this.formatErrorInfo('WebSocket Error', error);
            await this.handleError(errorInfo);
        });
    }

    formatErrorInfo(type, error) {
        return {
            timestamp: new Date().toISOString(),
            type,
            message: error?.message || 'Pas de message d\'erreur',
            stack: error?.stack || new Error().stack,
            additional: {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                pid: process.pid
            }
        };
    }

    async handleError(errorInfo) {
        const formattedError = this.formatErrorForLog(errorInfo);
        
        console.error('\x1b[31m%s\x1b[0m', `❌ ${errorInfo.type}:`);
        console.error('\x1b[31m%s\x1b[0m', formattedError);

        await this.logError(formattedError);
        this.updateCrashMetrics();
        this.emit('error', errorInfo);
    }

    formatErrorForLog(errorInfo) {
        return `[${errorInfo.timestamp}] ${errorInfo.type}\n` +
               `Message: ${errorInfo.message}\n` +
               `Stack: ${errorInfo.stack}\n` +
               `Memory: ${JSON.stringify(errorInfo.additional.memory)}\n` +
               `Uptime: ${errorInfo.additional.uptime}s\n` +
               `PID: ${errorInfo.additional.pid}\n` +
               '-'.repeat(80);
    }

    async logError(formattedError) {
        try {
            await fs.appendFile(this.errorLog, formattedError + '\n');
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors de l\'écriture dans le fichier de log:', error);
        }
    }

    updateCrashMetrics() {
        const currentTime = Date.now();
        if (currentTime - this.lastCrashTime > this.crashTimeWindow) {
            this.crashCount = 1;
        } else {
            this.crashCount++;
        }
        this.lastCrashTime = currentTime;

        if (this.crashCount >= this.warningThreshold) {
            console.warn('\x1b[33m%s\x1b[0m', `⚠️ Attention: ${this.crashCount} crashs détectés dans la dernière minute`);
        }
    }

    analyzeCrashPattern(errorInfo) {
        const errorSignature = errorInfo.message;
        const currentCount = this.errorPatterns.get(errorSignature) || 0;
        this.errorPatterns.set(errorSignature, currentCount + 1);

        if (currentCount + 1 >= this.warningThreshold) {
            console.warn('\x1b[33m%s\x1b[0m', `⚠️ Motif d'erreur récurrent détecté: ${errorSignature}`);
        }
    }

    shouldRestartProcess() {
        return this.crashCount >= this.crashThreshold;
    }

    async gracefulRestart() {
        console.log('\x1b[33m%s\x1b[0m', '⚠️ Redémarrage gracieux du processus...');
        
        try {
            await this.client.destroy();
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors de la déconnexion du client Discord:', error);
        }

        process.exit(1); // Le processus sera redémarré par le gestionnaire de processus
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

            if (heapUsedPercentage > 85) {
                console.warn('\x1b[33m%s\x1b[0m', `⚠️ Utilisation élevée de la mémoire: ${heapUsedPercentage.toFixed(2)}%`);
                this.emit('highMemoryUsage', memoryUsage);
            }

            if (this.debugMode) {
                this.logPerformanceMetrics(memoryUsage);
            }
        }, 30000);
    }

    async handleMemoryWarning(warning) {
        const warningInfo = this.formatErrorInfo('Memory Warning', warning);
        await this.handleError(warningInfo);
        global.gc && global.gc(); // Appel explicite du garbage collector si disponible
    }

    logPerformanceMetrics(memoryUsage) {
        console.log('\x1b[36m%s\x1b[0m', '📊 Métriques de performance:');
        console.log('\x1b[36m%s\x1b[0m', `   Heap utilisé: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log('\x1b[36m%s\x1b[0m', `   Heap total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log('\x1b[36m%s\x1b[0m', `   RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    }
}

// Dans votre fichier anticrashHandler.js ou similaire
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

module.exports = async (client) => {
    const manager = new CrashManager(client);
    const result = await manager.initialize();

    client.crashManager = manager;
    return result;
};