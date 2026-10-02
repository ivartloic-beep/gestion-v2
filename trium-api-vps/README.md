# Trium API - Déploiement sur le VPS

API Node.js pour le scraping Trium via Puppeteer + Browserless.

## Prérequis

- Browserless déjà lancé sur le VPS (port 3000)
- Node.js 18+ sur le VPS

## Déploiement

### 1. Copier les fichiers sur le VPS

**Via FileZilla (SFTP) :**
- Hôte : `217.182.171.182`
- Port : `22`
- Identifiant : `root`
- Créer le dossier `/root/trium-api` sur le VPS
- Copier : `server.js`, `package.json`

**Via SCP (PowerShell, depuis la racine du projet) :**
```powershell
scp -r trium-api-vps root@217.182.171.182:/root/
```
Puis sur le VPS : `cd /root/trium-api-vps`

### 2. Sur le VPS

```bash
cd /root/trium-api-vps   # ou /root/trium-api si créé manuellement
npm install
node server.js
```

### 3. Lancer en arrière-plan (PM2)

```bash
npm install -g pm2
pm2 start server.js --name trium-api
pm2 save
pm2 startup   # pour démarrage automatique au reboot
```

## Configuration

- **Port** : 3100 (modifiable via `PORT=3200 node server.js`)
- **Browserless** : `wss://browserless.lcoproduction.fr?token=TriumBrowser2025` (modifiable via variable d'environnement `BROWSERLESS_WS`)

Si le token Browserless est différent :
```bash
BROWSERLESS_WS="wss://browserless.lcoproduction.fr?token=VOTRE_TOKEN" node server.js
```

## URL de l'API

- **Scrape** : `POST http://votre-vps:3100/scrape`
- **Health** : `GET http://votre-vps:3100/health`

Body JSON pour POST /scrape :
```json
{
  "triumUser1": "ticketnet",
  "triumPass1": "mot_de_passe_1",
  "triumUser2": "identifiant_trium",
  "triumPass2": "mot_de_passe_trium"
}
```

## Pare-feu

Si l'app OVH (PHP) doit appeler l'API depuis l'extérieur, ouvrir le port 3100 sur le VPS :
```bash
ufw allow 3100
ufw reload
```
