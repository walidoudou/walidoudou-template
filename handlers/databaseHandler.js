const mongoose = require('mongoose');
const { EventEmitter } = require('events');

class DatabaseManager extends EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000;
        this.connectionTimeout = 10000;
        this.healthCheckInterval = null;
        this.models = new Map();
    }

    async initialize() {
        try {
            await this.connect();
            this.setupEventListeners();
            this.startHealthCheck();
            return { databaseStatus: 'connected' };
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur d\'initialisation de la base de données:', error);
            throw error;
        }
    }

    async connect() {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                connectTimeoutMS: this.connectionTimeout,
                heartbeatFrequencyMS: 30000,
                minPoolSize: 5,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });

            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.emit('connected');
            
            console.log('\x1b[32m%s\x1b[0m', '✓ Connecté à MongoDB avec succès');
            this.logConnectionInfo();
        } catch (error) {
            this.connectionState = 'error';
            this.emit('error', error);
            await this.handleConnectionError(error);
        }
    }

    setupEventListeners() {
        mongoose.connection.on('error', this.handleConnectionError.bind(this));
        mongoose.connection.on('disconnected', this.handleDisconnect.bind(this));
        mongoose.connection.on('reconnected', this.handleReconnect.bind(this));
        
        process.on('SIGINT', this.gracefulShutdown.bind(this));
        process.on('SIGTERM', this.gracefulShutdown.bind(this));

        // Événements personnalisés pour le monitoring
        mongoose.connection.on('fullsetup', () => {
            console.log('\x1b[36m%s\x1b[0m', '📊 Replica Set entièrement connecté');
        });

        mongoose.connection.on('all', () => {
            console.log('\x1b[36m%s\x1b[0m', '🌐 Toutes les connexions établies');
        });
    }

    async handleConnectionError(error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Erreur de connexion MongoDB:', error);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log('\x1b[33m%s\x1b[0m', `⚠️ Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            await new Promise(resolve => setTimeout(resolve, this.reconnectInterval));
            await this.connect();
        } else {
            console.error('\x1b[31m%s\x1b[0m', '❌ Nombre maximum de tentatives de reconnexion atteint');
            process.exit(1);
        }
    }

    async handleDisconnect() {
        this.connectionState = 'disconnected';
        console.log('\x1b[33m%s\x1b[0m', '⚠️ Déconnecté de MongoDB');
        this.emit('disconnected');
    }

    handleReconnect() {
        this.connectionState = 'connected';
        console.log('\x1b[32m%s\x1b[0m', '✓ Reconnecté à MongoDB');
        this.emit('reconnected');
    }

    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                if (this.connectionState === 'connected') {
                    const status = await mongoose.connection.db.admin().ping();
                    if (status.ok !== 1) {
                        throw new Error('La base de données ne répond pas');
                    }
                }
            } catch (error) {
                console.warn('\x1b[33m%s\x1b[0m', '⚠️ Échec du contrôle de santé:', error.message);
                this.emit('healthCheckFailed', error);
            }
        }, 30000);
    }

    logConnectionInfo() {
        const { host, port, name } = mongoose.connection;
        console.log('\x1b[36m%s\x1b[0m', '📊 Informations de connexion:');
        console.log('\x1b[36m%s\x1b[0m', `   Host: ${host}`);
        console.log('\x1b[36m%s\x1b[0m', `   Port: ${port}`);
        console.log('\x1b[36m%s\x1b[0m', `   Database: ${name}`);
        console.log('\x1b[36m%s\x1b[0m', `   État: ${mongoose.connection.readyState === 1 ? 'Connecté' : 'Déconnecté'}`);
    }

    async getCollectionStats() {
        try {
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log('\x1b[36m%s\x1b[0m', '📊 Statistiques des collections:');
            
            for (const collection of collections) {
                const stats = await mongoose.connection.db.collection(collection.name).stats();
                console.log('\x1b[36m%s\x1b[0m', `   ${collection.name}:`);
                console.log('\x1b[36m%s\x1b[0m', `      Documents: ${stats.count}`);
                console.log('\x1b[36m%s\x1b[0m', `      Taille: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            }
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors de la récupération des statistiques:', error);
        }
    }

    async gracefulShutdown() {
        console.log('\x1b[33m%s\x1b[0m', '⚠️ Arrêt gracieux de la connexion MongoDB...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        try {
            await mongoose.connection.close(false);
            console.log('\x1b[32m%s\x1b[0m', '✓ Connexion MongoDB fermée avec succès');
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Erreur lors de la fermeture de la connexion:', error);
        }

        process.exit(0);
    }
}

module.exports = async (client) => {
    const manager = new DatabaseManager(client);
    const result = await manager.initialize();

    // Expose le manager pour une utilisation ultérieure
    client.dbManager = manager;

    return result;
};