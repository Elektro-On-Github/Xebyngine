/**
 * E2EE Browser Module
 * Gestisce la crittografia end-to-end lato client
 * - Generazione e salvataggio chiavi RSA nel browser (IndexedDB)
 * - Crittografia/decrittografia messaggi
 * - Gestione della cronologia E2EE
 */

const E2EE = {
    // Configurazione
    DB_NAME: 'XebyngineE2EE',
    STORE_NAME: 'keys',
    KEY_SIZE: 4096,
    
    // Stato
    initialized: false,
    userPublicKeys: {}, // Cache chiavi pubbliche (userId -> publicKeyPem)
    myPrivateKey: null,
    myPublicKey: null,
    db: null,
    
    /**
     * Inizializza il modulo E2EE
     * - Apre IndexedDB
     * - Carica o genera le chiavi personali
     */
    async init() {
        console.log('🔐 Inizializzando E2EE...');
        
        try {
            // Apri IndexedDB
            await this.openDB();
            
            // Controlla se abbiamo già le chiavi
            const hasKeys = await this.hasStoredKeys();
            
            if (hasKeys) {
                console.log('🔑 Chiavi trovate nel browser');
                await this.loadStoredKeys();
            } else {
                console.log('🆕 Generando nuove chiavi...');
                await this.generateAndSaveKeys();
            }
            
            this.initialized = true;
            console.log('✓ E2EE inizializzato');
            return true;
        } catch (error) {
            console.error('✗ Errore inizializzazione E2EE:', error);
            return false;
        }
    },
    
    /**
     * Apre o crea il database IndexedDB
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
        });
    },
    
    /**
     * Controlla se le chiavi sono già salvate
     */
    hasStoredKeys() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get('privateKey');
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(!!request.result);
            };
        });
    },
    
    /**
     * Carica le chiavi dal database
     */
    loadStoredKeys() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const privReq = store.get('privateKey');
            const pubReq = store.get('publicKey');
            
            let privateKey = null;
            let publicKey = null;
            let completed = 0;
            
            privReq.onerror = () => reject(privReq.error);
            privReq.onsuccess = () => {
                privateKey = privReq.result;
                completed++;
                if (completed === 2) {
                    this.myPrivateKey = privateKey;
                    this.myPublicKey = publicKey;
                    resolve();
                }
            };
            
            pubReq.onerror = () => reject(pubReq.error);
            pubReq.onsuccess = () => {
                publicKey = pubReq.result;
                completed++;
                if (completed === 2) {
                    this.myPrivateKey = privateKey;
                    this.myPublicKey = publicKey;
                    resolve();
                }
            };
        });
    },
    
    /**
     * Genera una nuova coppia RSA 4096 lato client con Web Crypto API
     * La chiave privata NON esce mai dal browser
     */
    async generateAndSaveKeys() {
        try {
            console.log('🔐 Generando coppia RSA-4096 lato client...');
            
            // Genera coppia con Web Crypto API (4096-bit RSA con OAEP)
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'RSA-OAEP',
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([1, 0, 1]), // 65537
                    hash: 'SHA-256'
                },
                true, // extractable: true solo per salvare nel browser
                ['encrypt', 'decrypt'] // usiamo encrypt per la pubblica, decrypt per la privata
            );
            
            // Esporta la chiave privata in PKCS8
            const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            const privateKeyPem = this.bufferToPrivateKeyPem(privateKeyBuffer);
            
            // Esporta la chiave pubblica in SPKI
            const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
            const publicKeyPem = this.bufferToPublicKeyPem(publicKeyBuffer);
            
            // Salva nel browser (IndexedDB)
            await this.saveKeysToDB(privateKeyPem, publicKeyPem);
            
            this.myPrivateKey = privateKeyPem;
            this.myPublicKey = publicKeyPem;
            
            console.log('✓ Chiavi RSA-4096 generate lato client e salvate in IndexedDB');
            
            // Invia SOLO la chiave pubblica al server (per gli altri utenti)
            await this.sendPublicKeyToServer(publicKeyPem);
            
            console.log('✓ Chiave pubblica inviata al server');
        } catch (error) {
            console.error('✗ Errore nella generazione delle chiavi:', error);
            throw error;
        }
    },
    
    /**
     * Converti ArrayBuffer della chiave privata in PEM format
     */
    bufferToPrivateKeyPem(buffer) {
        const base64 = this.arrayBufferToBase64(buffer);
        // Aggiungi header e footer PEM per chiave privata PKCS8
        return `-----BEGIN PRIVATE KEY-----\n${this.chunkString(base64, 64).join('\n')}\n-----END PRIVATE KEY-----`;
    },
    
    /**
     * Converti ArrayBuffer della chiave pubblica in PEM format
     */
    bufferToPublicKeyPem(buffer) {
        const base64 = this.arrayBufferToBase64(buffer);
        // Aggiungi header e footer PEM per chiave pubblica SPKI
        return `-----BEGIN PUBLIC KEY-----\n${this.chunkString(base64, 64).join('\n')}\n-----END PUBLIC KEY-----`;
    },
    
    /**
     * Dividi una stringa in chunk di N caratteri
     */
    chunkString(str, chunkSize) {
        const chunks = [];
        for (let i = 0; i < str.length; i += chunkSize) {
            chunks.push(str.substr(i, chunkSize));
        }
        return chunks;
    },
    
    /**
     * Salva le chiavi in IndexedDB
     */
    saveKeysToDB(privateKey, publicKey) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            const privReq = store.put(privateKey, 'privateKey');
            const pubReq = store.put(publicKey, 'publicKey');
            
            privReq.onerror = () => reject(privReq.error);
            pubReq.onerror = () => reject(pubReq.error);
            
            let completed = 0;
            privReq.onsuccess = () => {
                completed++;
                if (completed === 2) resolve();
            };
            pubReq.onsuccess = () => {
                completed++;
                if (completed === 2) resolve();
            };
        });
    },
    
    /**
     * Invia la chiave pubblica al server
     */
    async sendPublicKeyToServer(publicKey) {
        const response = await fetch('/api/e2ee/save-public-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
            },
            body: JSON.stringify({ public_key: publicKey })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.error || 'Errore salvataggio chiave pubblica');
        }
    },
    
    /**
     * Recupera la chiave pubblica di un utente
     */
    async getPublicKey(userId) {
        // Controlla cache
        if (this.userPublicKeys[userId]) {
            return this.userPublicKeys[userId];
        }
        
        try {
            const response = await fetch(`/api/e2ee/get-public-key/${userId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            const publicKey = data.public_key;
            
            // Salva in cache
            this.userPublicKeys[userId] = publicKey;
            return publicKey;
        } catch (error) {
            console.error(`✗ Errore caricamento chiave pubblica per ${userId}:`, error);
            return null;
        }
    },
    
    /**
     * Critta un messaggio con HYBRID ENCRYPTION (AES-256-GCM + RSA-4096-OAEP)
     * 1. Genera chiave AES-256 casuale
     * 2. Critta messaggio con AES-256-GCM
     * 3. Critta la chiave AES con RSA pubblica destinatario
     */
    async encryptMessage(plainText, recipientId) {
        try {
            // Ottieni chiave pubblica del destinatario
            const publicKeyPem = await this.getPublicKey(recipientId);
            if (!publicKeyPem) {
                throw new Error('Impossibile ottenere la chiave pubblica del destinatario');
            }
            
            // Step 1: Genera chiave AES-256 casuale
            const aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true, // extractable
                ['encrypt', 'decrypt']
            );
            
            // Esporta la chiave AES per crittarla con RSA
            const aesKeyBuffer = await crypto.subtle.exportKey('raw', aesKey);
            
            // Step 2: Critta il messaggio con AES-256-GCM
            const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV per GCM
            const encoder = new TextEncoder();
            const plainBuffer = encoder.encode(plainText);
            
            const cipherBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                aesKey,
                plainBuffer
            );
            
            // Step 3: Critta la chiave AES con RSA-OAEP (chiave pubblica destinatario)
            const publicKey = await this.importPublicKey(publicKeyPem);
            
            const encryptedAesKey = await crypto.subtle.encrypt(
                {
                    name: 'RSA-OAEP',
                    hash: 'SHA-256'
                },
                publicKey,
                aesKeyBuffer
            );
            
            // Step 4: Combina in payload JSON e ritorna base64
            const hybridPayload = {
                aes_key: this.arrayBufferToBase64(encryptedAesKey),
                iv: this.arrayBufferToBase64(iv),
                ciphertext: this.arrayBufferToBase64(cipherBuffer)
            };
            
            const jsonString = JSON.stringify(hybridPayload);
            const encryptedBase64 = btoa(jsonString);
            
            return encryptedBase64;
        } catch (error) {
            console.error('✗ Errore crittografia:', error);
            throw error;
        }
    },
    
    /**
     * Decritto un messaggio con HYBRID ENCRYPTION (AES-256-GCM + RSA-4096-OAEP)
     * 1. Decritterà la chiave AES con RSA privata personale
     * 2. Decritterà il messaggio con AES-256-GCM
     */
    async decryptMessage(encryptedBase64) {
        try {
            if (!this.myPrivateKey) {
                throw new Error('Chiave privata non disponibile');
            }
            
            // Step 1: Decodifica il payload JSON
            const jsonString = atob(encryptedBase64);
            const hybridPayload = JSON.parse(jsonString);
            
            // Step 2: Carica i dati
            const encryptedAesKey = this.base64ToArrayBuffer(hybridPayload.aes_key);
            const iv = this.base64ToArrayBuffer(hybridPayload.iv);
            const cipherBuffer = this.base64ToArrayBuffer(hybridPayload.ciphertext);
            
            // Step 3: Decritterà la chiave AES con la chiave privata RSA
            const privateKey = await this.importPrivateKey(this.myPrivateKey);
            
            const aesKeyBuffer = await crypto.subtle.decrypt(
                {
                    name: 'RSA-OAEP',
                    hash: 'SHA-256'
                },
                privateKey,
                encryptedAesKey
            );
            
            // Step 4: Importa la chiave AES
            const aesKey = await crypto.subtle.importKey(
                'raw',
                aesKeyBuffer,
                { name: 'AES-GCM', length: 256 },
                false, // non extractable
                ['decrypt']
            );
            
            // Step 5: Decritterà il messaggio con AES-256-GCM
            const plainBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                aesKey,
                cipherBuffer
            );
            
            // Step 6: Converti in stringa
            const decoder = new TextDecoder();
            return decoder.decode(plainBuffer);
        } catch (error) {
            console.error('✗ Errore decrittografia:', error);
            throw error;
        }
    },
    
    /**
     * Importa una chiave pubblica PEM
     */
    async importPublicKey(pem) {
        const binaryString = atob(pem.split('\n').slice(1, -2).join(''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return crypto.subtle.importKey(
            'spki',
            bytes.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['encrypt']
        );
    },
    
    /**
     * Importa una chiave privata PEM
     */
    async importPrivateKey(pem) {
        const binaryString = atob(pem.split('\n').slice(1, -2).join(''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return crypto.subtle.importKey(
            'pkcs8',
            bytes.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['decrypt']
        );
    },
    
    /**
     * Converti ArrayBuffer a base64
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },
    
    /**
     * Converti base64 a ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    /**
     * Salva un messaggio inviato in IndexedDB (testo in chiaro)
     * Usa uno store separato 'sent_messages' per evitare confusione
     */
    async saveSentMessage(recipientId, messageId, plainText) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            // Salva sotto chiave "sent_{messageId}" per essere identificabile
            const key = `sent_${messageId}`;
            const req = store.put(plainText, key);
            
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
        });
    },

    /**
     * Carica un messaggio inviato dalla cache locale
     */
    async loadSentMessage(messageId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            
            const key = `sent_${messageId}`;
            const req = store.get(key);
            
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                resolve(req.result || null);
            };
        });
    }
};

// Inizializza E2EE al caricamento della pagina
document.addEventListener('DOMContentLoaded', () => {
    E2EE.init().catch(err => console.error('Errore init E2EE:', err));
});
