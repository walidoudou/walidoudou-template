# 🚀 Bot Discord - Installation & Configuration

## 📌 Prérequis

Avant de commencer, assure-toi d'avoir installé :
- [Node.js](https://nodejs.org/) (version 16+ recommandée)
- [MongoDB](https://www.mongodb.com/) (si utilisé)
- Un bot Discord avec un token [via le Portail des développeurs Discord](https://discord.com/developers/applications)

## 📥 Installation

1. Clone le dépôt :
   ```bash
   git clone https://github.com/walidoudou/walidoudou-template
   cd walidoudou-template
   ```

2. Installe les dépendances :
   ```bash
   npm install
   ```

## ⚙️ Configuration

1. Ouvre le fichier `config.json` et configure les valeurs :
   ```json
    {
        "prefix": "&",
        "colors": "RANDOM",
        "owners": ["ton_id"],
        "status": "la phrase de statut"
    }
   ```
2. Ajoute ton bot au serveur avec le lien d'invitation généré depuis le Portail Discord.

## 🚀 Lancer le bot

### En local
```bash
npm run start
```

## 🔧 Structure du bot

Ce bot utilise une architecture modulaire avec les gestionnaires suivants :
- **commandHandler** : Gère les commandes du bot.
- **eventHandler** : Gère les événements Discord.
- **databaseHandler** : Gestion des interactions avec MongoDB.
- **antiCrash** : Protection contre les erreurs et crashs.

## 🔧 Commandes utiles

- **Démarrer le bot** : `npm run start`

## 🛠 Déploiement

Si tu veux déployer ton bot sur un VPS :
1. Installe [PM2](https://pm2.keymetrics.io/):
   ```bash
   npm install -g pm2
   ```
2. Démarre le bot avec PM2 :
   ```bash
   pm2 start index.js --name "mon-bot"
   ```
3. Sauvegarde le processus PM2 :
   ```bash
   pm2 save
   ```

## 📜 Licence
Ce projet est sous licence MIT. Tu es libre de l'utiliser et de le modifier à ta guise.

